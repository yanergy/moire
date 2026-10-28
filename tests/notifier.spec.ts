import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
    describeEvent,
    MAX_ACTIVITY,
    Notifier,
    POLL_INTERVAL_MS,
    type NotificationContent,
    type NotifierDeps,
} from '../electron/notifier';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../electron/settings';
import {
    activityId,
    type DashboardPr,
    type DashboardSnapshot,
    type SnapshotResult,
} from '../electron/github/notifications';

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

// A comment by ann.
function comment(id: string) {
    return { id, author: 'ann' };
}

// A PR by someone else that requests the viewer's review.
function request(n: number, overrides: Partial<DashboardPr> = {}): DashboardPr {
    return pr({ id: `REQ_${n}`, number: n, author: 'ann', ...overrides });
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

// Fake dependencies: an in-memory state store, a queue of fetch results (the last
// one repeats), and spies for everything Electron would do.
function setup(prefs: Partial<NotificationPrefs> = {}) {
    const store = new Map<string, unknown>();
    const results: SnapshotResult[] = [];
    let currentPrefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };
    const clicks: (() => void)[] = [];

    const deps = {
        getRepoIdentity: vi.fn<NotifierDeps['getRepoIdentity']>(async () => ({
            status: 'ok',
            repo: 'o/r',
        })),
        fetchSnapshot: vi.fn<NotifierDeps['fetchSnapshot']>(async () =>
            results.length > 1 ? results.shift()! : results[0]!
        ),
        getPrefs: vi.fn<NotifierDeps['getPrefs']>(async () => currentPrefs),
        loadState: vi.fn<NotifierDeps['loadState']>(
            async (key) => (store.get(key) as never) ?? null
        ),
        saveState: vi.fn<NotifierDeps['saveState']>(async (key, state) => {
            store.set(key, state);
        }),
        notify: vi.fn<(content: NotificationContent, onClick: () => void) => void>(
            (_content, onClick) => {
                clicks.push(onClick);
            }
        ),
        setBadge: vi.fn<NotifierDeps['setBadge']>(),
        onOpenPr: vi.fn<NotifierDeps['onOpenPr']>(),
        onOpenDashboard: vi.fn<NotifierDeps['onOpenDashboard']>(),
        onChange: vi.fn<NonNullable<NotifierDeps['onChange']>>(),
        logError: vi.fn<NotifierDeps['logError']>(),
        now: () => new Date('2026-10-26T12:00:00Z'),
    };

    return {
        deps,
        store,
        clicks,
        notifier: new Notifier(deps),
        // Queue what the next polls fetch.
        respond: (...snaps: DashboardSnapshot[]) =>
            results.push(...snaps.map((s): SnapshotResult => ({ status: 'ok', snapshot: s }))),
        respondWith: (result: SnapshotResult) => results.push(result),
        setPrefs: (change: Partial<NotificationPrefs>) => {
            currentPrefs = { ...currentPrefs, ...change };
        },
    };
}

