import { describe, it, expect, vi } from 'vitest';
import {
    activityId,
    diffSnapshots,
    fetchSnapshot,
    getRepoIdentity,
    isReadyToMerge,
    type DashboardPr,
    type DashboardSnapshot,
} from '../electron/github/notifications';
import type { GhRunner } from '../electron/github/gh';

// A PR node as the dashboard GraphQL query returns it.
function gqlPr(overrides: Record<string, unknown> = {}) {
    return {
        id: 'PR_1',
        number: 1,
        title: 'Add notifications',
        url: 'https://github.com/o/r/pull/1',
        isDraft: false,
        state: 'OPEN',
        merged: false,
        closedAt: null,
        createdAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-21T00:00:00Z',
        isCrossRepository: false,
        additions: 10,
        deletions: 2,
        mergeable: 'MERGEABLE',
        reviewDecision: null,
        author: { login: 'me' },
        mergedBy: null,
        baseRefName: 'main',
        headRefName: 'feat/x',
        latestReviews: { nodes: [] },
        commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
        ...overrides,
    };
}

function gqlResponse(data: Record<string, unknown>) {
    return JSON.stringify({
        data: {
            viewer: { login: 'me' },
            review: { nodes: [] },
            mineOpen: { nodes: [] },
            mineClosed: { nodes: [] },
            allOpen: { nodes: [] },
            merged: { nodes: [] },
            ...data,
        },
    });
}

// The latestReviews connection for reviewers r0, r1, ... with the given states.
function reviews(states: string[]) {
    return {
        nodes: states.map((state, i) => ({ id: `R${i}`, state, author: { login: `r${i}` } })),
    };
}

// The head commit connection with a check rollup.
function rollup(state: string, contexts: object[] = []) {
    return {
        nodes: [{ commit: { statusCheckRollup: { state, contexts: { nodes: contexts } } } }],
    };
}

function runnerReturning(stdout: string) {
    return vi.fn<GhRunner>(async () => ({ stdout, stderr: '' }));
}

function runnerFailing(error: object) {
    return vi.fn<GhRunner>(async () => {
        throw error;
    });
}

// A normalized PR, for the diff tests.
function pr(overrides: Partial<DashboardPr> = {}): DashboardPr {
    return {
        id: 'PR_1',
        number: 1,
        title: 'Add notifications',
        url: 'https://github.com/o/r/pull/1',
        author: 'me',
        isDraft: false,
        state: 'OPEN',
        mergedBy: '',
        baseRefName: 'main',
        headRefName: 'feat/x',
        isCrossRepository: false,
        createdAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-21T00:00:00Z',
        closedAt: '',
        additions: 10,
        deletions: 2,
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        ci: 'pending',
        failedChecks: [],
        reviews: [],
        ...overrides,
    };
}

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
    return {
        login: 'me',
        repo: 'o/r',
        fetchedAt: '2026-10-26T00:00:00Z',
        toReview: [],
        mine: [],
        failureNotified: [],
        ...overrides,
    };
}

describe('getRepoIdentity', () => {
    it('returns the owner/name gh resolves from the remotes', async () => {
        const run = runnerReturning('{"nameWithOwner":"o/r"}');
        const result = await getRepoIdentity('/repo', run);

        expect(result).toEqual({ status: 'ok', repo: 'o/r' });
        expect(run).toHaveBeenCalledWith(['repo', 'view', '--json', 'nameWithOwner'], '/repo');
    });

    it('reports a missing gh as not-installed', async () => {
        const result = await getRepoIdentity('/repo', runnerFailing({ code: 'ENOENT' }));
        expect(result.status).toBe('not-installed');
        expect(result.repo).toBeNull();
    });

    it('reports a repository without a GitHub remote', async () => {
        const run = runnerFailing({
            stderr: 'none of the git remotes configured for this repository point to a known GitHub host',
        });
        expect((await getRepoIdentity('/repo', run)).status).toBe('not-a-github-repo');
    });

    it('does not run gh without a repository', async () => {
        const run = runnerReturning('');
        expect((await getRepoIdentity('', run)).status).toBe('not-a-github-repo');
        expect(run).not.toHaveBeenCalled();
    });
});

