import { computed, ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { BranchInfo, ChangedFile, CompareMode, FilePair, FileStatus } from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';
import { repoLabel } from '@/lib/repo-path';

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
    oldPath?: string; // set for renames, for the "old → new" hover title
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

// Blank pair shown before the first load, with no repo or selection, and on a
// failed fetch, so the diff pane and status bar read empty rather than stale.
const EMPTY_PAIR: FilePair = {
    path: '',
    oldContent: '',
    newContent: '',
    language: 'plaintext',
    binary: false,
    tooLarge: false,
    sizeBytes: 0,
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

    // Names of the remembered base/head refs that no longer exist in the reopened
    // repo. Drives the "branch disappeared" notice; cleared once the user picks a
    // ref or dismisses it.
    const disappearedBranches = ref<string[]>([]);

    const selectedPath = ref('');
    const viewed = ref<Record<string, boolean>>({});
    const treeFilter = ref('');
    const collapsed = ref<Record<string, boolean>>({});

    // When the change set was last read from disk (epoch ms), or null when no
    // repo is loaded. Drives the status bar's "synced N ago"; the repo watcher
    // re-reads on change, so this doubles as a liveness signal.
    const lastSyncedAt = ref<number | null>(null);

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

    // The diffed content for the selected file, loaded from the git backend.
    // Unlike the change set, a pair is fetched per file, so it lives in its own
    // ref that loadFilePair fills and the diff pane and status bar read.
    const selectedPair = ref<FilePair>({ ...EMPTY_PAIR });

    // A large file's diff is not rendered until the user asks for it, so an
    // accidental click on a huge file can't freeze Monaco. This flips true only
    // for the current file once "Load diff" is chosen, and resets on every pair
    // load (a new file, a range change, a refresh), so each large file re-gates.
    const largeDiffLoaded = ref(false);

    // Monotonic token so an out-of-order getFilePair response (the user picked
    // another file, or moved the range, before this one resolved) is dropped
    // rather than overwriting the current pair. The latest dispatched request
    // wins regardless of which resolves first.
    let pairRequest = 0;

    // Pull the diffed content for the selected file from the git backend. Runs on
    // selection and whenever the compared range changes, since a range change can
    // keep the same file selected but still alters the base (and so the old side).
    async function loadFilePair() {
        largeDiffLoaded.value = false;
        const api = window.api;
        const path = selectedFile.value.path;
        if (!api || !base.value || !path) {
            selectedPair.value = { ...EMPTY_PAIR };
            return;
        }

        const token = ++pairRequest;
        try {
            const result = await api.getFilePair(base.value, head.value, path, compareMode.value);
            if (token === pairRequest) {
                selectedPair.value = result;
            }
        } catch {
            if (token === pairRequest) {
                selectedPair.value = { ...EMPTY_PAIR, path };
            }
        }
    }

    watch([() => selectedFile.value.path, base, head, compareMode], () => void loadFilePair());

    // The diff pane shows a "Load diff" gate in place of the editor when the
    // selected file is over the size threshold and has not been loaded yet. Binary
    // files are excluded: their content is already withheld, so there is nothing to
    // gate (they get their own preview).
    const showDiffGate = computed(
        () => selectedPair.value.tooLarge && !selectedPair.value.binary && !largeDiffLoaded.value
    );

    function loadLargeDiff() {
        largeDiffLoaded.value = true;
    }

    // An image file is shown as a before/after preview rather than a text diff.
    const showImagePreview = computed(() => !!selectedPair.value.image);

    // A non-image binary file has no text diff (its content is withheld), so the
    // pane shows a notice instead of an empty editor. Takes precedence over the size
    // gate, since there is nothing to load; images are handled above instead.
    const showBinaryNotice = computed(() => selectedPair.value.binary && !selectedPair.value.image);

    // Remember the chosen base/head per repo so reopening it restores the range.
    // Guarded on an open repo, so clearing the selection when a repo closes (its
    // path is blanked first) writes nothing. The optional chain also makes this a
    // no-op in tests/jsdom where the bridge is absent.
    watch([base, head], ([nextBase, nextHead]) => {
        if (!repoPath.value) {
            return;
        }

        void window.api?.setBranchSelection?.(repoPath.value, nextBase, nextHead);
    });

    // The change set narrowed to the filter box, shared by the tree render and the
    // per-folder "mark viewed" action so the folder checkbox and the files it
    // toggles always agree on what the folder contains.
    const shownFiles = computed(() => {
        const filter = treeFilter.value.toLowerCase();
        return files.value.filter((f) => !filter || f.path.toLowerCase().includes(filter));
    });

    const treeNodes = computed<TreeNode[]>(() => {
        const filter = treeFilter.value.toLowerCase();
        const root = buildTree(shownFiles.value);

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
                    oldPath: file.oldPath,
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

    // Mark or clear "viewed" for every file under a folder in one go. Acts on the
    // folder's shown files, so it matches the tally on the row; if they are all
    // already viewed it clears them, otherwise it marks the lot, mirroring how the
    // file checkbox flips a single file.
    function toggleDirViewed(path: string) {
        const prefix = path + '/';
        const targets = shownFiles.value.filter((f) => f.path.startsWith(prefix));
        if (targets.length === 0) {
            return;
        }

        const markAll = !targets.every((f) => isViewed(f.path));
        const next = { ...viewed.value };
        for (const file of targets) {
            next[file.path] = markAll;
        }

        viewed.value = next;
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
        disappearedBranches.value = [];
        void loadChangedFiles();
    }

    function setHead(name: string) {
        head.value = name;
        disappearedBranches.value = [];
        void loadChangedFiles();
    }

    function dismissMissingBranches() {
        disappearedBranches.value = [];
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

    // Per-repo view state that must not leak between repositories: the viewed
    // checkmarks, the collapsed folders, the filter box, and the selection are all
    // keyed by paths that mean nothing in a different repo. Cleared on every
    // deliberate repo open and on closing the open repo. Not called from refresh(),
    // which keeps the user's place while re-reading the same repo.
    function resetViewState() {
        viewed.value = {};
        collapsed.value = {};
        treeFilter.value = '';
        selectedPath.value = '';
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
            disappearedBranches.value = [];
            lastSyncedAt.value = null;
            resetViewState();
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

        repoName.value = repoLabel(last);
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
        // A fresh repo starts with a clean tree: no carried-over viewed marks,
        // collapsed folders, or filter text from the previously open one.
        resetViewState();
        recentRepos.value = await api.getRecentRepos();
        await loadBranches();
        return true;
    }

    function branchExists(name: string): boolean {
        return branches.value.some((b) => b.name === name);
    }

    // Reapply the base/head this repo was last compared on. A remembered ref that
    // has since been deleted is dropped: a missing base clears to empty, a missing
    // head falls back to the working tree, and the dropped names feed the
    // "branch disappeared" notice. With no remembered selection (a repo not opened
    // since this landed) it falls back to the defaulted base and working-tree head.
    // The working-tree sentinel and an intentionally empty base always restore as
    // they were, since neither can "disappear".
    async function restoreSelection() {
        const saved = await window.api?.getBranchSelection?.(repoPath.value);
        if (!saved) {
            base.value = pickDefaultBase(branches.value);
            head.value = WORKING_TREE;
            disappearedBranches.value = [];
            return;
        }

        const missing: string[] = [];

        base.value = '';
        if (saved.base && branchExists(saved.base)) {
            base.value = saved.base;
        } else if (saved.base) {
            missing.push(saved.base);
        }

        head.value = WORKING_TREE;
        if (saved.head && saved.head !== WORKING_TREE) {
            if (branchExists(saved.head)) {
                head.value = saved.head;
            } else {
                missing.push(saved.head);
            }
        }

        disappearedBranches.value = missing;
    }

    // Replace the branch list with the open repo's real branches, then restore the
    // range this repo was last left on (validated against the real branches).
    // Restoring matters on a repo switch, where the previous base or head may not
    // exist in the newly opened repo.
    async function loadBranches() {
        const api = window.api;
        if (!api) {
            return;
        }

        branches.value = await api.getBranches();
        await restoreSelection();
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
            lastSyncedAt.value = null;
            return;
        }

        try {
            files.value = await api.getChangedFiles(base.value, head.value, compareMode.value);
            // A successful read from disk is the "synced" moment the status bar
            // reports; a failed range leaves the previous time untouched.
            lastSyncedAt.value = Date.now();
        } catch {
            files.value = [];
        }

        if (!files.value.some((f) => f.path === selectedPath.value)) {
            selectedPath.value = files.value[0]?.path ?? '';
        }
    }

    // Drop a base or head whose branch has vanished from the refreshed list, and
    // name the losses so the "branch disappeared" notice explains the now-empty
    // range instead of the diff going silently blank. An empty base and the
    // working-tree head can never disappear, so they are left alone. Mirrors
    // restoreSelection, but against the live range rather than a persisted one.
    function reconcileSelection() {
        const missing: string[] = [];

        if (base.value && !branchExists(base.value)) {
            missing.push(base.value);
            base.value = '';
        }

        if (head.value !== WORKING_TREE && !branchExists(head.value)) {
            missing.push(head.value);
            head.value = WORKING_TREE;
        }

        if (missing.length > 0) {
            disappearedBranches.value = missing;
        }
    }

    // Re-read the open repo from disk for the current range, keeping the chosen
    // base/head (unlike loadBranches, which resets them). Refreshes the branch
    // list so new or deleted branches surface, reconciles the range against it (so
    // a branch deleted out from under the current comparison is reported rather
    // than blanking the diff), then re-fetches the changed files and the open
    // file's pair. Backs the native View → Refresh item; a no-op with no repo open.
    async function refresh() {
        const api = window.api;
        if (!api || !repoPath.value) {
            return;
        }

        branches.value = await api.getBranches();
        reconcileSelection();
        await loadChangedFiles();
        await loadFilePair();
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
        disappearedBranches,
        selectedPath,
        viewed,
        treeFilter,
        collapsed,
        lastSyncedAt,
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
        showDiffGate,
        showBinaryNotice,
        showImagePreview,
        loadLargeDiff,
        treeNodes,
        allCollapsed,
        selectFile,
        toggleViewed,
        toggleDirViewed,
        toggleDir,
        expandAll,
        collapseAll,
        toggleAll,
        setTreeFilter,
        setBase,
        setHead,
        setCompareMode,
        dismissMissingBranches,
        swap,
        loadRecentRepos,
        removeRecent,
        restoreLastRepo,
        openRecent,
        openRepository,
        refresh,
        loadChangedFiles,
        loadFilePair,
    };
});

// Without this, adding an action to the store mid-session leaves the live store
// instance stale (the new action is missing) until a full reload.
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useComparisonStore, import.meta.hot));
}
