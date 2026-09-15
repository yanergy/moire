import { describe, it, expect, vi } from 'vitest';
import {
    getPullRequest,
    getReviewThreads,
    getCheckAnnotations,
    getAccounts,
    switchAccount,
    postComment,
    editComment,
    deleteComment,
    editDescription,
    type GhRunner,
} from '../electron/github/gh';

// A gh PR record as `gh pr list --json` emits it (author is an object, and the
// conversation arrives as separate comments and reviews arrays).
const ghPr = {
    number: 42,
    title: 'Add cross-file navigation',
    body: '## Summary\nDoes the thing.',
    state: 'OPEN',
    url: 'https://github.com/o/r/pull/42',
    isDraft: false,
    author: { login: 'yanergy' },
    baseRefName: 'main',
    headRefName: 'feature',
    createdAt: '2026-09-01T00:00:00Z',
    additions: 10,
    deletions: 3,
    changedFiles: 2,
    commits: [{}, {}, {}],
    comments: [
        {
            id: 'IC_1',
            author: { login: 'bob' },
            body: 'nice',
            createdAt: '2026-09-02T00:00:00Z',
            viewerDidAuthor: true,
        },
    ],
    reviews: [
        {
            author: { login: 'ann' },
            body: 'looks good',
            state: 'APPROVED',
            submittedAt: '2026-09-03T00:00:00Z',
        },
        {
            author: { login: 'x' },
            body: '',
            state: 'COMMENTED',
            submittedAt: '2026-09-01T00:00:00Z',
        },
    ],
    labels: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature or request' }],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
};

// A runner that resolves the given stdout, capturing the args/cwd it was called with.
function okRunner(stdout: string) {
    const calls: { args: string[]; cwd: string }[] = [];
    const run: GhRunner = (args, cwd) => {
        calls.push({ args, cwd });
        return Promise.resolve({ stdout, stderr: '' });
    };
    return { run, calls };
}

// A runner that rejects with an error carrying the given fields, like execFile does.
function failRunner(error: { code?: string | number; stderr?: string }): GhRunner {
    return () => Promise.reject(Object.assign(new Error('gh failed'), error));
}

describe('getPullRequest', () => {
    it('maps a found PR, flattening the author to its login', async () => {
        const { run, calls } = okRunner(JSON.stringify([ghPr]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);

        expect(result.status).toBe('ok');
        expect(result.pr).toMatchObject({
            number: 42,
            title: 'Add cross-file navigation',
            body: '## Summary\nDoes the thing.',
            state: 'OPEN',
            author: 'yanergy',
            url: 'https://github.com/o/r/pull/42',
            baseRefName: 'main',
            headRefName: 'feature',
            additions: 10,
            deletions: 3,
            changedFiles: 2,
            commitCount: 3,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
        });
        expect(result.pr!.labels).toEqual([
            { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
        ]);

        // Runs in the repo directory and filters by the head branch.
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args).toContain('--head');
        expect(calls[0]!.args).toContain('feature');
    });

    it('merges comments and reviews into one chronological conversation, dropping empty reviews', async () => {
        const { run } = okRunner(JSON.stringify([ghPr]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);

        // The bare COMMENTED review (empty body) is dropped; the comment and the
        // approval remain, ordered by time.
        expect(result.pr!.comments).toEqual([
            {
                author: 'bob',
                body: 'nice',
                createdAt: '2026-09-02T00:00:00Z',
                kind: 'comment',
                // The comment carries its node id, and viewerDidAuthor marks it editable.
                id: 'IC_1',
                canEdit: true,
            },
            {
                author: 'ann',
                body: 'looks good',
                createdAt: '2026-09-03T00:00:00Z',
                kind: 'review',
                state: 'APPROVED',
                // Reviews are not editable through this path.
                id: '',
                canEdit: false,
            },
        ]);
    });

    it('reports no-pr for an empty gh result', async () => {
        const { run } = okRunner('[]');
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        expect(result).toEqual({ status: 'no-pr', pr: null });
    });

    it('short-circuits to no-pr for the working-tree head without calling gh', async () => {
        const run = vi.fn<GhRunner>();
        const result = await getPullRequest('/repo', 'main', 'WORKING TREE', run);

        expect(result).toEqual({ status: 'no-pr', pr: null });
        expect(run).not.toHaveBeenCalled();
    });

    it('reports not-installed when gh is not on PATH (ENOENT)', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({ code: 'ENOENT' })
        );
        expect(result.status).toBe('not-installed');
    });

    it('reports not-authenticated from the auth error on stderr', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({
                code: 1,
                stderr: 'To get started with GitHub CLI, please run: gh auth login',
            })
        );
        expect(result.status).toBe('not-authenticated');
    });

    it('reports not-a-github-repo when no remote points at GitHub', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({
                code: 1,
                stderr: 'none of the git remotes configured for this repository point to a known GitHub host',
            })
        );
        expect(result.status).toBe('not-a-github-repo');
    });

    it('reports a generic error with the stderr message for anything else', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({ code: 1, stderr: 'the server is on fire' })
        );
        expect(result.status).toBe('error');
        expect(result.message).toBe('the server is on fire');
    });

    it('reports an error when gh output is not valid JSON', async () => {
        const { run } = okRunner('not json at all');
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        expect(result.status).toBe('error');
        expect(result.pr).toBeNull();
    });
});

