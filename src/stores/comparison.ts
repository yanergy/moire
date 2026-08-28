import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { BranchInfo, ChangedFile, CompareMode, FilePair, FileStatus } from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';
import { mockFilePair } from '@/lib/mock';

export interface DirNode {
    kind: 'dir';
    key: string;
    name: string;
    path: string;
    depth: number;
    open: boolean;
    seen: number;
    total: number;
    allSeen: boolean;
}

export interface FileNode {
    kind: 'file';
    key: string;
    name: string;
    path: string;
    depth: number;
    status: FileStatus;
    additions: number;
    deletions: number;
    viewed: boolean;
    selected: boolean;
}

export type TreeNode = DirNode | FileNode;

interface RawDir {
    dirs: Map<string, RawDir>;
    files: ChangedFile[];
}

const EMPTY_FILE: ChangedFile = {
    path: '',
    status: 'M',
    additions: 0,
    deletions: 0,
    binary: false,
};

function baseName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] ?? path;
}

// Group a flat change set into a nested directory tree, keyed by path segment.
function buildTree(fileList: ChangedFile[]): RawDir {
    const root: RawDir = { dirs: new Map(), files: [] };
    for (const file of fileList) {
        const parts = file.path.split('/');
        parts.pop(); // drop the file name; the rest are directories
        let node = root;
        for (const part of parts) {
            let child = node.dirs.get(part);
            if (!child) {
                child = { dirs: new Map(), files: [] };
                node.dirs.set(part, child);
            }

            node = child;
        }

        node.files.push(file);
    }

    return root;
}

// GitHub-style path compression: fold a run of single-child directories into one
// row. While a directory holds no files of its own and exactly one subdirectory,
// absorb that child, joining the names with '/'. Returns the display label, the
// full path to the deepest folded directory, and that directory's contents.
function foldChain(
    name: string,
    node: RawDir,
    prefix: string
): {
    label: string;
    path: string;
    dir: RawDir;
} {
    let label = name;
    let path = prefix ? prefix + '/' + name : name;
    let dir = node;
    while (dir.files.length === 0 && dir.dirs.size === 1) {
        for (const [childName, childDir] of dir.dirs) {
            label += '/' + childName;
            path += '/' + childName;
            dir = childDir;
        }
    }

    return { label, path, dir };
}

// The default base for a freshly opened repo is the branch the user is on, so
// the diff opens against their current work. Falls back to main, then master,
// then the first local branch, and to empty when the repo has no local branches
// (a bare or unborn HEAD).
function pickDefaultBase(list: BranchInfo[]): string {
    const locals = list.filter((b) => b.kind === 'local');
    const named = (name: string) => locals.find((b) => b.name === name)?.name;
    return (
        locals.find((b) => b.isCurrent)?.name ??
        named('main') ??
        named('master') ??
        locals[0]?.name ??
        ''
    );
}

