import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
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

    it('filters the tree and force-opens matching folders even when collapsed', () => {
        const store = useComparisonStore();
        store.collapseAll();
        store.setTreeFilter('parsers');

        const shown = files(store.treeNodes);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every((n) => n.path.includes('parsers'))).toBe(true);
        expect(store.treeNodes.some((n) => n.path === 'electron/git/parsers.ts')).toBe(true);
    });
});