describe('getPullRequest checks', () => {
    // Resolve the mapped checks for a PR carrying the given statusCheckRollup.
    async function checksFor(rollup: unknown[]) {
        const { run } = okRunner(JSON.stringify([{ ...ghPr, statusCheckRollup: rollup }]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        return result.pr!.checks;
    }

    it('maps a completed CheckRun by its conclusion, with an elapsed duration', async () => {
        const checks = await checksFor([
            {
                __typename: 'CheckRun',
                name: 'lint',
                status: 'COMPLETED',
                conclusion: 'SUCCESS',
                startedAt: '2026-09-06T16:00:00Z',
                completedAt: '2026-09-06T16:00:32Z',
                detailsUrl: 'https://x/lint',
            },
            {
                __typename: 'CheckRun',
                name: 'e2e',
                status: 'COMPLETED',
                conclusion: 'FAILURE',
                startedAt: '2026-09-06T16:00:00Z',
                completedAt: '2026-09-06T16:04:06Z',
                detailsUrl: 'https://x/e2e',
            },
        ]);
        expect(checks).toEqual([
            { name: 'lint', state: 'success', detail: '32s', url: 'https://x/lint' },
            { name: 'e2e', state: 'failure', detail: 'Failed in 4m 06s', url: 'https://x/e2e' },
        ]);
    });

    it('reports an unfinished CheckRun as pending with a lifecycle detail', async () => {
        const checks = await checksFor([
            { __typename: 'CheckRun', name: 'build', status: 'IN_PROGRESS' },
            { __typename: 'CheckRun', name: 'deploy', status: 'QUEUED' },
        ]);
        expect(checks).toEqual([
            { name: 'build', state: 'pending', detail: 'Running', url: '' },
            { name: 'deploy', state: 'pending', detail: 'Queued', url: '' },
        ]);
    });

    it('buckets skipped, neutral, and cancelled conclusions away from failure', async () => {
        const checks = await checksFor([
            { __typename: 'CheckRun', name: 's', status: 'COMPLETED', conclusion: 'SKIPPED' },
            { __typename: 'CheckRun', name: 'n', status: 'COMPLETED', conclusion: 'NEUTRAL' },
            { __typename: 'CheckRun', name: 'c', status: 'COMPLETED', conclusion: 'CANCELLED' },
        ]);
        expect(checks.map((c) => c.state)).toEqual(['skipped', 'neutral', 'neutral']);
    });

    it('maps a legacy StatusContext by its flat state', async () => {
        const checks = await checksFor([
            {
                __typename: 'StatusContext',
                context: 'ci/circleci',
                state: 'SUCCESS',
                description: 'Your tests passed',
                targetUrl: 'https://x/ci',
            },
        ]);
        expect(checks).toEqual([
            {
                name: 'ci/circleci',
                state: 'success',
                detail: 'Your tests passed',
                url: 'https://x/ci',
            },
        ]);
    });

    it('drops nameless nodes and yields an empty list when nothing ran', async () => {
        expect(await checksFor([{ __typename: 'CheckRun', status: 'COMPLETED' }])).toEqual([]);
        const { run } = okRunner(JSON.stringify([{ ...ghPr, statusCheckRollup: null }]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        expect(result.pr!.checks).toEqual([]);
    });
});

describe('getPullRequest review decision', () => {
    // Resolve the mapped reviewDecision for a PR carrying the given fields.
    async function decisionFor(overrides: Record<string, unknown>) {
        const { run } = okRunner(JSON.stringify([{ ...ghPr, ...overrides }]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        return result.pr!.reviewDecision;
    }

    it("prefers gh's own reviewDecision field when present", async () => {
        // gh populates this on repos with required reviews; trust it verbatim.
        expect(await decisionFor({ reviewDecision: 'CHANGES_REQUESTED' })).toBe(
            'CHANGES_REQUESTED'
        );
        expect(await decisionFor({ reviewDecision: 'APPROVED' })).toBe('APPROVED');
    });

    it('derives CHANGES_REQUESTED from the reviews when gh leaves the field empty', async () => {
        expect(
            await decisionFor({
                reviewDecision: '',
                reviews: [
                    {
                        author: { login: 'ann' },
                        body: 'please fix',
                        state: 'CHANGES_REQUESTED',
                        submittedAt: '2026-09-04T00:00:00Z',
                    },
                ],
            })
        ).toBe('CHANGES_REQUESTED');
    });

    it("counts only a reviewer's latest verdict, so a later approval clears the request", async () => {
        expect(
            await decisionFor({
                reviewDecision: '',
                reviews: [
                    {
                        author: { login: 'ann' },
                        body: 'please fix',
                        state: 'CHANGES_REQUESTED',
                        submittedAt: '2026-09-04T00:00:00Z',
                    },
                    {
                        author: { login: 'ann' },
                        body: 'thanks',
                        state: 'APPROVED',
                        submittedAt: '2026-09-05T00:00:00Z',
                    },
                ],
            })
        ).toBe('APPROVED');
    });

    it('keeps CHANGES_REQUESTED when one reviewer still wants changes though another approved', async () => {
        expect(
            await decisionFor({
                reviewDecision: '',
                reviews: [
                    {
                        author: { login: 'ann' },
                        body: 'lgtm',
                        state: 'APPROVED',
                        submittedAt: '2026-09-04T00:00:00Z',
                    },
                    {
                        author: { login: 'bob' },
                        body: 'no',
                        state: 'CHANGES_REQUESTED',
                        submittedAt: '2026-09-05T00:00:00Z',
                    },
                ],
            })
        ).toBe('CHANGES_REQUESTED');
    });

    it('leaves the decision empty when there are only plain comments', async () => {
        expect(
            await decisionFor({
                reviewDecision: '',
                reviews: [
                    {
                        author: { login: 'x' },
                        body: 'a thought',
                        state: 'COMMENTED',
                        submittedAt: '2026-09-04T00:00:00Z',
                    },
                ],
            })
        ).toBe('');
    });
});

// `gh auth status` output as gh prints it, with a token and detail lines between
// the account lines the parser cares about.
const authStatus = [
    'github.com',
    '  ✓ Logged in to github.com account yanergy (keyring)',
    '  - Active account: true',
    '  - Git operations protocol: ssh',
    '  - Token scopes: gist, read:org, repo',
    '  ✓ Logged in to github.com account octocat (keyring)',
    '  - Active account: false',
    '  - Git operations protocol: https',
].join('\n');

describe('getAccounts', () => {
    it('lists the accounts and marks the active one', async () => {
        const { run, calls } = okRunner(authStatus);
        const result = await getAccounts(run);

        expect(result.status).toBe('ok');
        expect(result.accounts).toEqual([
            { host: 'github.com', login: 'yanergy', active: true },
            { host: 'github.com', login: 'octocat', active: false },
        ]);
        expect(calls[0]!.args).toEqual(['auth', 'status']);
    });

    it('reports not-installed when gh is not on PATH (ENOENT)', async () => {
        const result = await getAccounts(failRunner({ code: 'ENOENT' }));
        expect(result.status).toBe('not-installed');
        expect(result.accounts).toEqual([]);
    });

    it('reports not-authenticated when no account is signed in', async () => {
        const result = await getAccounts(
            failRunner({ code: 1, stderr: 'You are not logged into any GitHub hosts.' })
        );
        expect(result.status).toBe('not-authenticated');
        expect(result.accounts).toEqual([]);
    });
});

describe('switchAccount', () => {
    it('switches to the given account on the host', async () => {
        const { run, calls } = okRunner('');
        const result = await switchAccount('octocat', 'github.com', run);

        expect(result.status).toBe('ok');
        expect(calls[0]!.args).toEqual([
            'auth',
            'switch',
            '--hostname',
            'github.com',
            '--user',
            'octocat',
        ]);
    });

    it('reports not-installed when gh is not on PATH (ENOENT)', async () => {
        const result = await switchAccount('octocat', 'github.com', failRunner({ code: 'ENOENT' }));
        expect(result.status).toBe('not-installed');
    });

    it('surfaces the stderr message on any other failure', async () => {
        const result = await switchAccount(
            'octocat',
            'github.com',
            failRunner({ code: 1, stderr: 'no such account' })
        );
        expect(result.status).toBe('error');
        expect(result.message).toBe('no such account');
    });
});

describe('postComment', () => {
    it('posts via gh pr comment in the repo directory', async () => {
        const { run, calls } = okRunner('');
        const result = await postComment('/repo', 42, 'looks good', run);

        expect(result).toEqual({ ok: true });
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args).toEqual(['pr', 'comment', '42', '--body', 'looks good']);
    });

    it('rejects a blank body without calling gh', async () => {
        const run = vi.fn<GhRunner>();
        const result = await postComment('/repo', 42, '   ', run);

        expect(result.ok).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('reports a gh failure as an ok:false message', async () => {
        const run = failRunner({ stderr: 'GraphQL: could not resolve' });
        const result = await postComment('/repo', 42, 'hi', run);

        expect(result.ok).toBe(false);
        expect(result.message).toContain('could not resolve');
    });
});

describe('editComment', () => {
    it('edits via the updateIssueComment mutation keyed on the node id', async () => {
        const { run, calls } = okRunner('');
        const result = await editComment('/repo', 'IC_1', 'fixed', run);

        expect(result).toEqual({ ok: true });
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args[0]).toBe('api');
        expect(calls[0]!.args).toContain('graphql');
        expect(calls[0]!.args).toContain('id=IC_1');
        expect(calls[0]!.args).toContain('body=fixed');
    });

    it('rejects a blank id or body without calling gh', async () => {
        const run = vi.fn<GhRunner>();
        expect((await editComment('/repo', '', 'x', run)).ok).toBe(false);
        expect((await editComment('/repo', 'IC_1', '  ', run)).ok).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('names a missing gh from an ENOENT', async () => {
        const run = failRunner({ code: 'ENOENT' });
        const result = await editComment('/repo', 'IC_1', 'x', run);

        expect(result.ok).toBe(false);
        expect(result.message).toContain('not found');
    });
});

describe('deleteComment', () => {
    it('deletes via the deleteIssueComment mutation keyed on the node id', async () => {
        const { run, calls } = okRunner('');
        const result = await deleteComment('/repo', 'IC_1', run);

        expect(result).toEqual({ ok: true });
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args[0]).toBe('api');
        expect(calls[0]!.args).toContain('graphql');
        expect(calls[0]!.args).toContain('id=IC_1');
        expect(calls[0]!.args.some((a) => a.includes('deleteIssueComment'))).toBe(true);
    });

    it('rejects a blank id without calling gh', async () => {
        const run = vi.fn<GhRunner>();
        expect((await deleteComment('/repo', '', run)).ok).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('reports a gh failure as an ok:false message', async () => {
        const run = failRunner({ stderr: 'GraphQL: must have admin' });
        const result = await deleteComment('/repo', 'IC_1', run);

        expect(result.ok).toBe(false);
        expect(result.message).toContain('must have admin');
    });
});

describe('editDescription', () => {
    it('edits the body via gh pr edit, keyed on the PR number', async () => {
        const { run, calls } = okRunner('');
        const result = await editDescription('/repo', 42, 'New body.', run);

        expect(result).toEqual({ ok: true });
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args).toEqual(['pr', 'edit', '42', '--body', 'New body.']);
    });

    it('allows an empty body (clearing the description)', async () => {
        const { run, calls } = okRunner('');
        const result = await editDescription('/repo', 42, '', run);

        expect(result.ok).toBe(true);
        expect(calls[0]!.args).toEqual(['pr', 'edit', '42', '--body', '']);
    });

    it('rejects a missing PR number without calling gh', async () => {
        const run = vi.fn<GhRunner>();
        expect((await editDescription('/repo', 0, 'x', run)).ok).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('reports a gh failure as an ok:false message', async () => {
        const run = failRunner({ stderr: 'GraphQL: must have write access' });
        const result = await editDescription('/repo', 42, 'x', run);

        expect(result.ok).toBe(false);
        expect(result.message).toContain('write access');
    });
});

// The GraphQL shape gh returns for reviewThreads under the PR node.
const threadsJson = (nodes: unknown[]) =>
    JSON.stringify({ data: { node: { reviewThreads: { nodes } } } });

describe('getReviewThreads', () => {
    it('queries by node id and maps threads to their file, line, side, and state', async () => {
        const { run, calls } = okRunner(
            threadsJson([
                {
                    path: 'src/a.ts',
                    line: 12,
                    originalLine: null,
                    diffSide: 'RIGHT',
                    isResolved: false,
                    isOutdated: false,
                    comments: {
                        nodes: [
                            {
                                author: { login: 'bob' },
                                body: 'this can race',
                                createdAt: '2026-09-02T00:00:00Z',
                            },
                            { author: { login: 'me' }, body: 'fixed', createdAt: '2026-09-03Z' },
                        ],
                    },
                },
                {
                    path: 'src/b.ts',
                    line: null,
                    originalLine: 4,
                    diffSide: 'LEFT',
                    isResolved: true,
                    isOutdated: true,
                    comments: { nodes: [{ author: { login: 'ann' }, body: 'old', createdAt: '' }] },
                },
            ])
        );

        const threads = await getReviewThreads('/repo', 'PR_1', run);

        // Queried over GraphQL, keyed on the PR node id.
        expect(calls[0]!.args[0]).toBe('api');
        expect(calls[0]!.args).toContain('graphql');
        expect(calls[0]!.args).toContain('id=PR_1');

        expect(threads).toHaveLength(2);
        expect(threads[0]).toEqual({
            path: 'src/a.ts',
            line: 12,
            originalLine: null,
            side: 'RIGHT',
            isResolved: false,
            isOutdated: false,
            comments: [
                { author: 'bob', body: 'this can race', createdAt: '2026-09-02T00:00:00Z' },
                { author: 'me', body: 'fixed', createdAt: '2026-09-03Z' },
            ],
        });
        expect(threads[1]!.side).toBe('LEFT');
        expect(threads[1]!.originalLine).toBe(4);
        expect(threads[1]!.isResolved).toBe(true);
        expect(threads[1]!.isOutdated).toBe(true);
    });

    it('drops threads with no file or no comments', async () => {
        const { run } = okRunner(
            threadsJson([
                { path: null, line: 1, diffSide: 'RIGHT', comments: { nodes: [] } },
                { path: 'src/a.ts', line: 2, diffSide: 'RIGHT', comments: { nodes: [] } },
            ])
        );

        expect(await getReviewThreads('/repo', 'PR_1', run)).toEqual([]);
    });

    it('returns an empty list without calling gh when there is no id', async () => {
        const run = vi.fn<GhRunner>();
        expect(await getReviewThreads('/repo', '', run)).toEqual([]);
        expect(run).not.toHaveBeenCalled();
    });

    it('returns an empty list when gh fails (threads are supplementary)', async () => {
        const run = failRunner({ code: 'ENOENT' });
        expect(await getReviewThreads('/repo', 'PR_1', run)).toEqual([]);
    });

    it('returns an empty list when gh output is not valid JSON', async () => {
        const { run } = okRunner('not json');
        expect(await getReviewThreads('/repo', 'PR_1', run)).toEqual([]);
    });
});

// A check run as the commit check-runs endpoint emits it, trimmed to the read fields.
const checkRun = (over: Record<string, unknown> = {}) => ({
    id: 101,
    html_url: 'https://github.com/o/r/runs/101',
    details_url: 'https://ci.example/run/101',
    output: { annotations_count: 1 },
    ...over,
});

// A single check annotation as the annotations endpoint emits it.
const ghAnnotation = (over: Record<string, unknown> = {}) => ({
    path: 'src/a.vue',
    start_line: 224,
    annotation_level: 'failure',
    title: 'quality-gates',
    message: 'The "computed" property should be above the "methods" property on line 176',
    ...over,
});

// A runner for the two-step fetch: it returns `checkRuns` for the commit check-runs
// call and looks up `annotationsById` (keyed by the run id in the URL) for each per-run
// annotations call. Run ids in `failIds` reject, to model one run's lookup failing.
function annotationsRunner(opts: {
    checkRuns: unknown;
    annotationsById?: Record<string, unknown>;
    failIds?: string[];
}) {
    const calls: { args: string[]; cwd: string }[] = [];
    const run: GhRunner = (args, cwd) => {
        calls.push({ args, cwd });
        const url = args[1] ?? '';
        if (url.includes('/commits/')) {
            return Promise.resolve({ stdout: JSON.stringify(opts.checkRuns), stderr: '' });
        }

        const id = /check-runs\/(\d+)\/annotations/.exec(url)?.[1] ?? '';
        if (opts.failIds?.includes(id)) {
            return Promise.reject(new Error('boom'));
        }

        return Promise.resolve({
            stdout: JSON.stringify(opts.annotationsById?.[id] ?? []),
            stderr: '',
        });
    };
    return { run, calls };
}

describe('getCheckAnnotations', () => {
    it("lists the head commit check runs, then maps each run's annotations with its url", async () => {
        const { run, calls } = annotationsRunner({
            checkRuns: {
                total_count: 1,
                check_runs: [checkRun({ id: 101, output: { annotations_count: 2 } })],
            },
            annotationsById: {
                '101': [
                    ghAnnotation({ start_line: 224 }),
                    ghAnnotation({
                        start_line: 232,
                        annotation_level: 'warning',
                        message: 'watch above methods',
                    }),
                ],
            },
        });

        const annotations = await getCheckAnnotations('/repo', 'abc123', run);

        // First call lists the commit's check runs; the second reads run 101's.
        expect(calls[0]!.args[0]).toBe('api');
        expect(calls[0]!.args[1]).toContain('commits/abc123/check-runs');
        expect(calls[1]!.args[1]).toContain('check-runs/101/annotations');
        expect(calls[0]!.cwd).toBe('/repo');

        expect(annotations).toEqual([
            {
                path: 'src/a.vue',
                line: 224,
                level: 'failure',
                title: 'quality-gates',
                message:
                    'The "computed" property should be above the "methods" property on line 176',
                url: 'https://github.com/o/r/runs/101',
            },
            {
                path: 'src/a.vue',
                line: 232,
                level: 'warning',
                title: 'quality-gates',
                message: 'watch above methods',
                url: 'https://github.com/o/r/runs/101',
            },
        ]);
    });

    it('skips check runs that report no annotations', async () => {
        const { run, calls } = annotationsRunner({
            checkRuns: {
                check_runs: [
                    checkRun({ id: 200, output: { annotations_count: 0 } }),
                    checkRun({ id: 201, output: { annotations_count: 1 } }),
                ],
            },
            annotationsById: { '201': [ghAnnotation()] },
        });

        const annotations = await getCheckAnnotations('/repo', 'sha', run);

        expect(annotations).toHaveLength(1);
        // Only the annotated run's endpoint was hit; the empty one was not fetched.
        expect(calls.some((c) => c.args[1]?.includes('check-runs/200/annotations'))).toBe(false);
        expect(calls.some((c) => c.args[1]?.includes('check-runs/201/annotations'))).toBe(true);
    });

    it('falls back to the title when an annotation carries no message', async () => {
        const { run } = annotationsRunner({
            checkRuns: { check_runs: [checkRun({ id: 1 })] },
            annotationsById: { '1': [ghAnnotation({ message: '', title: 'Style issue' })] },
        });

        const annotations = await getCheckAnnotations('/repo', 'sha', run);
        expect(annotations[0]!.message).toBe('Style issue');
    });

    it('drops annotations with no path, no line, or no message', async () => {
        const { run } = annotationsRunner({
            checkRuns: { check_runs: [checkRun({ id: 1, output: { annotations_count: 3 } })] },
            annotationsById: {
                '1': [
                    ghAnnotation({ path: null }),
                    ghAnnotation({ start_line: null }),
                    ghAnnotation({ message: '', title: '' }),
                ],
            },
        });

        expect(await getCheckAnnotations('/repo', 'sha', run)).toEqual([]);
    });

    it('drops a run whose annotations fail to load but keeps the rest', async () => {
        const { run } = annotationsRunner({
            checkRuns: { check_runs: [checkRun({ id: 1 }), checkRun({ id: 2 })] },
            annotationsById: { '2': [ghAnnotation({ start_line: 9 })] },
            failIds: ['1'],
        });

        const annotations = await getCheckAnnotations('/repo', 'sha', run);
        expect(annotations).toHaveLength(1);
        expect(annotations[0]!.line).toBe(9);
    });

    it('returns an empty list without calling gh when there is no head sha', async () => {
        const run = vi.fn<GhRunner>();
        expect(await getCheckAnnotations('/repo', '', run)).toEqual([]);
        expect(run).not.toHaveBeenCalled();
    });

    it('returns an empty list when the check-runs lookup fails', async () => {
        const run = failRunner({ code: 'ENOENT' });
        expect(await getCheckAnnotations('/repo', 'sha', run)).toEqual([]);
    });

    it('returns an empty list when the check-runs output is not valid JSON', async () => {
        const { run } = okRunner('not json');
        expect(await getCheckAnnotations('/repo', 'sha', run)).toEqual([]);
    });
});