describe('fetchSnapshot', () => {
    const now = new Date('2026-10-26T12:00:00Z');

    it('scopes every search to the repository and the closed window', async () => {
        const run = runnerReturning(gqlResponse({}));
        await fetchSnapshot('/repo', 'o/r', now, run);

        const args = run.mock.calls[0]![0];
        expect(args.slice(0, 2)).toEqual(['api', 'graphql']);
        expect(args).toContain(
            'review=repo:o/r is:pr is:open archived:false user-review-requested:@me'
        );
        expect(args).toContain('mineOpen=repo:o/r is:pr is:open author:@me');
        expect(args).toContain(
            'mineClosed=repo:o/r is:pr is:closed author:@me closed:>=2026-10-19'
        );
        expect(args).toContain('allOpen=repo:o/r is:pr is:open archived:false');
        expect(args).toContain('merged=repo:o/r is:pr is:merged merged:>=2026-09-25');
        // Merged PRs skip the reviews and checks, which made the query time out.
        const query = args.find((arg) => arg.startsWith('query='))!;
        expect(query).toContain(
            'merged: search(query: $merged, type: ISSUE, first: 100) { nodes { ...MergedPr } }'
        );
        expect(query.slice(query.indexOf('fragment MergedPr'))).not.toContain('statusCheckRollup');
    });

    it('normalizes the review requests and the viewer’s PRs', async () => {
        const run = runnerReturning(
            gqlResponse({
                review: { nodes: [gqlPr({ id: 'PR_9', number: 9, author: { login: 'ann' } })] },
                mineOpen: { nodes: [gqlPr()] },
            })
        );
        const { status, snapshot: snap } = await fetchSnapshot('/repo', 'o/r', now, run);

        expect(status).toBe('ok');
        expect(snap).toMatchObject({ login: 'me', repo: 'o/r', fetchedAt: now.toISOString() });
        expect(snap!.toReview.map((p) => p.number)).toEqual([9]);
        expect(snap!.open).toEqual([]);
        expect(snap!.merged).toEqual([]);
        expect(snap!.mine[0]).toMatchObject({
            number: 1,
            author: 'me',
            state: 'OPEN',
            ci: 'none',
            mergeable: 'MERGEABLE',
            reviewDecision: '',
        });
    });

    it('derives the review decision from the latest reviews when GitHub leaves it empty', async () => {
        const run = runnerReturning(
            gqlResponse({
                mineOpen: {
                    nodes: [
                        gqlPr({ id: 'A', number: 1, latestReviews: reviews(['APPROVED']) }),
                        gqlPr({
                            id: 'B',
                            number: 2,
                            latestReviews: reviews(['APPROVED', 'CHANGES_REQUESTED']),
                        }),
                        gqlPr({ id: 'C', number: 3, latestReviews: reviews(['COMMENTED']) }),
                        gqlPr({ id: 'D', number: 4, reviewDecision: 'REVIEW_REQUIRED' }),
                    ],
                },
            })
        );
        const { snapshot: snap } = await fetchSnapshot('/repo', 'o/r', now, run);

        expect(snap!.mine.map((p) => p.reviewDecision)).toEqual([
            'APPROVED',
            'CHANGES_REQUESTED',
            '',
            'REVIEW_REQUIRED',
        ]);
    });

    it('maps the check rollup to a CI state with the failed check names', async () => {
        const run = runnerReturning(
            gqlResponse({
                mineOpen: {
                    nodes: [
                        gqlPr({
                            id: 'A',
                            number: 1,
                            commits: rollup('FAILURE', [
                                {
                                    __typename: 'CheckRun',
                                    name: 'lint',
                                    status: 'COMPLETED',
                                    conclusion: 'FAILURE',
                                },
                                {
                                    __typename: 'CheckRun',
                                    name: 'test',
                                    status: 'COMPLETED',
                                    conclusion: 'SUCCESS',
                                },
                                {
                                    __typename: 'StatusContext',
                                    context: 'ci/legacy',
                                    state: 'ERROR',
                                },
                            ]),
                        }),
                        gqlPr({ id: 'B', number: 2, commits: rollup('SUCCESS') }),
                        gqlPr({ id: 'C', number: 3, commits: rollup('PENDING') }),
                        gqlPr({ id: 'D', number: 4, commits: rollup('EXPECTED') }),
                    ],
                },
            })
        );
        const { snapshot: snap } = await fetchSnapshot('/repo', 'o/r', now, run);

        expect(snap!.mine.map((p) => p.ci)).toEqual(['failing', 'passing', 'pending', 'pending']);
        expect(snap!.mine[0]!.failedChecks).toEqual(['lint', 'ci/legacy']);
    });

    it('merges the open and closed searches without duplicates and marks merged PRs', async () => {
        const run = runnerReturning(
            gqlResponse({
                mineOpen: { nodes: [gqlPr({ id: 'A', number: 1 })] },
                mineClosed: {
                    nodes: [
                        gqlPr({ id: 'A', number: 1, state: 'CLOSED' }),
                        gqlPr({
                            id: 'B',
                            number: 2,
                            state: 'MERGED',
                            merged: true,
                            mergedBy: { login: 'ann' },
                        }),
                        gqlPr({ id: 'C', number: 3, state: 'CLOSED' }),
                    ],
                },
            })
        );
        const { snapshot: snap } = await fetchSnapshot('/repo', 'o/r', now, run);

        expect(snap!.mine.map((p) => [p.number, p.state, p.mergedBy])).toEqual([
            [1, 'OPEN', ''],
            [2, 'MERGED', 'ann'],
            [3, 'CLOSED', ''],
        ]);
    });

    it('lists every open PR in the repository, by any author', async () => {
        const run = runnerReturning(
            gqlResponse({
                allOpen: {
                    nodes: [
                        gqlPr({ id: 'A', number: 1, author: { login: 'ann' } }),
                        gqlPr({ id: 'B', number: 2 }),
                    ],
                },
            })
        );
        const { snapshot: snap } = await fetchSnapshot('/repo', 'o/r', now, run);

        expect(snap!.open?.map((p) => [p.number, p.author])).toEqual([
            [1, 'ann'],
            [2, 'me'],
        ]);
    });

    it('skips search results that are not pull requests', async () => {
        const run = runnerReturning(gqlResponse({ review: { nodes: [{}, null] } }));
        const { snapshot: snap } = await fetchSnapshot('/repo', 'o/r', now, run);
        expect(snap!.toReview).toEqual([]);
    });

    it('classifies gh failures', async () => {
        const run = runnerFailing({
            stderr: 'To get started with GitHub CLI, please run:  gh auth login',
        });
        const result = await fetchSnapshot('/repo', 'o/r', now, run);
        expect(result).toMatchObject({ status: 'not-authenticated', snapshot: null });
    });

    it('reports unreadable output as an error', async () => {
        expect((await fetchSnapshot('/repo', 'o/r', now, runnerReturning('nope'))).status).toBe(
            'error'
        );
        expect(
            (await fetchSnapshot('/repo', 'o/r', now, runnerReturning('{"data":null}'))).status
        ).toBe('error');
    });
});