describe('Notifier', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stores the first poll as a silent baseline, with an empty badge', async () => {
        const t = setup();
        t.respond(snapshot({ toReview: [request(5), request(6)] }));

        await t.notifier.setRepo('/repo');

        expect(t.deps.fetchSnapshot).toHaveBeenCalledWith(
            '/repo',
            'o/r',
            new Date('2026-10-26T12:00:00Z')
        );
        expect(t.deps.notify).not.toHaveBeenCalled();
        expect(t.store.has('me|o/r')).toBe(true);
        expect(t.deps.setBadge).toHaveBeenLastCalledWith(0);
        expect(t.notifier.getView()).toMatchObject({ status: 'ok', activity: [] });
        t.notifier.stop();
    });

    it('flags PRs that are already failing in the baseline, so they stay quiet', async () => {
        const t = setup();
        const failing = pr({ ci: 'failing', failedChecks: ['lint'] });
        t.respond(snapshot({ mine: [failing] }), snapshot({ mine: [failing] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify).not.toHaveBeenCalled();
        t.notifier.stop();
    });

    it('notifies new events, records them as activity, and opens the PR on click', async () => {
        const t = setup();
        t.respond(snapshot(), snapshot({ toReview: [request(5)] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify).toHaveBeenCalledTimes(1);
        expect(t.deps.notify.mock.calls[0]![0]).toEqual({
            title: 'Review requested',
            subtitle: 'o/r',
            body: '#5 Add notifications\nby ann',
        });
        expect(t.notifier.getView().activity).toMatchObject([
            { kind: 'review-requested', number: 5, at: '2026-10-26T12:00:00.000Z' },
        ]);

        t.clicks[0]!();
        expect(t.deps.onOpenPr).toHaveBeenCalledWith(expect.objectContaining({ number: 5 }));
        t.notifier.stop();
    });

    it('records how many comments a commented notification stands for', async () => {
        const t = setup();
        t.respond(
            snapshot({ mine: [pr({ comments: [] })] }),
            snapshot({ mine: [pr({ comments: [comment('C1'), comment('C2')] })] })
        );

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify.mock.calls[0]![0].title).toBe('ann left 2 comments');
        expect(t.notifier.getView().activity).toMatchObject([
            { kind: 'commented', actor: 'ann', count: 2 },
        ]);
        t.notifier.stop();
    });

    it('drops events whose kind is toggled off, but still records them as seen', async () => {
        const t = setup({
            events: { ...DEFAULT_NOTIFICATION_PREFS.events, 'review-requested': false },
        });
        t.respond(snapshot(), snapshot({ toReview: [request(5)] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();
        expect(t.deps.notify).not.toHaveBeenCalled();

        // Turning the kind back on does not replay the request.
        t.setPrefs({ events: DEFAULT_NOTIFICATION_PREFS.events });
        await t.notifier.poll();
        expect(t.deps.notify).not.toHaveBeenCalled();
        t.notifier.stop();
    });

    it('still notifies about drafts when only the dashboard hides them', async () => {
        const t = setup({ dashboardShowDrafts: false });
        t.respond(snapshot(), snapshot({ toReview: [request(5, { isDraft: true })] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify).toHaveBeenCalledTimes(1);
        t.notifier.stop();
    });

    it('drops draft events, and so leaves them out of the badge, when drafts do not notify', async () => {
        const t = setup({ notifyDrafts: false });
        t.respond(snapshot(), snapshot({ toReview: [request(5, { isDraft: true }), request(6)] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify).toHaveBeenCalledTimes(1);
        expect(t.deps.notify.mock.calls[0]![0].body).toContain('#6');
        expect(t.deps.setBadge).toHaveBeenLastCalledWith(1);
        t.notifier.stop();
    });

    it('collapses more than three events into one summary that opens the dashboard', async () => {
        const t = setup();
        t.respond(
            snapshot(),
            snapshot({ toReview: [request(1), request(2), request(3), request(4)] })
        );

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify).toHaveBeenCalledTimes(1);
        expect(t.deps.notify.mock.calls[0]![0]).toMatchObject({
            title: '4 pull request updates',
            subtitle: 'o/r',
        });
        expect(t.notifier.getView().activity).toHaveLength(4);

        t.clicks[0]!();
        expect(t.deps.onOpenDashboard).toHaveBeenCalled();
        t.notifier.stop();
    });

    it('keeps the newest activity first, capped', async () => {
        const t = setup({ events: { ...DEFAULT_NOTIFICATION_PREFS.events } });
        const polls = Array.from({ length: MAX_ACTIVITY + 5 }, (_, i) =>
            snapshot({ toReview: i === 0 ? [] : [request(i)] })
        );
        t.respond(...polls);

        await t.notifier.setRepo('/repo');
        for (let i = 1; i < polls.length; i++) {
            // Polls must run one after another; each diffs against the last.
            // oxlint-disable-next-line no-await-in-loop
            await t.notifier.poll();
        }

        const { activity } = t.notifier.getView();
        expect(activity).toHaveLength(MAX_ACTIVITY);
        expect(activity[0]!.number).toBe(MAX_ACTIVITY + 4);
        t.notifier.stop();
    });

    it('polls every interval, and on wake, until stopped', async () => {
        const t = setup();
        t.respond(snapshot());

        await t.notifier.setRepo('/repo');
        expect(t.deps.fetchSnapshot).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        expect(t.deps.fetchSnapshot).toHaveBeenCalledTimes(2);

        t.notifier.onResume();
        await vi.waitFor(() => expect(t.deps.fetchSnapshot).toHaveBeenCalledTimes(3));

        t.notifier.stop();
        t.notifier.onResume();
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
        expect(t.deps.fetchSnapshot).toHaveBeenCalledTimes(3);
    });

    it('does not poll in the background while the master switch is off', async () => {
        const t = setup({ enabled: false });
        t.respond(snapshot(), snapshot({ toReview: [request(5)] }));

        await t.notifier.setRepo('/repo');
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
        expect(t.deps.fetchSnapshot).not.toHaveBeenCalled();
        expect(t.deps.setBadge).toHaveBeenLastCalledWith(0);

        // A manual poll (the dashboard refresh) still works, silently.
        await t.notifier.poll();
        await t.notifier.poll();
        expect(t.deps.fetchSnapshot).toHaveBeenCalledTimes(2);
        expect(t.deps.notify).not.toHaveBeenCalled();
        expect(t.deps.setBadge).toHaveBeenLastCalledWith(0);
    });

    it('keeps the last dashboard-only lists when their searches fail, and logs them', async () => {
        const t = setup();
        const open = [request(7, { author: 'bob' })];
        t.respond(snapshot({ open, merged: [] }));
        const partial = snapshot();
        delete partial.open;
        delete partial.merged;
        t.respondWith({
            status: 'ok',
            snapshot: partial,
            failed: [
                { search: 'open PRs', message: 'gh: HTTP 502' },
                { search: 'merged PRs', message: 'gh: HTTP 502' },
            ],
        });

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.notifier.getView().snapshot).toMatchObject({ open, merged: [] });
        expect(t.deps.logError).toHaveBeenCalledWith('dashboard fetch', 'open PRs: gh: HTTP 502');
        expect(t.deps.logError).toHaveBeenCalledWith('dashboard fetch', 'merged PRs: gh: HTTP 502');
        t.notifier.stop();
    });

    it('clears the badge when the dock badge is off', async () => {
        const t = setup({ dockBadge: false });
        t.respond(snapshot(), snapshot({ toReview: [request(5)] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.setBadge).toHaveBeenLastCalledWith(0);
        t.notifier.stop();
    });

    it('reports a repository without a GitHub remote and does not fetch', async () => {
        const t = setup();
        t.deps.getRepoIdentity.mockResolvedValue({ status: 'not-a-github-repo', repo: null });

        await t.notifier.setRepo('/repo');

        expect(t.deps.fetchSnapshot).not.toHaveBeenCalled();
        expect(t.notifier.getView()).toMatchObject({ status: 'not-a-github-repo', snapshot: null });
        t.notifier.stop();
    });

    it('keeps the last good data when a fetch fails', async () => {
        const t = setup();
        t.respond(snapshot({ toReview: [request(5)] }));
        await t.notifier.setRepo('/repo');

        t.deps.fetchSnapshot.mockResolvedValueOnce({
            status: 'error',
            snapshot: null,
            message: 'offline',
        });
        await t.notifier.poll();

        expect(t.notifier.getView()).toMatchObject({ status: 'error', message: 'offline' });
        expect(t.notifier.getView().snapshot?.toReview).toHaveLength(1);
        t.notifier.stop();
    });

    it('drops the result of a poll that was in flight when the repository changed', async () => {
        const t = setup();
        let release!: (result: SnapshotResult) => void;
        t.deps.fetchSnapshot.mockImplementationOnce(
            () => new Promise((resolve) => (release = resolve))
        );
        t.respond(snapshot({ repo: 'o/other' }));

        const first = t.notifier.setRepo('/repo');
        await vi.waitFor(() => expect(release).toBeDefined());
        await t.notifier.setRepo('/other');

        release({ status: 'ok', snapshot: snapshot({ toReview: [request(5)] }) });
        await first;

        expect(t.store.has('me|o/r')).toBe(false);
        expect(t.notifier.getView().snapshot?.repo).toBe('o/other');
        t.notifier.stop();
    });

    it('starts a fresh baseline for another account', async () => {
        const t = setup();
        t.respond(snapshot(), snapshot({ login: 'other', toReview: [request(5)] }));

        await t.notifier.setRepo('/repo');
        await t.notifier.poll();

        expect(t.deps.notify).not.toHaveBeenCalled();
        expect(t.store.has('other|o/r')).toBe(true);
        t.notifier.stop();
    });

    describe('notification list actions', () => {
        // A repository with two delivered notifications: #5 (newest) and #6.
        async function withActivity() {
            const t = setup();
            t.respond(
                snapshot(),
                snapshot({ toReview: [request(6)] }),
                snapshot({ toReview: [request(5), request(6)] })
            );
            await t.notifier.setRepo('/repo');
            await t.notifier.poll();
            await t.notifier.poll();
            const ids = t.notifier.getView().activity.map(activityId);
            return { t, ids };
        }

        it('marks one notification read and saves it', async () => {
            const { t, ids } = await withActivity();

            await t.notifier.markActivityRead(ids[0]!);

            expect(t.notifier.getView().activity.map((e) => !!e.read)).toEqual([true, false]);
            const saved = t.store.get('me|o/r') as { activity: { read?: boolean }[] };
            expect(saved.activity.map((e) => !!e.read)).toEqual([true, false]);
            expect(t.deps.setBadge).toHaveBeenLastCalledWith(1);
            t.notifier.stop();
        });

        it('marks a read notification unread again, counting it on the badge', async () => {
            const { t, ids } = await withActivity();
            await t.notifier.markAllActivityRead();

            await t.notifier.markActivityRead(ids[1]!, false);

            expect(t.notifier.getView().activity.map((e) => !!e.read)).toEqual([true, false]);
            const saved = t.store.get('me|o/r') as { activity: { read?: boolean }[] };
            expect(saved.activity.map((e) => !!e.read)).toEqual([true, false]);
            expect(t.deps.setBadge).toHaveBeenLastCalledWith(1);
            t.notifier.stop();
        });

        it('marks every notification read, clearing the badge', async () => {
            const { t } = await withActivity();
            expect(t.deps.setBadge).toHaveBeenLastCalledWith(2);

            await t.notifier.markAllActivityRead();

            expect(t.notifier.getView().activity.every((e) => e.read)).toBe(true);
            expect(t.deps.setBadge).toHaveBeenLastCalledWith(0);
            t.notifier.stop();
        });

        it('deletes one notification', async () => {
            const { t, ids } = await withActivity();

            await t.notifier.deleteActivity(ids[1]!);

            expect(t.notifier.getView().activity.map((e) => e.number)).toEqual([5]);
            expect(t.deps.setBadge).toHaveBeenLastCalledWith(1);
            t.notifier.stop();
        });

        it('keeps a mark read made while a poll is saving', async () => {
            const { t, ids } = await withActivity();

            // Start a poll and mark read before it finishes: the lock orders them,
            // so neither overwrites the other.
            const poll = t.notifier.poll();
            const mark = t.notifier.markActivityRead(ids[1]!);
            await Promise.all([poll, mark]);

            const saved = t.store.get('me|o/r') as { activity: { read?: boolean }[] };
            expect(saved.activity.map((e) => !!e.read)).toEqual([false, true]);
            t.notifier.stop();
        });

        it('does nothing before a poll has succeeded', async () => {
            const t = setup();
            await t.notifier.markAllActivityRead();
            expect(t.deps.saveState).not.toHaveBeenCalled();
        });
    });

    it('logs instead of throwing when a dependency fails', async () => {
        const t = setup();
        t.deps.fetchSnapshot.mockRejectedValue(new Error('boom'));

        await t.notifier.setRepo('/repo');

        expect(t.deps.logError).toHaveBeenCalledWith('notifier poll', expect.any(Error));
        t.notifier.stop();
    });
});

describe('describeEvent', () => {
    it('names the actor and the failed checks where known', () => {
        const failing = pr({ number: 12, title: 'Fix login' });

        expect(
            describeEvent({ kind: 'checks-failed', pr: failing, checks: ['lint', 'test'] }, 'o/r')
        ).toEqual({ title: 'Checks failed', subtitle: 'o/r', body: '#12 Fix login\nlint, test' });
        expect(
            describeEvent({ kind: 'changes-requested', pr: failing, actor: 'ann' }, 'o/r').title
        ).toBe('ann requested changes');
        expect(
            describeEvent({ kind: 'merged-by-other', pr: failing, actor: 'bob' }, 'o/r').title
        ).toBe('Merged by bob');
    });

    it('counts the new comments, naming the commenter when there is one', () => {
        const title = (count: number, actor?: string) =>
            describeEvent(
                { kind: 'commented', pr: pr(), count, ...(actor ? { actor } : {}) },
                'o/r'
            ).title;

        expect(title(1, 'ann')).toBe('ann commented');
        expect(title(3, 'ann')).toBe('ann left 3 comments');
        expect(title(3)).toBe('3 new comments');
        expect(title(1)).toBe('New comment');
    });

    it('has a title for every event kind', () => {
        const kinds = [
            'review-requested',
            'changes-requested',
            'closed-unmerged',
            'checks-failed',
            'approved',
            'merge-conflict',
            'ready-to-merge',
            'merged-by-other',
            'commented',
        ] as const;

        for (const kind of kinds) {
            expect(describeEvent({ kind, pr: pr() }, 'o/r').title).toBeTruthy();
        }
    });
});
