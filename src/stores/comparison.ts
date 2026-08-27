import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { ChangedFile, CompareMode, FilePair, FileStatus } from '@/shared/types';
import {
    DEFAULT_BASE,
    DEFAULT_HEAD,
    DEFAULT_SELECTED,
    MOCK_BRANCHES,
    MOCK_FILES,
    MOCK_REPO_NAME,
    mockFilePair,
} from '@/lib/mock';

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

export const useComparisonStore = defineStore('comparison', () => {
    const repoName = ref(MOCK_REPO_NAME);
    const branches = ref(MOCK_BRANCHES);
    const files = ref(MOCK_FILES);

    const base = ref(DEFAULT_BASE);
    const head = ref(DEFAULT_HEAD);
    const compareMode = ref<CompareMode>('merge-base');

    const selectedPath = ref(DEFAULT_SELECTED);
    const viewed = ref<Record<string, boolean>>({
        'shared/types.ts': true,
        'src/stores/comparison.ts': true,
    });
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

        const root: RawDir = { dirs: new Map(), files: [] };
        for (const file of shown) {
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
                const dirPath = prefix ? prefix + '/' + name : name;
                const open = filter ? true : !collapsed.value[dirPath];
                const { total, seen } = tallyOf(child);
                out.push({
                    kind: 'dir',
                    key: 'd:' + dirPath,
                    name,
                    path: dirPath,
                    depth,
                    open,
                    seen,
                    total,
                    allSeen: total > 0 && seen === total,
                });
                if (open) {
                    walk(child, depth + 1, dirPath);
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

    const directoryPaths = computed<string[]>(() => {
        const paths = new Set<string>();
        for (const file of files.value) {
            const parts = file.path.split('/');
            parts.pop(); // drop the file name
            let prefix = '';
            for (const part of parts) {
                prefix = prefix ? prefix + '/' + part : part;
                paths.add(prefix);
            }
        }

        return [...paths];
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
    }

    function setHead(name: string) {
        head.value = name;
    }

    function setCompareMode(mode: CompareMode) {
        compareMode.value = mode;
    }

    function swap() {
        const previousBase = base.value;
        base.value = head.value;
        head.value = previousBase;
    }

    return {
        repoName,
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
    };
});

// Without this, adding an action to the store mid-session leaves the live store
// instance stale (the new action is missing) until a full reload.
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useComparisonStore, import.meta.hot));
}
