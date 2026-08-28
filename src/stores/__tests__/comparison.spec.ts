import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { useComparisonStore } from '@/stores/comparison';
import type { DirNode, FileNode, TreeNode } from '@/stores/comparison';

const dirs = (nodes: TreeNode[]): DirNode[] => nodes.filter((n): n is DirNode => n.kind === 'dir');
const files = (nodes: TreeNode[]): FileNode[] =>
    nodes.filter((n): n is FileNode => n.kind === 'file');

describe('comparison store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('reports file count and +/- totals from the change set', () => {
        const store = useComparisonStore();
        expect(store.fileCount).toBe(10);
        expect(store.totalAdditions).toBe(336);
        expect(store.totalDeletions).toBe(267);
    });

    it('splits branches into local and remote', () => {
        const store = useComparisonStore();
        expect(store.localBranches.every((b) => b.kind === 'local')).toBe(true);
        expect(store.remoteBranches.every((b) => b.kind === 'remote')).toBe(true);
        expect(store.localBranches.length + store.remoteBranches.length).toBe(
            store.branches.length
        );
    });

    it('formats the range label per compare mode', () => {
        const store = useComparisonStore();
        expect(store.rangeLabel).toBe('main...WORKING TREE');
        store.setCompareMode('direct');
        expect(store.rangeLabel).toBe('main..WORKING TREE');
    });

    it('swaps base and head', () => {
        const store = useComparisonStore();
        store.setBase('develop');
        store.setHead('feat/monaco-spike');
        store.swap();
        expect(store.base).toBe('feat/monaco-spike');
        expect(store.head).toBe('develop');
    });

    it('tracks viewed files and the viewed count', () => {
        const store = useComparisonStore();
        expect(store.viewedCount).toBe(2);
        expect(store.isViewed('shared/types.ts')).toBe(true);

        store.toggleViewed('shared/types.ts');
        expect(store.isViewed('shared/types.ts')).toBe(false);
        expect(store.viewedCount).toBe(1);

        store.toggleViewed('electron/git/parsers.ts');
        expect(store.isViewed('electron/git/parsers.ts')).toBe(true);
        expect(store.viewedCount).toBe(2);
    });

    it('selects a file and exposes its file pair', () => {
        const store = useComparisonStore();
        expect(store.selectedFile.path).toBe('electron/git/parsers.ts');

        store.selectFile('shared/types.ts');
        expect(store.selectedFile.path).toBe('shared/types.ts');
        expect(store.selectedPair.path).toBe('shared/types.ts');
        expect(store.selectedPair.language).toBe('typescript');
    });

    it('builds a directory-grouped tree with depth-based nesting', () => {
        const store = useComparisonStore();
        const electron = dirs(store.treeNodes).find((n) => n.path === 'electron');
        const git = dirs(store.treeNodes).find((n) => n.path === 'electron/git');
        const parsers = files(store.treeNodes).find((n) => n.path === 'electron/git/parsers.ts');

        expect(electron?.depth).toBe(0);
        expect(git?.depth).toBe(1);
        expect(parsers?.depth).toBe(2);
    });

    it('computes per-directory viewed tallies', () => {
        const store = useComparisonStore();
        const shared = dirs(store.treeNodes).find((n) => n.path === 'shared');
        expect(shared?.seen).toBe(1);
        expect(shared?.total).toBe(1);
        expect(shared?.allSeen).toBe(true);
    });

    it('collapses and expands a single directory', () => {
        const store = useComparisonStore();
        store.toggleDir('electron');

        const electron = dirs(store.treeNodes).find((n) => n.path === 'electron');
        expect(electron?.open).toBe(false);
        expect(store.treeNodes.some((n) => n.path === 'electron/git')).toBe(false);

        store.toggleDir('electron');
        expect(store.treeNodes.some((n) => n.path === 'electron/git')).toBe(true);
    });

    it('collapses and expands all folders', () => {
        const store = useComparisonStore();

        store.collapseAll();
        const collapsed = store.treeNodes;
        expect(collapsed.every((n) => n.kind === 'dir' && n.depth === 0)).toBe(true);
        expect(dirs(collapsed).every((n) => !n.open)).toBe(true);

        store.expandAll();
        expect(store.treeNodes.some((n) => n.kind === 'file')).toBe(true);
    });

    it('toggleAll opens everything only when fully collapsed', () => {
        const store = useComparisonStore();
        expect(store.allCollapsed).toBe(false); // default is fully expanded

        store.toggleAll(); // expanded → collapse
        expect(store.allCollapsed).toBe(true);
        expect(store.treeNodes.every((n) => n.kind === 'dir' && n.depth === 0)).toBe(true);

        store.toggleAll(); // fully collapsed → expand
        expect(store.allCollapsed).toBe(false);
        expect(store.treeNodes.some((n) => n.kind === 'file')).toBe(true);
    });

    it('toggleAll collapses from a mixed open/closed state', () => {
        const store = useComparisonStore();
        store.toggleDir('electron'); // close a single folder → mixed
        expect(store.allCollapsed).toBe(false);

        store.toggleAll();
        expect(store.allCollapsed).toBe(true);
    });

    it('filters the tree and force-opens matching folders even when collapsed', () => {
        const store = useComparisonStore();
        store.collapseAll();
        store.setTreeFilter('parsers');

        const shown = files(store.treeNodes);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every((n) => n.path.includes('parsers'))).toBe(true);
        expect(store.treeNodes.some((n) => n.path === 'electron/git/parsers.ts')).toBe(true);
    });

    describe('repository opening', () => {
        const RECENTS = ['/repos/moire', '/work/api-service'];

        function stubApi(overrides: Record<string, unknown> = {}) {
            const api = {
                openRepoDialog: vi
                    .fn<() => Promise<string | null>>()
                    .mockResolvedValue('/repos/design-system'),
                openRepo: vi.fn<(path: string) => Promise<{ path: string; name: string }>>((path) =>
                    Promise.resolve({ path, name: path.split('/').pop() ?? path })
                ),
                getRecentRepos: vi.fn<() => Promise<string[]>>().mockResolvedValue(RECENTS),
                removeRecentRepo: vi.fn<(path: string) => Promise<string[]>>((path) =>
                    Promise.resolve(RECENTS.filter((entry) => entry !== path))
                ),
                ...overrides,
            };
            window.api = api as unknown as Window['api'];
            return api;
        }

        afterEach(() => {
            delete window.api;
            vi.restoreAllMocks();
        });

        it('loads recent repos from the bridge', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.loadRecentRepos();
            expect(api.getRecentRepos).toHaveBeenCalled();
            expect(store.recentRepos).toEqual(RECENTS);
        });

        it('opens a repo by path, names it, and refreshes recents', async () => {
            stubApi();
            const store = useComparisonStore();
            await store.openRecent('/work/api-service');
            expect(store.repoName).toBe('api-service');
            expect(store.repoPath).toBe('/work/api-service');
            expect(store.recentRepos).toEqual(RECENTS);
        });

        it('runs the picker then opens the chosen folder', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRepository();
            expect(api.openRepoDialog).toHaveBeenCalled();
            expect(store.repoName).toBe('design-system');
        });

        it('removes a repo from recents', async () => {
            stubApi();
            const store = useComparisonStore();
            await store.loadRecentRepos();
            await store.removeRecent('/repos/moire');
            expect(store.recentRepos).toEqual(['/work/api-service']);
        });

        it('clears the selection when the open repo is removed from recents', async () => {
            stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.repoName).toBe('moire');

            await store.removeRecent('/repos/moire');
            expect(store.repoName).toBe('');
            expect(store.repoPath).toBe('');
        });

        it('restores and opens the most recent repo on startup', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.restoreLastRepo();
            expect(api.openRepo).toHaveBeenCalledWith('/repos/moire');
            expect(store.repoName).toBe('moire');
            expect(store.repoPath).toBe('/repos/moire');
            expect(store.recentRepos).toEqual(RECENTS);
        });

        it('clears the selection and prunes recents when the restored folder is gone', async () => {
            const api = stubApi({ openRepo: vi.fn<() => Promise<null>>().mockResolvedValue(null) });
            const store = useComparisonStore();
            await store.restoreLastRepo();
            expect(store.repoName).toBe('');
            expect(store.repoPath).toBe('');
            expect(api.removeRecentRepo).toHaveBeenCalledWith('/repos/moire');
            expect(store.recentRepos).toEqual(['/work/api-service']);
        });

        it('leaves state untouched when main rejects a freshly picked folder', async () => {
            const api = stubApi({ openRepo: vi.fn<() => Promise<null>>().mockResolvedValue(null) });
            const store = useComparisonStore();
            await store.openRecent('/not/a/repo');
            expect(store.repoName).toBe('');
            expect(store.repoPath).toBe('');
            // Never a recent, so the list is left alone.
            expect(api.removeRecentRepo).not.toHaveBeenCalled();
        });

        it('prunes a recent entry that no longer opens', async () => {
            const api = stubApi({ openRepo: vi.fn<() => Promise<null>>().mockResolvedValue(null) });
            const store = useComparisonStore();
            await store.loadRecentRepos();
            await store.openRecent('/repos/moire');
            expect(api.removeRecentRepo).toHaveBeenCalledWith('/repos/moire');
            expect(store.recentRepos).toEqual(['/work/api-service']);
        });

        it('no-ops without the preload bridge', async () => {
            const store = useComparisonStore();
            await store.openRepository();
            await store.loadRecentRepos();
            expect(store.repoName).toBe('');
            expect(store.recentRepos).toEqual([]);
        });
    });
});
