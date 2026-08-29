// Shared test fixtures: the prototype branch list and change set the store used
// to seed itself with before it loaded real data over the bridge. The store no
// longer ships these, so the tests that exercise the tree, ref selectors, and
// viewed state seed them from here instead. Not a *.spec file, so vitest does
// not run it as a suite.

import type { BranchInfo, ChangedFile } from '@/shared/types';

export const BRANCHES: BranchInfo[] = [
    { name: 'main', kind: 'local', isCurrent: true },
    { name: 'develop', kind: 'local' },
    { name: 'release/2.4', kind: 'local' },
    { name: 'feat/monaco-spike', kind: 'local' },
    { name: 'fix/rename-detection', kind: 'local' },
    { name: 'origin/main', kind: 'remote' },
    { name: 'origin/develop', kind: 'remote' },
    { name: 'origin/release/2.4', kind: 'remote' },
];

export const CHANGED_FILES: ChangedFile[] = [
    { path: 'electron/git/parsers.ts', status: 'M', additions: 14, deletions: 5, binary: false },
    { path: 'electron/git/GitService.ts', status: 'M', additions: 38, deletions: 6, binary: false },
    { path: 'electron/ipc/handlers.ts', status: 'M', additions: 22, deletions: 4, binary: false },
    {
        path: 'electron/watcher/RepoWatcher.ts',
        status: 'A',
        additions: 96,
        deletions: 0,
        binary: false,
    },
    { path: 'shared/types.ts', status: 'M', additions: 11, deletions: 1, binary: false },
    {
        path: 'src/components/DiffPane.vue',
        status: 'M',
        additions: 61,
        deletions: 18,
        binary: false,
    },
    {
        path: 'src/components/FileTree.vue',
        status: 'M',
        additions: 27,
        deletions: 9,
        binary: false,
    },
    {
        path: 'src/components/LegacyDiff.vue',
        status: 'D',
        additions: 0,
        deletions: 214,
        binary: false,
    },
    { path: 'src/stores/comparison.ts', status: 'M', additions: 19, deletions: 7, binary: false },
    { path: 'tests/parsers.spec.ts', status: 'M', additions: 48, deletions: 3, binary: false },
];
