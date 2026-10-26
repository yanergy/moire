import { setActivePinia, createPinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { groupOf, isReadyToMerge, useDashboardStore } from '@/stores/dashboard';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { DashboardPr, DashboardSnapshot, DashboardState } from '@/shared/types';

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
        fetchedAt: '2026-10-26T12:00:00Z',
        toReview: [],
        mine: [],
        failureNotified: [],
        ...overrides,
    };
}

function state(overrides: Partial<DashboardState> = {}): DashboardState {
    return { status: 'ok', snapshot: snapshot(), activity: [], showDrafts: true, ...overrides };
}

describe('groupOf', () => {
    it('puts each PR in the group for what it needs most', () => {
        expect(groupOf(pr({ isDraft: true, reviewDecision: 'CHANGES_REQUESTED' }))).toBe('drafts');
        expect(groupOf(pr({ reviewDecision: 'CHANGES_REQUESTED', ci: 'failing' }))).toBe(
            'changes-requested'
        );
        expect(groupOf(pr({ mergeable: 'CONFLICTING', ci: 'failing' }))).toBe('merge-conflict');
        expect(groupOf(pr({ ci: 'failing', reviewDecision: 'APPROVED' }))).toBe('checks-failing');
        expect(groupOf(pr({ reviewDecision: 'APPROVED', ci: 'passing' }))).toBe('ready');
        expect(groupOf(pr({ reviewDecision: 'APPROVED', ci: 'pending' }))).toBe('approved');
        expect(groupOf(pr())).toBe('waiting');
    });

    it('treats a PR without checks as ready once approved', () => {
        expect(isReadyToMerge(pr({ reviewDecision: 'APPROVED', ci: 'none' }))).toBe(true);
        expect(isReadyToMerge(pr({ reviewDecision: 'APPROVED', mergeable: 'UNKNOWN' }))).toBe(
            false
        );
    });
});

// A bridge stub for the store's three dashboard calls, all resolving `result`.
function stubApi(result: DashboardState = state()) {
    const api = {
        getDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(result),
        refreshDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(result),
        setDashboardShowDrafts: vi
            .fn<(show: boolean) => Promise<DashboardState>>()
            .mockResolvedValue(result),
    };
    window.api = api as unknown as Window['api'];
    return api;
}

function openApi() {
    const openExternal = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
    window.api = {
        openExternal,
        getChangedFiles: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        getPullRequest: vi
            .fn<() => Promise<unknown>>()
            .mockResolvedValue({ status: 'no-pr', pr: null }),
    } as unknown as Window['api'];
    return openExternal;
}