describe('isReadyToMerge', () => {
    const ready = pr({ reviewDecision: 'APPROVED', ci: 'passing' });

    it('needs an approval, passing or no checks, no conflicts, and no draft', () => {
        expect(isReadyToMerge(ready)).toBe(true);
        expect(isReadyToMerge({ ...ready, ci: 'none' })).toBe(true);
        expect(isReadyToMerge({ ...ready, ci: 'pending' })).toBe(false);
        expect(isReadyToMerge({ ...ready, reviewDecision: '' })).toBe(false);
        expect(isReadyToMerge({ ...ready, mergeable: 'CONFLICTING' })).toBe(false);
        expect(isReadyToMerge({ ...ready, isDraft: true })).toBe(false);
        expect(isReadyToMerge({ ...ready, state: 'MERGED' })).toBe(false);
    });
});

// The event kinds a diff produces, in order.
function kinds(prev: DashboardSnapshot, next: DashboardSnapshot) {
    return diffSnapshots(prev, next).events.map((e) => e.kind);
}

describe('diffSnapshots', () => {
    describe('review requested', () => {
        it('fires for a PR that newly requests your review', () => {
            const other = pr({ id: 'PR_9', number: 9, author: 'ann' });
            expect(kinds(snapshot(), snapshot({ toReview: [other] }))).toEqual([
                'review-requested',
            ]);
        });

        it('stays quiet for a request that was already there', () => {
            const other = pr({ id: 'PR_9', author: 'ann' });
            expect(kinds(snapshot({ toReview: [other] }), snapshot({ toReview: [other] }))).toEqual(
                []
            );
        });
    });

    describe('changes requested', () => {
        const cr = { id: 'R1', author: 'ann', state: 'CHANGES_REQUESTED' };

        it('fires for a new changes requested review, naming the reviewer', () => {
            const { events } = diffSnapshots(
                snapshot({ mine: [pr()] }),
                snapshot({ mine: [pr({ reviews: [cr] })] })
            );
            expect(events).toMatchObject([{ kind: 'changes-requested', actor: 'ann' }]);
        });

        it('does not fire twice for the same review', () => {
            const before = snapshot({ mine: [pr({ reviews: [cr] })] });
            expect(kinds(before, snapshot({ mine: [pr({ reviews: [cr] })] }))).toEqual([]);
        });

        it('fires again when the same reviewer requests changes in a new review', () => {
            const before = snapshot({ mine: [pr({ reviews: [cr] })] });
            const after = snapshot({ mine: [pr({ reviews: [{ ...cr, id: 'R2' }] })] });
            expect(kinds(before, after)).toEqual(['changes-requested']);
        });
    });

    describe('closed and merged', () => {
        it('fires closed without merge when an open PR closes unmerged', () => {
            const before = snapshot({ mine: [pr()] });
            expect(kinds(before, snapshot({ mine: [pr({ state: 'CLOSED' })] }))).toEqual([
                'closed-unmerged',
            ]);
        });

        it('stays quiet for a PR that was already closed, or never seen open', () => {
            const closed = pr({ state: 'CLOSED' });
            expect(kinds(snapshot({ mine: [closed] }), snapshot({ mine: [closed] }))).toEqual([]);
            expect(kinds(snapshot(), snapshot({ mine: [closed] }))).toEqual([]);
        });

        it('fires merged by someone else only when another account merged it', () => {
            const before = snapshot({ mine: [pr()] });
            const byAnn = snapshot({ mine: [pr({ state: 'MERGED', mergedBy: 'ann' })] });
            const byMe = snapshot({ mine: [pr({ state: 'MERGED', mergedBy: 'me' })] });

            expect(diffSnapshots(before, byAnn).events).toMatchObject([
                { kind: 'merged-by-other', actor: 'ann' },
            ]);
            expect(kinds(before, byMe)).toEqual([]);
        });
    });

    describe('approved and ready to merge', () => {
        it('fires approved when the decision changes to approved', () => {
            const before = snapshot({ mine: [pr()] });
            const after = snapshot({ mine: [pr({ reviewDecision: 'APPROVED' })] });
            expect(kinds(before, after)).toEqual(['approved']);
        });

        it('fires ready to merge once all conditions are met', () => {
            const approved = pr({ reviewDecision: 'APPROVED', ci: 'pending' });
            const before = snapshot({ mine: [approved] });
            const after = snapshot({ mine: [{ ...approved, ci: 'passing' }] });

            expect(kinds(before, after)).toEqual(['ready-to-merge']);
            expect(kinds(after, after)).toEqual([]);
        });
    });

    describe('merge conflict', () => {
        it('fires when a PR becomes conflicting', () => {
            const before = snapshot({ mine: [pr()] });
            const after = snapshot({ mine: [pr({ mergeable: 'CONFLICTING' })] });
            expect(kinds(before, after)).toEqual(['merge-conflict']);
        });

        it('carries the last known value over UNKNOWN, so it never reads as a change', () => {
            const conflicting = snapshot({ mine: [pr({ mergeable: 'CONFLICTING' })] });
            const unknown = snapshot({ mine: [pr({ mergeable: 'UNKNOWN' })] });

            const { events, snapshot: stored } = diffSnapshots(conflicting, unknown);
            expect(events).toEqual([]);
            expect(stored.mine[0]!.mergeable).toBe('CONFLICTING');

            // Back to conflicting after the recompute: still the same conflict.
            expect(kinds(stored, conflicting)).toEqual([]);
        });
    });

    describe('checks failed (once per PR)', () => {
        const failing = pr({ ci: 'failing', failedChecks: ['lint', 'test'] });

        it('fires with the failed check names and flags the PR', () => {
            const { events, snapshot: stored } = diffSnapshots(
                snapshot({ mine: [pr()] }),
                snapshot({ mine: [failing] })
            );
            expect(events).toMatchObject([{ kind: 'checks-failed', checks: ['lint', 'test'] }]);
            expect(stored.failureNotified).toEqual(['PR_1']);
        });

        it('stays quiet through a re-run that fails again', () => {
            const flagged = snapshot({ mine: [failing], failureNotified: ['PR_1'] });

            const pending = diffSnapshots(flagged, snapshot({ mine: [pr({ ci: 'pending' })] }));
            expect(pending.events).toEqual([]);
            expect(pending.snapshot.failureNotified).toEqual(['PR_1']);

            expect(kinds(pending.snapshot, snapshot({ mine: [failing] }))).toEqual([]);
        });

        it('fires again after the checks have passed in between', () => {
            const flagged = snapshot({ mine: [failing], failureNotified: ['PR_1'] });
            const passed = diffSnapshots(flagged, snapshot({ mine: [pr({ ci: 'passing' })] }));

            expect(passed.snapshot.failureNotified).toEqual([]);
            expect(kinds(passed.snapshot, snapshot({ mine: [failing] }))).toEqual([
                'checks-failed',
            ]);
        });
    });

    it('compares a PR new to the snapshot against an empty state', () => {
        const fresh = pr({ reviewDecision: 'APPROVED', ci: 'failing', mergeable: 'CONFLICTING' });
        expect(kinds(snapshot(), snapshot({ mine: [fresh] }))).toEqual([
            'approved',
            'merge-conflict',
            'checks-failed',
        ]);
    });

    it('ignores review, CI and conflict changes on a PR that is no longer open', () => {
        const before = snapshot({ mine: [pr({ state: 'MERGED', mergedBy: 'me' })] });
        const after = snapshot({
            mine: [
                pr({ state: 'MERGED', mergedBy: 'me', ci: 'failing', reviewDecision: 'APPROVED' }),
            ],
        });
        expect(kinds(before, after)).toEqual([]);
    });
});

describe('activityId', () => {
    it('combines the time, kind and PR number', () => {
        expect(
            activityId({
                kind: 'approved',
                at: '2026-10-26T12:00:00.000Z',
                number: 5,
                title: 'x',
                url: 'u',
            })
        ).toBe('2026-10-26T12:00:00.000Z|approved|5');
    });
});
