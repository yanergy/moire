import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { useComparisonStore } from '@/stores/comparison';
import type { DirNode, FileNode, TreeNode } from '@/stores/comparison';
import type { BranchInfo, ChangedFile, CompareMode, FilePair } from '@/shared/types';
import { BRANCHES as PROTOTYPE_BRANCHES, CHANGED_FILES } from '@/components/__tests__/fixtures';

const dirs = (nodes: TreeNode[]): DirNode[] => nodes.filter((n): n is DirNode => n.kind === 'dir');
const files = (nodes: TreeNode[]): FileNode[] =>
    nodes.filter((n): n is FileNode => n.kind === 'file');

// A file pair that echoes the requested path, so a test can assert both the call
// arguments and that the returned pair reached the store.
const pairFor = (path: string): FilePair => ({
    path,
    oldContent: `old ${path}`,
    newContent: `new ${path}`,
    language: 'typescript',
    binary: false,
    tooLarge: false,
    sizeBytes: 0,
});

// Seed the store's state directly with the prototype dataset (no bridge), the
// way a repo open would, so the tree/viewed/filter getters have data to work on
// without a repo open. Assigning refs skips the range setters, so nothing reaches
// for window.api. The +/- totals (336/267) are asserted below.
function seededStore() {
    const store = useComparisonStore();
    store.branches = PROTOTYPE_BRANCHES;
    store.files = CHANGED_FILES;
    store.base = 'main';
    store.toggleViewed('shared/types.ts');
    store.toggleViewed('src/stores/comparison.ts');
    return store;
}