describe('dashboard store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        delete window.api;
    });

    it('applies a pushed state', () => {
        const store = useDashboardStore();
        store.applyState(state({ status: 'error', message: 'offline', showDrafts: false }));

        expect(store.status).toBe('error');
        expect(store.message).toBe('offline');
        expect(store.showDrafts).toBe(false);
    });

    it('groups the open PRs in display order, leaving out empty groups and closed PRs', () => {
        const store = useDashboardStore();
        store.applyState(
            state({
                snapshot: snapshot({
                    mine: [
                        pr({ id: 'A', number: 1 }),
                        pr({ id: 'B', number: 2, reviewDecision: 'CHANGES_REQUESTED' }),
                        pr({ id: 'C', number: 3, isDraft: true }),
                        pr({ id: 'D', number: 4, state: 'MERGED' }),
                    ],
                }),
            })
        );

        expect(store.groups.map((g) => [g.key, g.prs.map((p) => p.number)])).toEqual([
            ['changes-requested', [2]],
            ['waiting', [1]],
            ['drafts', [3]],
        ]);
    });

    it('hides drafts everywhere when Show drafts is off', () => {
        const store = useDashboardStore();
        store.applyState(
            state({
                showDrafts: false,
                snapshot: snapshot({
                    toReview: [pr({ id: 'R', number: 9, author: 'ann', isDraft: true })],
                    mine: [
                        pr({ id: 'C', number: 3, isDraft: true }),
                        pr({ id: 'X', number: 5, isDraft: true, state: 'CLOSED' }),
                    ],
                }),
            })
        );

        expect(store.toReview).toEqual([]);
        expect(store.groups).toEqual([]);
        expect(store.recentlyClosed).toEqual([]);
    });

    it('lists PRs closed without merge, most recent first', () => {
        const store = useDashboardStore();
        store.applyState(
            state({
                snapshot: snapshot({
                    mine: [
                        pr({
                            id: 'A',
                            number: 1,
                            state: 'CLOSED',
                            closedAt: '2026-10-20T00:00:00Z',
                        }),
                        pr({
                            id: 'B',
                            number: 2,
                            state: 'MERGED',
                            closedAt: '2026-10-25T00:00:00Z',
                        }),
                        pr({
                            id: 'C',
                            number: 3,
                            state: 'CLOSED',
                            closedAt: '2026-10-24T00:00:00Z',
                        }),
                    ],
                }),
            })
        );

        expect(store.recentlyClosed.map((p) => p.number)).toEqual([3, 1]);
    });

    describe('summary', () => {
        it('counts what needs attention', () => {
            const store = useDashboardStore();
            store.applyState(
                state({
                    snapshot: snapshot({
                        toReview: [
                            pr({ id: 'R1', number: 7, author: 'ann' }),
                            pr({ id: 'R2', number: 8, author: 'ann' }),
                            pr({ id: 'R3', number: 9, author: 'ann' }),
                        ],
                        mine: [
                            pr({ id: 'A', number: 1, reviewDecision: 'CHANGES_REQUESTED' }),
                            pr({ id: 'B', number: 2, mergeable: 'CONFLICTING' }),
                            pr({ id: 'C', number: 3, mergeable: 'CONFLICTING' }),
                            pr({ id: 'D', number: 4, ci: 'failing' }),
                            pr({ id: 'E', number: 5, reviewDecision: 'APPROVED', ci: 'passing' }),
                        ],
                    }),
                })
            );

            expect(store.summary).toBe(
                '3 PRs to review, 1 needs changes, 2 have merge conflicts, 1 has failing checks, 1 ready to merge'
            );
        });

        it('says so when nothing needs attention', () => {
            const store = useDashboardStore();
            store.applyState(state({ snapshot: snapshot({ mine: [pr()] }) }));
            expect(store.summary).toBe('Nothing needs your attention');
        });
    });

    describe('bridge calls', () => {
        it('loads and refreshes through the bridge, tracking loading', async () => {
            const api = stubApi(
                state({ snapshot: snapshot({ toReview: [pr({ author: 'ann' })] }) })
            );
            const store = useDashboardStore();

            const pending = store.load();
            expect(store.loading).toBe(true);
            await pending;

            expect(api.getDashboard).toHaveBeenCalledTimes(1);
            expect(store.loading).toBe(false);
            expect(store.toReview).toHaveLength(1);

            await store.refresh();
            expect(api.refreshDashboard).toHaveBeenCalledTimes(1);
        });

        it('flips Show drafts right away and persists it', async () => {
            const api = stubApi(state({ showDrafts: false }));
            const store = useDashboardStore();

            const pending = store.setShowDrafts(false);
            expect(store.showDrafts).toBe(false);
            await pending;

            expect(api.setDashboardShowDrafts).toHaveBeenCalledWith(false);
        });

        it('swallows a rejection when no repository is open', async () => {
            const api = stubApi();
            api.getDashboard.mockRejectedValue(new Error('No repository is open.'));
            const store = useDashboardStore();

            await expect(store.load()).resolves.toBeUndefined();
            expect(store.loading).toBe(false);
            expect(store.snapshot).toBeNull();
        });

        it('does nothing without a bridge', async () => {
            const store = useDashboardStore();
            await expect(store.load()).resolves.toBeUndefined();
            await expect(store.refresh()).resolves.toBeUndefined();
        });
    });

    describe('openPr', () => {
        it('selects the PR range and switches to the PR view', () => {
            openApi();
            const comparison = useComparisonStore();
            comparison.repoPath = '/repo';
            comparison.branches = [
                { name: 'main', kind: 'local' },
                { name: 'origin/feat/x', kind: 'remote' },
            ];

            useDashboardStore().openPr(pr());

            expect([comparison.base, comparison.head]).toEqual(['main', 'origin/feat/x']);
            expect(useUiStore().mainView).toBe('pr');
        });

        it('opens a fork PR, or one with unavailable branches, on GitHub', () => {
            const openExternal = openApi();
            const comparison = useComparisonStore();
            comparison.branches = [
                { name: 'main', kind: 'local' },
                { name: 'feat/x', kind: 'local' },
            ];
            const store = useDashboardStore();

            store.openPr(pr({ isCrossRepository: true }));
            store.openPr(pr({ headRefName: 'feat/missing' }));

            expect(openExternal).toHaveBeenCalledTimes(2);
            expect(useUiStore().mainView).toBe('diff');
        });
    });
});