export const useComparisonStore = defineStore('comparison', () => {
    // Empty until a repo is opened or the last one is restored on startup.
    const repoName = ref('');
    const repoPath = ref('');
    const recentRepos = ref<string[]>([]);
    const branches = ref<BranchInfo[]>([]);
    const files = ref<ChangedFile[]>([]);

    const base = ref('');
    const head = ref<string>(WORKING_TREE);
    const compareMode = ref<CompareMode>('merge-base');

    const selectedPath = ref('');
    const viewed = ref<Record<string, boolean>>({});
    const treeFilter = ref('');
    const collapsed = ref<Record<string, boolean>>({});

    function isViewed(path: string): boolean {
        return !!viewed.value[path];
    }

    const localBranches = computed(() => branches.value.filter((b) => b.kind === 'local'));
    const remoteBranches = computed(() => branches.value.filter((b) => b.kind === 'remote'));

    const fileCount = computed(() => files.value.length);
    const viewedCount = computed(() => files.value.filter((f) => isViewed(f.path)).length);
    const totalAdditions = computed(() => files.value.reduce((sum, f) => sum + f.additions, 0));
    const totalDeletions = computed(() => files.value.reduce((sum, f) => sum + f.deletions, 0));

    const rangeLabel = computed(
        () => base.value + (compareMode.value === 'merge-base' ? '...' : '..') + head.value
    );

    const selectedFile = computed<ChangedFile>(
        () => files.value.find((f) => f.path === selectedPath.value) ?? files.value[0] ?? EMPTY_FILE
    );

    const selectedPair = computed<FilePair>(() => mockFilePair(selectedFile.value.path));

    const treeNodes = computed<TreeNode[]>(() => {
        const filter = treeFilter.value.toLowerCase();
        const shown = files.value.filter((f) => !filter || f.path.toLowerCase().includes(filter));
        const root = buildTree(shown);

        const tallyOf = (node: RawDir): { total: number; seen: number } => {
            let total = 0;
            let seen = 0;
            for (const file of node.files) {
                total++;
                if (isViewed(file.path)) {
                    seen++;
                }
            }
            for (const child of node.dirs.values()) {
                const sub = tallyOf(child);
                total += sub.total;
                seen += sub.seen;
            }
            return { total, seen };
        };

        const out: TreeNode[] = [];
        const walk = (node: RawDir, depth: number, prefix: string) => {
            for (const [name, child] of node.dirs) {
                const { label, path, dir } = foldChain(name, child, prefix);
                const open = filter ? true : !collapsed.value[path];
                // Folded intermediates carry no files, so the deepest directory's
                // tally is the tally of the whole combined row.
                const { total, seen } = tallyOf(dir);
                out.push({
                    kind: 'dir',
                    key: 'd:' + path,
                    name: label,
                    path,
                    depth,
                    open,
                    seen,
                    total,
                    allSeen: total > 0 && seen === total,
                });
                if (open) {
                    walk(dir, depth + 1, path);
                }
            }
            for (const file of node.files) {
                out.push({
                    kind: 'file',
                    key: 'f:' + file.path,
                    name: baseName(file.path),
                    path: file.path,
                    depth,
                    status: file.status,
                    additions: file.additions,
                    deletions: file.deletions,
                    viewed: isViewed(file.path),
                    selected: file.path === selectedPath.value,
                });
            }
        };
        walk(root, 0, '');
        return out;
    });

    function selectFile(path: string) {
        selectedPath.value = path;
    }

    function toggleViewed(path: string) {
        viewed.value = { ...viewed.value, [path]: !viewed.value[path] };
    }

    function toggleDir(path: string) {
        collapsed.value = { ...collapsed.value, [path]: !collapsed.value[path] };
    }

    // The collapsible directory rows, folded the same way the tree renders them,
    // so collapse-all and the all-collapsed check target exactly what is shown.
    const directoryPaths = computed<string[]>(() => {
        const root = buildTree(files.value);
        const paths: string[] = [];
        const walk = (node: RawDir, prefix: string) => {
            for (const [name, child] of node.dirs) {
                const { path, dir } = foldChain(name, child, prefix);
                paths.push(path);
                walk(dir, path);
            }
        };

        walk(root, '');
        return paths;
    });

    const allCollapsed = computed(
        () =>
            directoryPaths.value.length > 0 &&
            directoryPaths.value.every((path) => collapsed.value[path] === true)
    );

    function expandAll() {
        collapsed.value = {};
    }

    function collapseAll() {
        const next: Record<string, boolean> = {};
        for (const path of directoryPaths.value) {
            next[path] = true;
        }

        collapsed.value = next;
    }

    // Single-button toggle: open everything only when it is already all closed;
    // from a fully- or partially-open tree, close everything.
    function toggleAll() {
        if (allCollapsed.value) {
            expandAll();
            return;
        }

        collapseAll();
    }

    function setTreeFilter(value: string) {
        treeFilter.value = value;
    }

    function setBase(name: string) {
        base.value = name;
        void loadChangedFiles();
    }

    function setHead(name: string) {
        head.value = name;
        void loadChangedFiles();
    }

    function setCompareMode(mode: CompareMode) {
        compareMode.value = mode;
        void loadChangedFiles();
    }

    function swap() {
        // The head side can hold the working-tree sentinel and the base side an
        // empty placeholder; neither is valid on the other side. Swap exchanges the
        // two, mapping the working tree to a cleared base (there is no
        // `WORKING TREE...<ref>` revision) and an empty base to the working tree, so
        // each selector keeps a value it can legally hold. loadChangedFiles empties
        // the diff while the base is blank, until a new base is picked.
        const nextBase = head.value === WORKING_TREE ? '' : head.value;
        const nextHead = base.value === '' ? WORKING_TREE : base.value;
        base.value = nextBase;
        head.value = nextHead;
        void loadChangedFiles();
    }

    async function loadRecentRepos() {
        const api = window.api;
        if (!api) {
            return;
        }

        recentRepos.value = await api.getRecentRepos();
    }

    async function removeRecent(path: string) {
        const api = window.api;
        if (!api) {
            return;
        }

        recentRepos.value = await api.removeRecentRepo(path);

        // Removing the open repo clears the selection back to the placeholder and
        // drops its branches and change set so the ref selectors and file tree do
        // not keep showing stale refs or diffs.
        if (path === repoPath.value) {
            repoName.value = '';
            repoPath.value = '';
            branches.value = [];
            base.value = '';
            head.value = WORKING_TREE;
            files.value = [];
            selectedPath.value = '';
        }
    }

    // Startup restore: load recents and reopen the most recent one through the
    // backend, so the main-process GitService is set and the git-backed channels
    // work. The repo is shown as selected straight away, then opened; if the
    // folder has since moved or been deleted, main pops the not-a-repo dialog,
    // openRecent drops it from recents, and we clear the selection. No-op with no
    // history.
    async function restoreLastRepo() {
        await loadRecentRepos();
        const last = recentRepos.value[0];
        if (!last) {
            return;
        }

        const parts = last.split(/[/\\]/).filter(Boolean);
        repoName.value = parts[parts.length - 1] ?? last;
        repoPath.value = last;

        if (!(await openRecent(last))) {
            repoName.value = '';
            repoPath.value = '';
        }
    }

    // Open a repo by path (a recent entry or a freshly picked folder), validated
    // in the main process, which sets the current GitService. Main shows its own
    // error box and returns null for an invalid folder, so the selection is left
    // untouched in that case. Returns whether the open succeeded. Loading the
    // branches also pulls the change set for the defaulted range.
    async function openRecent(path: string): Promise<boolean> {
        const api = window.api;
        if (!api) {
            return false;
        }

        const info = await api.openRepo(path);
        if (!info) {
            // A recent that no longer opens (moved or deleted) is pruned so it
            // stops being offered. A freshly picked folder was never a recent,
            // so leave the list alone.
            if (recentRepos.value.includes(path)) {
                recentRepos.value = await api.removeRecentRepo(path);
            }

            return false;
        }

        repoName.value = info.name;
        repoPath.value = info.path;
        recentRepos.value = await api.getRecentRepos();
        await loadBranches();
        return true;
    }

    // Replace the branch list with the open repo's real branches and reset the
    // comparison to a valid default (base on a real branch, head on the working
    // tree). Resetting matters on a repo switch, where the previous base or head
    // may not exist in the new repo.
    async function loadBranches() {
        const api = window.api;
        if (!api) {
            return;
        }

        branches.value = await api.getBranches();
        base.value = pickDefaultBase(branches.value);
        head.value = WORKING_TREE;
        await loadChangedFiles();
    }

    // Pull the changed-file list for the current range from the git backend.
    // Runs on repo open and whenever the base, head, or compare mode changes.
    // Keeps a valid selection by falling back to the first file when the previous
    // pick is gone (a repo switch or a range change). Clears the list when no
    // repo is open, and swallows a bad range (e.g. an unresolvable ref) rather
    // than surfacing an unhandled rejection from a fire-and-forget setter.
    async function loadChangedFiles() {
        const api = window.api;
        if (!api || !base.value) {
            files.value = [];
            selectedPath.value = '';
            return;
        }

        try {
            files.value = await api.getChangedFiles(base.value, head.value, compareMode.value);
        } catch {
            files.value = [];
        }

        if (!files.value.some((f) => f.path === selectedPath.value)) {
            selectedPath.value = files.value[0]?.path ?? '';
        }
    }

    // Native folder picker -> openRecent, which names the repo and loads its real
    // branches and change set.
    async function openRepository() {
        const picked = await window.api?.openRepoDialog();
        if (picked) {
            await openRecent(picked);
        }
    }

    return {
        repoName,
        repoPath,
        recentRepos,
        branches,
        files,
        base,
        head,
        compareMode,
        selectedPath,
        viewed,
        treeFilter,
        collapsed,
        isViewed,
        localBranches,
        remoteBranches,
        fileCount,
        viewedCount,
        totalAdditions,
        totalDeletions,
        rangeLabel,
        selectedFile,
        selectedPair,
        treeNodes,
        allCollapsed,
        selectFile,
        toggleViewed,
        toggleDir,
        expandAll,
        collapseAll,
        toggleAll,
        setTreeFilter,
        setBase,
        setHead,
        setCompareMode,
        swap,
        loadRecentRepos,
        removeRecent,
        restoreLastRepo,
        openRecent,
        openRepository,
        loadChangedFiles,
    };
});

// Without this, adding an action to the store mid-session leaves the live store
// instance stale (the new action is missing) until a full reload.
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useComparisonStore, import.meta.hot));
}