describe('comparison store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('reports file count and +/- totals from the change set', () => {
        const store = seededStore();
        expect(store.fileCount).toBe(10);
        expect(store.totalAdditions).toBe(336);
        expect(store.totalDeletions).toBe(267);
    });

    it('splits branches into local and remote', () => {
        const store = seededStore();
        expect(store.localBranches.every((b) => b.kind === 'local')).toBe(true);
        expect(store.remoteBranches.every((b) => b.kind === 'remote')).toBe(true);
        expect(store.localBranches.length + store.remoteBranches.length).toBe(
            store.branches.length
        );
    });

    it('formats the range label per compare mode', () => {
        const store = useComparisonStore();
        store.base = 'main';
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

    it('clears the base when swapping away from the working tree', () => {
        const store = useComparisonStore();
        store.setBase('main');
        store.setHead('WORKING TREE');

        store.swap();

        // The working-tree sentinel is head-only, so it cannot become the base:
        // the base selector clears and the old base moves to the head, instead of
        // producing an invalid `WORKING TREE...main` revision.
        expect(store.base).toBe('');
        expect(store.head).toBe('main');

        // Swapping back restores the working tree to the head and the branch to
        // the base (an empty base maps to the working tree, not an empty head).
        store.swap();
        expect(store.base).toBe('main');
        expect(store.head).toBe('WORKING TREE');
    });

    it('tracks viewed files and the viewed count', () => {
        const store = seededStore();
        expect(store.viewedCount).toBe(2);
        expect(store.isViewed('shared/types.ts')).toBe(true);

        store.toggleViewed('shared/types.ts');
        expect(store.isViewed('shared/types.ts')).toBe(false);
        expect(store.viewedCount).toBe(1);

        store.toggleViewed('electron/git/parsers.ts');
        expect(store.isViewed('electron/git/parsers.ts')).toBe(true);
        expect(store.viewedCount).toBe(2);
    });

    it('selects a file', () => {
        const store = seededStore();
        expect(store.selectedFile.path).toBe('electron/git/parsers.ts');

        store.selectFile('shared/types.ts');
        expect(store.selectedFile.path).toBe('shared/types.ts');
    });

    it('builds a directory-grouped tree with depth-based nesting', () => {
        const store = seededStore();
        const electron = dirs(store.treeNodes).find((n) => n.path === 'electron');
        const git = dirs(store.treeNodes).find((n) => n.path === 'electron/git');
        const parsers = files(store.treeNodes).find((n) => n.path === 'electron/git/parsers.ts');

        expect(electron?.depth).toBe(0);
        expect(git?.depth).toBe(1);
        expect(parsers?.depth).toBe(2);
    });

    it('carries the old path on a renamed file node', () => {
        const store = useComparisonStore();
        store.files = [
            {
                path: 'src/stores/comparison.ts',
                oldPath: 'src/lib/compare.ts',
                status: 'R',
                additions: 2,
                deletions: 1,
                binary: false,
            },
        ];

        const node = files(store.treeNodes).find((n) => n.path === 'src/stores/comparison.ts');
        expect(node?.oldPath).toBe('src/lib/compare.ts');
    });

    it('folds a single-child directory chain into one combined row', () => {
        const store = useComparisonStore();
        store.files = [
            { path: 'a/b/c/file.txt', status: 'M', additions: 1, deletions: 0, binary: false },
        ];

        const dirNodes = dirs(store.treeNodes);
        expect(dirNodes).toHaveLength(1);
        expect(dirNodes[0]?.name).toBe('a/b/c');
        expect(dirNodes[0]?.path).toBe('a/b/c');
        expect(dirNodes[0]?.depth).toBe(0);

        const file = files(store.treeNodes).find((n) => n.name === 'file.txt');
        expect(file?.depth).toBe(1);
    });

    it('stops folding at a directory that holds files or branches', () => {
        const store = useComparisonStore();
        store.files = [
            { path: 'a/b/one.txt', status: 'M', additions: 1, deletions: 0, binary: false },
            { path: 'a/b/c/two.txt', status: 'M', additions: 1, deletions: 0, binary: false },
        ];

        const dirNodes = dirs(store.treeNodes);
        // a folds into b (a has no files and one child); b holds a file and a
        // child, so it is the branch point and c stays a separate row under it.
        expect(dirNodes.find((n) => n.name === 'a/b')?.path).toBe('a/b');
        expect(dirNodes.find((n) => n.name === 'c')?.path).toBe('a/b/c');
    });

    it('collapses a folded chain as a single unit', () => {
        const store = useComparisonStore();
        store.files = [
            { path: 'a/b/c/file.txt', status: 'M', additions: 1, deletions: 0, binary: false },
        ];

        store.collapseAll();
        expect(store.allCollapsed).toBe(true);
        expect(dirs(store.treeNodes)[0]?.open).toBe(false);

        store.toggleDir('a/b/c');
        expect(dirs(store.treeNodes)[0]?.open).toBe(true);
    });

    it('computes per-directory viewed tallies', () => {
        const store = seededStore();
        const shared = dirs(store.treeNodes).find((n) => n.path === 'shared');
        expect(shared?.seen).toBe(1);
        expect(shared?.total).toBe(1);
        expect(shared?.allSeen).toBe(true);
    });

    it('marks every file under a folder viewed, then clears them', () => {
        const store = seededStore();
        expect(store.isViewed('electron/git/parsers.ts')).toBe(false);
        expect(store.isViewed('electron/git/GitService.ts')).toBe(false);

        store.toggleDirViewed('electron/git');
        expect(store.isViewed('electron/git/parsers.ts')).toBe(true);
        expect(store.isViewed('electron/git/GitService.ts')).toBe(true);
        expect(dirs(store.treeNodes).find((n) => n.path === 'electron/git')?.allSeen).toBe(true);

        // All viewed now, so toggling the same folder clears the lot.
        store.toggleDirViewed('electron/git');
        expect(store.isViewed('electron/git/parsers.ts')).toBe(false);
        expect(store.isViewed('electron/git/GitService.ts')).toBe(false);
    });

    it('marks a partially-viewed folder as fully viewed in one toggle', () => {
        const store = seededStore(); // src/stores/comparison.ts is already viewed
        const src = () => dirs(store.treeNodes).find((n) => n.path === 'src');
        expect(src()?.seen).toBe(1);
        expect(src()?.total).toBe(4);

        store.toggleDirViewed('src');
        expect(src()?.allSeen).toBe(true);
        expect(store.isViewed('src/components/DiffPane.vue')).toBe(true);
        expect(store.isViewed('src/stores/comparison.ts')).toBe(true);
    });

    it('reaches nested files when a parent folder is toggled', () => {
        const store = seededStore();
        store.toggleDirViewed('electron');

        for (const path of [
            'electron/git/parsers.ts',
            'electron/ipc/handlers.ts',
            'electron/watcher/RepoWatcher.ts',
        ]) {
            expect(store.isViewed(path)).toBe(true);
        }
    });

    it('toggles only a folder’s filtered files', () => {
        const store = seededStore();
        store.setTreeFilter('parsers');

        // Under electron/git only parsers.ts is shown; GitService.ts is filtered out.
        store.toggleDirViewed('electron/git');
        expect(store.isViewed('electron/git/parsers.ts')).toBe(true);
        expect(store.isViewed('electron/git/GitService.ts')).toBe(false);
    });

    it('collapses and expands a single directory', () => {
        const store = seededStore();
        store.toggleDir('electron');

        const electron = dirs(store.treeNodes).find((n) => n.path === 'electron');
        expect(electron?.open).toBe(false);
        expect(store.treeNodes.some((n) => n.path === 'electron/git')).toBe(false);

        store.toggleDir('electron');
        expect(store.treeNodes.some((n) => n.path === 'electron/git')).toBe(true);
    });

    it('collapses and expands all folders', () => {
        const store = seededStore();

        store.collapseAll();
        const collapsed = store.treeNodes;
        expect(collapsed.every((n) => n.kind === 'dir' && n.depth === 0)).toBe(true);
        expect(dirs(collapsed).every((n) => !n.open)).toBe(true);

        store.expandAll();
        expect(store.treeNodes.some((n) => n.kind === 'file')).toBe(true);
    });

    it('toggleAll opens everything only when fully collapsed', () => {
        const store = seededStore();
        expect(store.allCollapsed).toBe(false); // default is fully expanded

        store.toggleAll(); // expanded → collapse
        expect(store.allCollapsed).toBe(true);
        expect(store.treeNodes.every((n) => n.kind === 'dir' && n.depth === 0)).toBe(true);

        store.toggleAll(); // fully collapsed → expand
        expect(store.allCollapsed).toBe(false);
        expect(store.treeNodes.some((n) => n.kind === 'file')).toBe(true);
    });

    it('toggleAll collapses from a mixed open/closed state', () => {
        const store = seededStore();
        store.toggleDir('electron'); // close a single folder → mixed
        expect(store.allCollapsed).toBe(false);

        store.toggleAll();
        expect(store.allCollapsed).toBe(true);
    });

    it('filters the tree and force-opens matching folders even when collapsed', () => {
        const store = seededStore();
        store.collapseAll();
        store.setTreeFilter('parsers');

        const shown = files(store.treeNodes);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every((n) => n.path.includes('parsers'))).toBe(true);
        expect(store.treeNodes.some((n) => n.path === 'electron/git/parsers.ts')).toBe(true);
    });

    describe('repository opening', () => {
        const RECENTS = ['/repos/moire', '/work/api-service'];
        const BRANCHES: BranchInfo[] = [
            { name: 'main', kind: 'local', isCurrent: true },
            { name: 'develop', kind: 'local' },
            { name: 'origin/main', kind: 'remote' },
        ];
        const CHANGED: ChangedFile[] = [
            { path: 'src/app.ts', status: 'M', additions: 3, deletions: 1, binary: false },
            { path: 'src/lib/util.ts', status: 'A', additions: 12, deletions: 0, binary: false },
        ];

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
                getBranchSelection: vi
                    .fn<(path: string) => Promise<{ base: string; head: string } | null>>()
                    .mockResolvedValue(null),
                setBranchSelection: vi
                    .fn<(path: string, base: string, head: string) => Promise<void>>()
                    .mockResolvedValue(undefined),
                getBranches: vi.fn<() => Promise<BranchInfo[]>>().mockResolvedValue(BRANCHES),
                getChangedFiles: vi
                    .fn<(base: string, head: string, mode: CompareMode) => Promise<ChangedFile[]>>()
                    .mockResolvedValue(CHANGED),
                getFilePair: vi.fn<
                    (
                        base: string,
                        head: string,
                        path: string,
                        mode: CompareMode
                    ) => Promise<FilePair>
                >((_base, _head, path) => Promise.resolve(pairFor(path))),
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

        it('loads the real branch list and defaults the base on open', async () => {
            stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.branches).toEqual(BRANCHES);
            expect(store.localBranches.map((b) => b.name)).toEqual(['main', 'develop']);
            expect(store.remoteBranches.map((b) => b.name)).toEqual(['origin/main']);
            expect(store.base).toBe('main');
            expect(store.head).toBe('WORKING TREE');
        });

        it('defaults the base to the current branch, even when main exists', async () => {
            stubApi({
                getBranches: vi.fn<() => Promise<BranchInfo[]>>().mockResolvedValue([
                    { name: 'main', kind: 'local' },
                    { name: 'feature', kind: 'local', isCurrent: true },
                ]),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.base).toBe('feature');
        });

        it('falls back to main when no branch is marked current', async () => {
            stubApi({
                getBranches: vi.fn<() => Promise<BranchInfo[]>>().mockResolvedValue([
                    { name: 'topic', kind: 'local' },
                    { name: 'main', kind: 'local' },
                ]),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.base).toBe('main');
        });

        it('resets the branch list, selection, and view state when the open repo is removed', async () => {
            stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.branches.length).toBeGreaterThan(0);
            expect(store.base).toBe('main');

            store.toggleViewed('src/app.ts');
            store.setTreeFilter('app');
            store.toggleDir('src');

            await store.removeRecent('/repos/moire');
            expect(store.repoName).toBe('');
            expect(store.branches).toEqual([]);
            expect(store.base).toBe('');
            expect(store.head).toBe('WORKING TREE');
            expect(store.files).toEqual([]);
            expect(store.selectedPath).toBe('');
            expect(store.viewed).toEqual({});
            expect(store.treeFilter).toBe('');
            expect(store.collapsed).toEqual({});
        });

        it('clears viewed marks, collapsed folders, and the filter when switching repos', async () => {
            stubApi();
            const store = useComparisonStore();

            await store.openRecent('/repos/moire');
            store.toggleViewed('src/app.ts');
            store.setTreeFilter('app');
            store.toggleDir('src');
            expect(store.viewed).toEqual({ 'src/app.ts': true });
            expect(store.treeFilter).toBe('app');
            expect(store.collapsed).toEqual({ src: true });

            // Opening a different repo starts from a clean tree: paths from the
            // previous repo mean nothing here, so none of that state carries over.
            await store.openRecent('/work/api-service');
            expect(store.viewed).toEqual({});
            expect(store.treeFilter).toBe('');
            expect(store.collapsed).toEqual({});
        });

        it('loads the changed files and selects the first on open', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(api.getChangedFiles).toHaveBeenCalledWith('main', 'WORKING TREE', 'merge-base');
            expect(store.files).toEqual(CHANGED);
            expect(store.selectedPath).toBe('src/app.ts');
        });

        it('reloads the changed files when the range changes', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            api.getChangedFiles.mockClear();

            store.setBase('develop');
            await flushPromises();
            expect(api.getChangedFiles).toHaveBeenCalledWith(
                'develop',
                'WORKING TREE',
                'merge-base'
            );
        });

        it('keeps the current selection across a reload when the file still exists', async () => {
            stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            store.selectFile('src/lib/util.ts');

            await store.loadChangedFiles();
            expect(store.selectedPath).toBe('src/lib/util.ts');
        });

        it('clears the change set when getChangedFiles rejects', async () => {
            stubApi({
                getChangedFiles: vi
                    .fn<() => Promise<ChangedFile[]>>()
                    .mockRejectedValue(new Error('bad ref')),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.files).toEqual([]);
            expect(store.selectedPath).toBe('');
        });

        it('loads the file pair for the selected file on open', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            expect(api.getFilePair).toHaveBeenCalledWith(
                'main',
                'WORKING TREE',
                'src/app.ts',
                'merge-base'
            );
            expect(store.selectedPair.path).toBe('src/app.ts');
            expect(store.selectedPair.newContent).toBe('new src/app.ts');
        });

        it('gates a large file behind Load diff, then reveals it once loaded', async () => {
            const api = stubApi();
            api.getFilePair.mockResolvedValue({
                ...pairFor('src/app.ts'),
                tooLarge: true,
                sizeBytes: 2 * 1024 * 1024,
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            expect(store.showDiffGate).toBe(true);

            // Clearing the gate refetches the withheld content (full=true), then reveals it.
            await store.loadLargeDiff();
            await flushPromises();
            expect(api.getFilePair).toHaveBeenLastCalledWith(
                'main',
                'WORKING TREE',
                'src/app.ts',
                'merge-base',
                true
            );
            expect(store.showDiffGate).toBe(false);
        });

        it('re-gates a large file after the selection changes', async () => {
            const api = stubApi();
            api.getFilePair.mockResolvedValue({
                ...pairFor('big'),
                tooLarge: true,
                sizeBytes: 2 * 1024 * 1024,
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            await store.loadLargeDiff();
            await flushPromises();
            expect(store.showDiffGate).toBe(false);

            store.selectFile('src/lib/util.ts');
            await flushPromises();
            expect(store.showDiffGate).toBe(true);
        });

        it('does not gate a large binary file, whose content is already withheld', async () => {
            const api = stubApi();
            api.getFilePair.mockResolvedValue({
                ...pairFor('logo.png'),
                oldContent: null,
                newContent: null,
                binary: true,
                tooLarge: true,
                sizeBytes: 4 * 1024 * 1024,
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            expect(store.showDiffGate).toBe(false);
            expect(store.showBinaryNotice).toBe(true);
        });

        it('shows an image preview, not the binary notice, for an image pair', async () => {
            const api = stubApi();
            api.getFilePair.mockResolvedValue({
                ...pairFor('logo.png'),
                oldContent: null,
                newContent: null,
                binary: true,
                image: true,
                oldImage: 'data:image/png;base64,AAAA',
                newImage: 'data:image/png;base64,BBBB',
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            expect(store.showImagePreview).toBe(true);
            expect(store.showBinaryNotice).toBe(false);
        });

        it('reloads the file pair when a different file is selected', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();
            api.getFilePair.mockClear();

            store.selectFile('src/lib/util.ts');
            await flushPromises();

            expect(api.getFilePair).toHaveBeenCalledWith(
                'main',
                'WORKING TREE',
                'src/lib/util.ts',
                'merge-base'
            );
            expect(store.selectedPair.path).toBe('src/lib/util.ts');
        });

        it('reloads the file pair when the range changes with the selection kept', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();
            api.getFilePair.mockClear();

            // src/app.ts still exists under the new base, so the selection holds
            // but the pair must refetch against the changed base.
            store.setBase('develop');
            await flushPromises();

            expect(api.getFilePair).toHaveBeenCalledWith(
                'develop',
                'WORKING TREE',
                'src/app.ts',
                'merge-base'
            );
        });

        it('drops a stale file-pair response so the latest selection wins', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            // Stage a slow first response, then a fast second one, both for the
            // current selection. The later request must win regardless of order.
            let resolveStale!: (pair: FilePair) => void;
            api.getFilePair
                .mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)))
                .mockResolvedValueOnce(pairFor('fresh'));

            const stalePending = store.loadFilePair();
            const freshDone = store.loadFilePair();
            await freshDone;
            expect(store.selectedPair.path).toBe('fresh');

            resolveStale(pairFor('stale'));
            await stalePending;
            expect(store.selectedPair.path).toBe('fresh');
        });

        it('blanks the file pair when getFilePair rejects', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();

            api.getFilePair.mockRejectedValueOnce(new Error('unreadable'));
            await store.loadFilePair();

            expect(store.selectedPair.oldContent).toBe('');
            expect(store.selectedPair.newContent).toBe('');
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

        it('persists the base and head per repo when the range changes', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            await flushPromises();
            api.setBranchSelection.mockClear();

            store.setBase('develop');
            await flushPromises();
            expect(api.setBranchSelection).toHaveBeenCalledWith(
                '/repos/moire',
                'develop',
                'WORKING TREE'
            );

            store.setHead('main');
            await flushPromises();
            expect(api.setBranchSelection).toHaveBeenLastCalledWith(
                '/repos/moire',
                'develop',
                'main'
            );
        });

        it('restores a remembered base and head that still exist', async () => {
            const api = stubApi({
                getBranchSelection: vi
                    .fn<() => Promise<{ base: string; head: string }>>()
                    .mockResolvedValue({ base: 'develop', head: 'main' }),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(api.getBranchSelection).toHaveBeenCalledWith('/repos/moire');
            expect(store.base).toBe('develop');
            expect(store.head).toBe('main');
            expect(store.disappearedBranches).toEqual([]);
        });

        it('clears a remembered base that no longer exists and reports it', async () => {
            stubApi({
                getBranchSelection: vi
                    .fn<() => Promise<{ base: string; head: string }>>()
                    .mockResolvedValue({ base: 'feature/gone', head: 'WORKING TREE' }),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.base).toBe('');
            expect(store.head).toBe('WORKING TREE');
            expect(store.disappearedBranches).toEqual(['feature/gone']);
        });

        it('falls a remembered head that no longer exists back to the working tree', async () => {
            stubApi({
                getBranchSelection: vi
                    .fn<() => Promise<{ base: string; head: string }>>()
                    .mockResolvedValue({ base: 'main', head: 'feature/gone' }),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.base).toBe('main');
            expect(store.head).toBe('WORKING TREE');
            expect(store.disappearedBranches).toEqual(['feature/gone']);
        });

        it('reports both refs when the base and head are both gone', async () => {
            stubApi({
                getBranchSelection: vi
                    .fn<() => Promise<{ base: string; head: string }>>()
                    .mockResolvedValue({ base: 'old-base', head: 'old-head' }),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.disappearedBranches).toEqual(['old-base', 'old-head']);
        });

        it('clears the disappeared notice when a ref is picked or it is dismissed', async () => {
            stubApi({
                getBranchSelection: vi
                    .fn<() => Promise<{ base: string; head: string }>>()
                    .mockResolvedValue({ base: 'feature/gone', head: 'WORKING TREE' }),
            });
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.disappearedBranches).toEqual(['feature/gone']);

            store.setBase('develop');
            expect(store.disappearedBranches).toEqual([]);

            store.disappearedBranches = ['feature/gone'];
            store.dismissMissingBranches();
            expect(store.disappearedBranches).toEqual([]);
        });

        it('defaults the base and clears the notice with no remembered selection', async () => {
            stubApi(); // getBranchSelection resolves null
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            expect(store.base).toBe('main');
            expect(store.head).toBe('WORKING TREE');
            expect(store.disappearedBranches).toEqual([]);
        });

        it('refreshes branches, changed files, and the open pair without resetting the range', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            store.setBase('develop');
            await flushPromises();
            api.getBranches.mockClear();
            api.getChangedFiles.mockClear();
            api.getFilePair.mockClear();

            await store.refresh();
            await flushPromises();

            expect(api.getBranches).toHaveBeenCalledTimes(1);
            expect(api.getChangedFiles).toHaveBeenCalledWith(
                'develop',
                'WORKING TREE',
                'merge-base'
            );
            expect(api.getFilePair).toHaveBeenCalled();
            // The chosen range survives, unlike a repo (re)open which resets it.
            expect(store.base).toBe('develop');
            expect(store.head).toBe('WORKING TREE');
        });

        it('reports a compared branch that disappeared on refresh instead of blanking silently', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.openRecent('/repos/moire');
            store.setBase('develop');
            await flushPromises();

            // develop is deleted out from under the comparison before the refresh.
            api.getBranches.mockResolvedValue([
                { name: 'main', kind: 'local', isCurrent: true },
                { name: 'origin/main', kind: 'remote' },
            ]);

            await store.refresh();
            await flushPromises();

            // The missing base is dropped and named, so the notice explains the
            // empty range rather than leaving a blank diff with no reason.
            expect(store.base).toBe('');
            expect(store.disappearedBranches).toEqual(['develop']);
        });

        it('refresh is a no-op with no repo open', async () => {
            const api = stubApi();
            const store = useComparisonStore();
            await store.refresh();
            expect(api.getBranches).not.toHaveBeenCalled();
        });

        it('no-ops without the preload bridge', async () => {
            const store = useComparisonStore();
            await store.openRepository();
            await store.loadRecentRepos();
            expect(store.repoName).toBe('');
            expect(store.recentRepos).toEqual([]);
        });
    });

    describe('cross-file change navigation', () => {
        // The prototype set in sidebar display order: directories first, then
        // files, matching the tree walk rather than git's raw path order.
        const DISPLAY_ORDER = [
            'electron/git/parsers.ts',
            'electron/git/GitService.ts',
            'electron/ipc/handlers.ts',
            'electron/watcher/RepoWatcher.ts',
            'shared/types.ts',
            'src/components/DiffPane.vue',
            'src/components/FileTree.vue',
            'src/components/LegacyDiff.vue',
            'src/stores/comparison.ts',
            'tests/parsers.spec.ts',
        ];

        it('orders paths the way the tree renders them, not git path order', () => {
            const store = seededStore();
            expect(store.orderedPaths).toEqual(DISPLAY_ORDER);
        });

        it('narrows the order to the filter box', () => {
            const store = seededStore();
            store.setTreeFilter('electron');
            expect(store.orderedPaths).toEqual([
                'electron/git/parsers.ts',
                'electron/git/GitService.ts',
                'electron/ipc/handlers.ts',
                'electron/watcher/RepoWatcher.ts',
            ]);
        });

        it('moves to the next and previous file, recording the edge to land on', () => {
            const store = seededStore();
            store.selectFile('electron/ipc/handlers.ts');

            expect(store.goToAdjacentFile('next')).toBe(true);
            expect(store.selectedPath).toBe('electron/watcher/RepoWatcher.ts');
            expect(store.pendingChangeEdge).toBe('first');

            expect(store.goToAdjacentFile('prev')).toBe(true);
            expect(store.selectedPath).toBe('electron/ipc/handlers.ts');
            expect(store.pendingChangeEdge).toBe('last');
        });

        it('wraps around at both ends of the set', () => {
            const store = seededStore();

            store.selectFile('tests/parsers.spec.ts'); // last file
            store.goToAdjacentFile('next');
            expect(store.selectedPath).toBe('electron/git/parsers.ts'); // first file

            store.goToAdjacentFile('prev');
            expect(store.selectedPath).toBe('tests/parsers.spec.ts'); // back to last
        });

        it('reports no switch and sets no edge for a single-file set', () => {
            const store = useComparisonStore();
            store.files = [
                { path: 'only.ts', status: 'M', additions: 1, deletions: 0, binary: false },
            ];
            store.selectFile('only.ts');

            expect(store.goToAdjacentFile('next')).toBe(false);
            expect(store.selectedPath).toBe('only.ts');
            expect(store.pendingChangeEdge).toBeNull();
        });

        it('clears a pending edge when a file is picked manually', () => {
            const store = seededStore();
            store.goToAdjacentFile('next');
            expect(store.pendingChangeEdge).not.toBeNull();

            store.selectFile('shared/types.ts');
            expect(store.pendingChangeEdge).toBeNull();
        });

        it('clears the pending edge on demand', () => {
            const store = seededStore();
            store.goToAdjacentFile('next');
            store.clearChangeEdge();
            expect(store.pendingChangeEdge).toBeNull();
        });
    });
});
