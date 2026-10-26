import { setActivePinia, createPinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
    isReadyToMerge,
    selectedAuthors,
    toggleAuthor,
    useDashboardStore,
} from '@/stores/dashboard';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { AuthorFilter, DashboardPr, DashboardSnapshot, DashboardState } from '@/shared/types';

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
    return {
        status: 'ok',
        snapshot: snapshot(),
        activity: [],
        showDrafts: true,
        authors: 'me',
        ...overrides,
    };
}

describe('author filter helpers', () => {
    const known = ['me', 'ann', 'bob'];

    it('resolves the logins a filter selects', () => {
        expect(selectedAuthors('me', 'me')).toEqual(new Set(['me']));
        expect(selectedAuthors(['ann'], 'me')).toEqual(new Set(['ann']));
        expect(selectedAuthors('all', 'me')).toBeNull();
    });

    it('adds and removes logins, collapsing back to me', () => {
        expect(toggleAuthor('me', 'ann', 'me', known)).toEqual(['me', 'ann']);
        expect(toggleAuthor(['me', 'ann'], 'ann', 'me', known)).toBe('me');
        expect(toggleAuthor('me', 'me', 'me', known)).toEqual([]);
    });

    it('keeps everyone else when unticking someone under All', () => {
        expect(toggleAuthor('all', 'bob', 'me', known)).toEqual(['me', 'ann']);
    });

    it('keeps a selected login that no longer has an open PR', () => {
        expect(toggleAuthor(['gone'], 'ann', 'me', known)).toEqual(['ann', 'gone']);
    });
});

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
        setDashboardAuthors: vi
            .fn<(authors: AuthorFilter) => Promise<DashboardState>>()
            .mockImplementation(async (authors) => ({ ...result, authors })),
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

    // My PRs: 1 changes requested, 2 ready, 3 draft, 4 closed, 5 failing and stale.
    // Bob's: 7 failing and stale, 8 waiting.
    function scopedSnapshot() {
        const staleDate = '2026-10-10T00:00:00Z';
        const mineOpen = [
            pr({ id: 'A', number: 1, reviewDecision: 'CHANGES_REQUESTED' }),
            pr({ id: 'B', number: 2, reviewDecision: 'APPROVED', ci: 'passing' }),
            pr({ id: 'C', number: 3, isDraft: true }),
            pr({ id: 'E', number: 5, ci: 'failing', updatedAt: staleDate }),
        ];
        return snapshot({
            toReview: [pr({ id: 'R', number: 9, author: 'ann' })],
            mine: [...mineOpen, pr({ id: 'D', number: 4, state: 'CLOSED' })],
            open: [
                ...mineOpen,
                pr({ id: 'X', number: 7, author: 'bob', ci: 'failing', updatedAt: staleDate }),
                pr({ id: 'Y', number: 8, author: 'bob' }),
                pr({ id: 'R', number: 9, author: 'ann' }),
            ],
        });
    }

    it("fills the overview cards in display order with the viewer's own PRs by default", () => {
        const store = useDashboardStore();
        store.applyState(state({ snapshot: scopedSnapshot() }));

        expect(store.categories.map((c) => c.key)).toEqual([
            'review',
            'changes',
            'ready',
            'failing',
            'open',
            'stale',
            'drafts',
        ]);
        expect(counts(store)).toEqual({
            review: [9],
            changes: [1],
            ready: [2],
            failing: [5],
            open: [1, 2, 3, 5],
            stale: [5],
            drafts: [3],
        });
        expect(store.categories.find((c) => c.key === 'open')?.label).toBe('Your open PRs');
        expect(store.openCount).toBe(4);
        expect(store.openLabel).toBe('open by you');
        expect(store.authorsLabel).toBe('You');
    });

    it("counts every author with All, keeping review requests the viewer's", () => {
        const store = useDashboardStore();
        store.applyState(state({ authors: 'all', snapshot: scopedSnapshot() }));

        expect(counts(store)).toMatchObject({
            review: [9],
            failing: [5, 7],
            open: [1, 2, 3, 5, 7, 8, 9],
            stale: [5, 7],
        });
        expect(store.categories.find((c) => c.key === 'open')).toMatchObject({
            label: 'Open PRs',
            caption: 'Any author',
        });
        expect(store.openLabel).toBe('open');
    });

    it('counts only the picked authors', () => {
        const store = useDashboardStore();
        store.applyState(state({ authors: ['bob'], snapshot: scopedSnapshot() }));

        expect(counts(store)).toMatchObject({ failing: [7], open: [7, 8], stale: [7] });
        expect(store.categories.find((c) => c.key === 'failing')?.caption).toBe('By bob');
        expect(store.openLabel).toBe('open by bob');
        expect(store.authorsLabel).toBe('bob');
    });

    it('lists the viewer first, then every other author with an open PR', () => {
        const store = useDashboardStore();
        store.applyState(state({ snapshot: scopedSnapshot() }));

        expect(store.knownAuthors).toEqual(['me', 'ann', 'bob']);
        expect(store.isAuthorSelected('me')).toBe(true);
        expect(store.isAuthorSelected('bob')).toBe(false);
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

        it('persists author picks, and All toggles back to the viewer', async () => {
            const api = stubApi(state({ snapshot: snapshot({ open: [pr({ author: 'bob' })] }) }));
            const store = useDashboardStore();
            await store.load();

            await store.toggleAuthorSelected('bob');
            expect(api.setDashboardAuthors).toHaveBeenLastCalledWith(['me', 'bob']);
            expect(store.authors).toEqual(['me', 'bob']);

            await store.toggleAllAuthors();
            expect(store.authors).toBe('all');
            await store.toggleAllAuthors();
            expect(store.authors).toBe('me');
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

        it("opens a notification's PR when the snapshot has it, else its GitHub page", () => {
            const openExternal = openApi();
            const comparison = useComparisonStore();
            comparison.repoPath = '/repo';
            comparison.branches = [
                { name: 'main', kind: 'local' },
                { name: 'feat/x', kind: 'local' },
            ];
            const store = useDashboardStore();
            store.applyState(state({ snapshot: snapshot({ mine: [pr({ number: 5 })] }) }));
            const entry = {
                kind: 'approved' as const,
                at: '2026-10-26T12:00:00Z',
                number: 5,
                title: 'Add notifications',
                url: 'https://github.com/o/r/pull/5',
            };

            store.openActivity(entry);
            expect(useUiStore().mainView).toBe('pr');
            expect(openExternal).not.toHaveBeenCalled();

            store.openActivity({ ...entry, number: 99, url: 'https://github.com/o/r/pull/99' });
            expect(openExternal).toHaveBeenCalledWith('https://github.com/o/r/pull/99');
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
