import { setActivePinia, createPinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { isReadyToMerge, useDashboardStore } from '@/stores/dashboard';
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

describe('isReadyToMerge', () => {
    it('treats a PR without checks as ready once approved', () => {
        expect(isReadyToMerge(pr({ reviewDecision: 'APPROVED', ci: 'none' }))).toBe(true);
        expect(isReadyToMerge(pr({ reviewDecision: 'APPROVED', mergeable: 'UNKNOWN' }))).toBe(
            false
        );
        expect(isReadyToMerge(pr({ reviewDecision: 'APPROVED', isDraft: true }))).toBe(false);
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

// The PR numbers on each card, by card key.
function counts(store: ReturnType<typeof useDashboardStore>) {
    return Object.fromEntries(
        store.categories.map((category) => [category.key, category.prs.map((p) => p.number)])
    );
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

    it('fills the overview cards in display order', () => {
        const store = useDashboardStore();
        const staleDate = '2026-10-10T00:00:00Z';
        store.applyState(
            state({
                snapshot: snapshot({
                    toReview: [pr({ id: 'R', number: 9, author: 'ann' })],
                    mine: [
                        pr({ id: 'A', number: 1, reviewDecision: 'CHANGES_REQUESTED' }),
                        pr({ id: 'B', number: 2, reviewDecision: 'APPROVED', ci: 'passing' }),
                        pr({ id: 'C', number: 3, isDraft: true }),
                        pr({ id: 'D', number: 4, state: 'CLOSED' }),
                    ],
                    open: [
                        pr({ id: 'A', number: 1, ci: 'failing' }),
                        pr({
                            id: 'X',
                            number: 7,
                            author: 'bob',
                            ci: 'failing',
                            updatedAt: staleDate,
                        }),
                        pr({ id: 'Y', number: 8, author: 'bob' }),
                    ],
                }),
            })
        );

        expect(store.categories.map((c) => c.key)).toEqual([
            'review',
            'changes',
            'ready',
            'failing',
            'mine',
            'stale',
            'drafts',
        ]);
        expect(counts(store)).toEqual({
            review: [9],
            changes: [1],
            ready: [2],
            failing: [1, 7],
            mine: [1, 2, 3],
            stale: [7],
            drafts: [3],
        });
        expect(store.openCount).toBe(3);
    });

    it('drops drafts from every card, and the drafts card, when Show drafts is off', () => {
        const store = useDashboardStore();
        store.applyState(
            state({
                showDrafts: false,
                snapshot: snapshot({
                    toReview: [pr({ id: 'R', number: 9, author: 'ann', isDraft: true })],
                    mine: [pr({ id: 'C', number: 3, isDraft: true })],
                    open: [pr({ id: 'C', number: 3, isDraft: true, ci: 'failing' })],
                }),
            })
        );

        expect(store.categories.map((c) => c.key)).not.toContain('drafts');
        expect(store.categories.every((c) => c.prs.length === 0)).toBe(true);
        expect(store.openCount).toBe(0);
    });

    it('copes with a snapshot saved before the repository wide list existed', () => {
        const store = useDashboardStore();
        const old = snapshot();
        delete old.open;
        store.applyState(state({ snapshot: old }));

        expect(store.openCount).toBe(0);
        expect(store.categories.find((c) => c.key === 'failing')?.prs).toEqual([]);
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
