import { computed, ref, watch, type Ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type {
    BranchInfo,
    ChangedFile,
    CommentMutationResult,
    CompareMode,
    CheckAnnotation,
    FilePair,
    FileStatus,
    PrReviewThread,
    PrStatus,
    PullRequest,
} from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';
import { repoLabel } from '@/lib/repo-path';
import { useUiStore } from '@/stores/ui';

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

// A file's extension for the tree's filetype filter: the basename's last suffix,
// lowercased. A dotfile (a leading dot with no other, like `.gitignore`) and a
// name with no dot both count as having no extension, bucketed under NO_EXTENSION.
const NO_EXTENSION = '';
function fileExtension(path: string): string {
    const base = baseName(path);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : NO_EXTENSION;
}

// A row marker the tree can filter on: a CI error or warning annotation, or a
// review comment thread. Named for what the file carries, not its diff status.
export type FileMarker = 'error' | 'warning' | 'comment';

// Human labels for the filter menu's change-type and marker options. Statuses read
// as their mutation ("Added" rather than "A"); markers as their plural noun.
const STATUS_LABEL: Record<FileStatus, string> = {
    A: 'Added',
    M: 'Modified',
    D: 'Deleted',
    R: 'Renamed',
};
const MARKER_LABEL: Record<FileMarker, string> = {
    error: 'Errors',
    warning: 'Warnings',
    comment: 'Comments',
};

// One selectable option in a filter group: the raw value to toggle, its label, and
// how many files in the current change set carry it.
export interface FilterOption<T extends string> {
    value: T;
    label: string;
    count: number;
}

// Open a file's working-tree copy through the main process, in the chosen editor (or
// the OS default app). Resolves an ok/message result (a file missing from the
// checked-out tree fails) so the caller can decide whether to surface it.
function openFile(filePath: string): Promise<{ ok: boolean; message?: string }> {
    const api = window.api;
    if (!api?.openFile || !filePath) {
        return Promise.resolve({ ok: false, message: 'Cannot open this file.' });
    }

    return api.openFile(filePath);
}

// Flip one value in a filter facet's set. The set is replaced (not mutated in place)
// so the computeds reading it re-run, matching how the task drafts are handled.
function toggleInSet<T>(setRef: Ref<Set<T>>, value: T) {
    const next = new Set(setRef.value);
    if (next.has(value)) {
        next.delete(value);
    } else {
        next.add(value);
    }

    setRef.value = next;
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

    // The file tree's faceted filters, each an active set narrowing the change set
    // alongside the text box. Empty means "no constraint from this facet"; within a
    // facet the selected values are ORed (any match keeps the file), and the facets
    // combine with AND (a file must satisfy every non-empty facet). Toggling replaces
    // the set so the computeds that read them re-run.
    const filterStatuses = ref<Set<FileStatus>>(new Set());
    const filterExtensions = ref<Set<string>>(new Set());
    const filterMarkers = ref<Set<FileMarker>>(new Set());

    // One-shot instruction for the diff viewer set when change navigation crosses
    // into another file: which edge of the newly selected file to land on ('first'
    // change when moving forward, 'last' when moving back). The viewer reads it
    // once its diff is computed and then clears it; null the rest of the time.
    const pendingChangeEdge = ref<'first' | 'last' | null>(null);

    // When the change set was last read from disk (epoch ms), or null when no
    // repo is loaded. Drives the status bar's "synced N ago"; the repo watcher
    // re-reads on change, so this doubles as a liveness signal.
    const lastSyncedAt = ref<number | null>(null);

    // The pull request detected for the compared head branch (via the `gh` CLI),
    // and the lookup's outcome. `prStatus` explains an absent PR (no gh, no auth,
    // no PR, ...) so the PR view can show the right hint; `pullRequest` is set only
    // when a PR is found. Re-detected whenever the branch range changes.
    const pullRequest = ref<PullRequest | null>(null);
    const prStatus = ref<PrStatus>('no-pr');
    const prMessage = ref('');

    // The PR's inline review threads (line-anchored comments), fetched alongside the
    // PR and shown as markers in the diff viewer, not the PR conversation. Empty when
    // there is no PR or the lookup failed. `threadsForFile` narrows them to one file.
    const reviewThreads = ref<PrReviewThread[]>([]);
    function threadsForFile(path: string): PrReviewThread[] {
        return path ? reviewThreads.value.filter((t) => t.path === path) : [];
    }

    // The review-comment state per file path, for the tree's comment marker and the
    // marker filter: 'open' when any thread on the file is unresolved, 'resolved' when
    // it has threads but all are resolved. Files with no threads are absent.
    const commentStateByPath = computed(() => {
        const map = new Map<string, 'open' | 'resolved'>();
        for (const t of reviewThreads.value) {
            if (!t.path) {
                continue;
            }

            if (!t.isResolved) {
                map.set(t.path, 'open');
            } else if (!map.has(t.path)) {
                map.set(t.path, 'resolved');
            }
        }

        return map;
    });
    function commentStateForFile(path: string): 'open' | 'resolved' | null {
        return commentStateByPath.value.get(path) ?? null;
    }

    // The head commit's CI check annotations, shown as warning markers in the diff
    // viewer alongside the review comments. Fetched with the PR (by its head SHA).
    // Empty when there are none or the lookup fails. `annotationsForFile` narrows by
    // file.
    const checkAnnotations = ref<CheckAnnotation[]>([]);
    function annotationsForFile(path: string): CheckAnnotation[] {
        return path ? checkAnnotations.value.filter((a) => a.path === path) : [];
    }

    // The worst annotation level per file path, so the file tree can flag which files
    // carry a problem: 'failure' (an error, red) outranks 'warning' (a warning or
    // notice, amber). Files with no annotations are absent. `annotationLevelForFile`
    // reads it per row.
    const annotationLevelByPath = computed(() => {
        const map = new Map<string, 'failure' | 'warning'>();
        for (const a of checkAnnotations.value) {
            if (!a.path) {
                continue;
            }

            if (a.level === 'failure') {
                map.set(a.path, 'failure');
            } else if (!map.has(a.path)) {
                map.set(a.path, 'warning');
            }
        }

        return map;
    });
    function annotationLevelForFile(path: string): 'failure' | 'warning' | null {
        return annotationLevelByPath.value.get(path) ?? null;
    }

    // True while a lookup triggered by a range change is in flight, so the toolbar
    // can show a spinner instead of the previous branch's PR status (which would
    // otherwise linger and read as the new branch's until gh returns).
    const prLoading = ref(false);

    // A PR exists for the current range: the only case that reveals the PR button
    // and lets the main area switch to the PR view.
    const hasPullRequest = computed(() => prStatus.value === 'ok' && pullRequest.value !== null);

    // The tooltip for the toolbar's warning triangle, shown when the PR lookup
    // failed in a way worth surfacing: gh missing, signed out, or an access/network
    // error (which includes being on the wrong account for a private repo). Returned
    // as separate lines (the cause, then how to fix it, then any gh detail) so the
    // tooltip stacks them rather than running them together. The plain absences (no
    // PR for the branch, a non-GitHub repo, the working-tree head) return null so no
    // triangle shows.
    const prWarning = computed<string[] | null>(() => {
        switch (prStatus.value) {
            case 'not-installed':
                return [
                    'The GitHub CLI (gh) was not found, so pull requests cannot be detected.',
                    'Install gh to enable this.',
                ];
            case 'not-authenticated':
                return [
                    'gh is not signed in to GitHub, so pull requests cannot be detected.',
                    'Run gh auth login, or switch accounts from the Git menu.',
                ];
            case 'error':
                return [
                    'gh could not fetch the pull request for this branch.',
                    'You might be signed in to the wrong account (switch it from the Git menu), or gh could not reach GitHub.',
                    ...(prMessage.value ? [`Details: ${prMessage.value}`] : []),
                ];
            default:
                return null;
        }
    });

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

    // The view-preferences store, read to gate the single-file loader: in the
    // stacked "all files" layout each card loads its own pair, so the per-selection
    // fetch below is skipped (see loadFilePair).
    const ui = useUiStore();

    // Monotonic token so an out-of-order getFilePair response (the user picked
    // another file, or moved the range, before this one resolved) is dropped
    // rather than overwriting the current pair. The latest dispatched request
    // wins regardless of which resolves first.
    let pairRequest = 0;

    // Pull the diffed content for the selected file from the git backend. Runs on
    // selection and whenever the compared range changes, since a range change can
    // keep the same file selected but still alters the base (and so the old side).
    async function loadFilePair() {
        // The stacked "all files" layout renders each file from its own pairFor()
        // cache and does not mount the single-file pane, so skip this per-selection
        // fetch there (scroll sync moves selectedPath and would otherwise fetch every
        // file the user scrolls past). Switching back to single re-runs it.
        if (ui.diffLayout === 'stacked') {
            return;
        }

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

    // Returning to the single-file layout mounts the pane, which reads selectedPair;
    // load the current file's pair, since selection and range changes were ignored
    // while the stacked layout was active.
    watch(
        () => ui.diffLayout,
        (layout) => {
            if (layout === 'single') {
                void loadFilePair();
            }
        }
    );

    // Diff pairs for the stacked "all files" view, where many files render at once
    // (unlike the single-file pane's one selectedPair). Cached by path within the
    // current range and dropped whenever the change set is reloaded (a range change,
    // a refresh, or a repo switch all funnel through loadChangedFiles), since every
    // cached pair then belongs to a stale range. In-flight requests are shared, so a
    // card that mounts, unmounts, and remounts while scrolling fetches once.
    const pairCache = ref<Record<string, FilePair>>({});
    const pairInFlight = new Map<string, Promise<FilePair>>();

    function clearPairCache() {
        pairCache.value = {};
        pairInFlight.clear();
    }

    // Fetch (and cache) the diff pair for one file, for the stacked view. A cached
    // pair returns at once; concurrent calls for the same path share one request.
    // Resolves an empty pair rather than rejecting, so one file's failure leaves a
    // blank card instead of breaking the whole list. `full` refetches a large file's
    // withheld content when its per-card "Load diff" gate is cleared, bypassing (and
    // then replacing) the gated cache entry.
    function pairFor(path: string, full = false): Promise<FilePair> {
        if (!full) {
            const cached = pairCache.value[path];
            if (cached) {
                return Promise.resolve(cached);
            }

            const pending = pairInFlight.get(path);
            if (pending) {
                return pending;
            }
        }

        const api = window.api;
        if (!api || !base.value || !path) {
            return Promise.resolve({ ...EMPTY_PAIR, path });
        }

        const request = api
            .getFilePair(base.value, head.value, path, compareMode.value, full)
            .then((result) => {
                pairCache.value = { ...pairCache.value, [path]: result };
                return result;
            })
            .catch(() => ({ ...EMPTY_PAIR, path }))
            .finally(() => {
                pairInFlight.delete(path);
            });
        if (!full) {
            pairInFlight.set(path, request);
        }

        return request;
    }

    // Monotonic token so an out-of-order PR lookup (the range moved before gh
    // resolved) is dropped rather than overwriting a newer result.
    let prRequest = 0;

    // Detect the pull request for the compared head branch via the `gh` backend.
    // Runs on repo open and whenever the base or head changes, since the PR is keyed
    // on the head branch (and shown as base <- head). The working-tree head, an
    // empty base, or no open repo can have no PR, so the lookup is skipped and the
    // state cleared. gh being absent or unauthenticated comes back as a status,
    // never a throw, so a fire-and-forget call is safe.
    //
    // `showSpinner` gates the toolbar's PR spinner. A range change swaps the PR
    // identity, so the previous branch's status is hidden behind a spinner until the
    // new lookup lands and can't be misread. A watcher-driven refresh keeps the same
    // range (same PR), so it updates the status in place rather than flashing the
    // button away on every on-disk change.
    async function loadPullRequest(showSpinner = false) {
        const api = window.api;
        const token = ++prRequest;
        if (!api || !repoPath.value || !base.value || !head.value || head.value === WORKING_TREE) {
            pullRequest.value = null;
            prStatus.value = 'no-pr';
            prMessage.value = '';
            reviewThreads.value = [];
            checkAnnotations.value = [];
            prLoading.value = false;
            return;
        }

        if (showSpinner) {
            prLoading.value = true;
        }

        try {
            const result = await api.getPullRequest(base.value, head.value);
            if (token !== prRequest) {
                return;
            }

            pullRequest.value = result.pr;
            prStatus.value = result.status;
            prMessage.value = result.message ?? '';
            prLoading.value = false;
            void loadReviewThreads(result.pr?.id, token);
            void loadCheckAnnotations(result.pr?.headRefOid, token);
        } catch {
            if (token === prRequest) {
                pullRequest.value = null;
                prStatus.value = 'error';
                prMessage.value = '';
                reviewThreads.value = [];
                checkAnnotations.value = [];
                prLoading.value = false;
            }
        }
    }

    // Fetch the head commit's CI check annotations for the diff viewer's warning
    // markers, guarded by the same request token as the PR load. Supplementary: no head
    // SHA, or any failure, just clears them.
    async function loadCheckAnnotations(headSha: string | undefined, token: number) {
        const api = window.api;
        if (!api?.getCheckAnnotations || !headSha) {
            if (token === prRequest) {
                checkAnnotations.value = [];
            }

            return;
        }

        try {
            const annotations = await api.getCheckAnnotations(headSha);
            if (token === prRequest) {
                checkAnnotations.value = annotations;
            }
        } catch {
            if (token === prRequest) {
                checkAnnotations.value = [];
            }
        }
    }

    // Fetch the PR's inline review threads for the diff viewer's markers, guarded by
    // the same request token as the PR load so a stale range's threads never land on
    // the current one. Threads are supplementary: any failure just clears them.
    async function loadReviewThreads(prId: string | undefined, token: number) {
        const api = window.api;
        if (!api?.getReviewThreads || !prId) {
            if (token === prRequest) {
                reviewThreads.value = [];
            }

            return;
        }

        try {
            const threads = await api.getReviewThreads(prId);
            if (token === prRequest) {
                reviewThreads.value = threads;
            }
        } catch {
            if (token === prRequest) {
                reviewThreads.value = [];
            }
        }
    }

    // Re-read the current PR's review threads after a write (a reply or a resolve), so
    // the diff popover reflects the change. Bumps the request token so it, not a stale
    // in-flight load, is the one that lands.
    async function reloadReviewThreads() {
        await loadReviewThreads(pullRequest.value?.id, ++prRequest);
    }

    // Reply into an inline review thread by its node id, then re-fetch so the reply
    // shows in the popover. Returns gh's ok/message result for an inline error.
    async function replyToReviewThread(
        threadId: string,
        body: string
    ): Promise<CommentMutationResult> {
        const api = window.api;
        if (!api?.replyToReviewThread || !threadId || !body.trim()) {
            return { ok: false, message: 'Nothing to post.' };
        }

        const result = await api.replyToReviewThread(threadId, body);
        if (result.ok) {
            await reloadReviewThreads();
        }

        return result;
    }

    // Resolve or unresolve a review thread by its node id, then re-fetch so its state
    // updates. Returns gh's ok/message result for an inline error.
    async function setReviewThreadResolved(
        threadId: string,
        resolved: boolean
    ): Promise<CommentMutationResult> {
        const api = window.api;
        if (!api?.setReviewThreadResolved || !threadId) {
            return { ok: false, message: 'No thread to update.' };
        }

        const result = await api.setReviewThreadResolved(threadId, resolved);
        if (result.ok) {
            await reloadReviewThreads();
        }

        return result;
    }

    // Re-detect the PR when the compared range changes. Compare mode does not affect
    // which PR exists (that is the base<-head pairing), so it is not a trigger. The
    // range change swaps the PR, so this run drives the spinner.
    watch([base, head], () => void loadPullRequest(true));

    // Post a new comment on the current PR (edit mode only), then re-fetch so it
    // shows. Returns gh's ok/message result for the view to surface an inline error.
    async function postComment(body: string): Promise<CommentMutationResult> {
        const api = window.api;
        const pr = pullRequest.value;
        if (!api || !pr || !body.trim()) {
            return { ok: false, message: 'Nothing to post.' };
        }

        const result = await api.postComment(pr.number, body);
        if (result.ok) {
            await loadPullRequest();
        }

        return result;
    }

    // Edit one of the user's own comments by its node id, then re-fetch so the
    // change shows. GitHub rejects editing another author's comment; that failure
    // comes back in the result.
    async function editComment(commentId: string, body: string): Promise<CommentMutationResult> {
        const api = window.api;
        if (!api || !commentId || !body.trim()) {
            return { ok: false, message: 'Nothing to save.' };
        }

        const result = await api.editComment(commentId, body);
        if (result.ok) {
            await loadPullRequest();
        }

        return result;
    }

    // Delete one of the user's own comments by its node id, then re-fetch so it
    // drops from the conversation. GitHub rejects deleting another author's
    // comment; that failure comes back in the result.
    async function deleteComment(commentId: string): Promise<CommentMutationResult> {
        const api = window.api;
        if (!api || !commentId) {
            return { ok: false, message: 'Nothing to delete.' };
        }

        const result = await api.deleteComment(commentId);
        if (result.ok) {
            await loadPullRequest();
        }

        return result;
    }

    // Edit the PR's own description (body), then re-fetch so the rendered Markdown
    // updates. An empty body is allowed. GitHub rejects editing a PR the viewer
    // cannot update; that failure comes back in the result.
    async function editDescription(body: string): Promise<CommentMutationResult> {
        const api = window.api;
        const pr = pullRequest.value;
        if (!api || !pr) {
            return { ok: false, message: 'Nothing to save.' };
        }

        const result = await api.editDescription(pr.number, body);
        if (result.ok) {
            await loadPullRequest();
        }

        return result;
    }

    // The diff pane shows a "Load diff" gate in place of the editor when the
    // selected file is over the size threshold and has not been loaded yet. Binary
    // files are excluded: their content is already withheld, so there is nothing to
    // gate (they get their own preview).
    const showDiffGate = computed(
        () => selectedPair.value.tooLarge && !selectedPair.value.binary && !largeDiffLoaded.value
    );

    // Clearing the gate fetches the large file's withheld content (the initial
    // pair carried none, so selecting it shipped nothing over IPC) and then reveals
    // the diff. Reuses loadFilePair's request token so a slow full-content response
    // is dropped if the selection or range moved on; the gate stays up on failure.
    async function loadLargeDiff() {
        const api = window.api;
        const path = selectedFile.value.path;
        if (!api || !base.value || !path) {
            return;
        }

        const token = ++pairRequest;
        try {
            const full = await api.getFilePair(
                base.value,
                head.value,
                path,
                compareMode.value,
                true
            );
            if (token === pairRequest) {
                selectedPair.value = full;
                largeDiffLoaded.value = true;
            }
        } catch {
            // Leave the gate in place so the user can retry.
        }
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

    // Whether a file carries a given marker, read from the by-path maps so the filter
    // and the facet counts share one source of truth.
    function fileHasMarker(path: string, marker: FileMarker): boolean {
        if (marker === 'comment') {
            return commentStateByPath.value.has(path);
        }

        const level = annotationLevelByPath.value.get(path);
        return marker === 'error' ? level === 'failure' : level === 'warning';
    }

    // The filetype options offered by the filter menu: every extension present in the
    // current change set, with a file count, sorted alphabetically. Files with no
    // extension come last under a "(no extension)" label so the bucket is legible.
    const availableExtensions = computed<FilterOption<string>[]>(() => {
        const counts = new Map<string, number>();
        for (const f of files.value) {
            const ext = fileExtension(f.path);
            counts.set(ext, (counts.get(ext) ?? 0) + 1);
        }

        const entries = [...counts.entries()];
        // Sorting the freshly built array in place is safe (nothing else holds it).
        // oxlint-disable-next-line no-array-sort
        entries.sort(([a], [b]) => {
            if (a === NO_EXTENSION) {
                return 1;
            }
            if (b === NO_EXTENSION) {
                return -1;
            }

            return a.localeCompare(b);
        });

        return entries.map(([value, count]) => ({
            value,
            label: value === NO_EXTENSION ? '(no extension)' : '.' + value,
            count,
        }));
    });

    // The change-type options: each file status present in the change set, labelled by
    // its mutation, in a stable A/M/D/R order.
    const STATUS_ORDER: FileStatus[] = ['A', 'M', 'D', 'R'];
    const availableStatuses = computed<FilterOption<FileStatus>[]>(() => {
        const counts = new Map<FileStatus, number>();
        for (const f of files.value) {
            counts.set(f.status, (counts.get(f.status) ?? 0) + 1);
        }

        return STATUS_ORDER.filter((s) => counts.has(s)).map((value) => ({
            value,
            label: STATUS_LABEL[value],
            count: counts.get(value) ?? 0,
        }));
    });

    // The marker options: errors, warnings, and comments that actually occur in the
    // change set (a facet with no such files is not offered).
    const MARKER_ORDER: FileMarker[] = ['error', 'warning', 'comment'];
    const availableMarkers = computed<FilterOption<FileMarker>[]>(() => {
        return MARKER_ORDER.map((value) => ({
            value,
            label: MARKER_LABEL[value],
            count: files.value.filter((f) => fileHasMarker(f.path, value)).length,
        })).filter((o) => o.count > 0);
    });

    // How many filter options are selected across every facet (the text box aside), so
    // the menu trigger can badge the active count and callers can tell if any is on.
    const activeFilterCount = computed(
        () => filterStatuses.value.size + filterExtensions.value.size + filterMarkers.value.size
    );
    const hasActiveFilters = computed(() => activeFilterCount.value > 0);

    // The change set narrowed to the filter box and the active facets, shared by the
    // tree render and the per-folder "mark viewed" action so the folder checkbox and
    // the files it toggles always agree on what the folder contains. Facets combine
    // with AND; the values within a facet with OR (see the filter state above).
    const shownFiles = computed(() => {
        const filter = treeFilter.value.toLowerCase();
        const statuses = filterStatuses.value;
        const extensions = filterExtensions.value;
        const markers = filterMarkers.value;
        return files.value.filter((f) => {
            if (filter && !f.path.toLowerCase().includes(filter)) {
                return false;
            }
            if (statuses.size > 0 && !statuses.has(f.status)) {
                return false;
            }
            if (extensions.size > 0 && !extensions.has(fileExtension(f.path))) {
                return false;
            }
            if (markers.size > 0 && ![...markers].some((m) => fileHasMarker(f.path, m))) {
                return false;
            }

            return true;
        });
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

    // Changed-file paths in the sidebar's display order (directories first, then
    // files, matching the tree walk in treeNodes), narrowed to the filter box.
    // Cross-file change navigation walks this so "next file" follows what the user
    // sees rather than git's raw path order. Collapsed folders are still included:
    // folding is a display convenience, and every file in the set stays reachable.
    const orderedPaths = computed<string[]>(() => {
        const root = buildTree(shownFiles.value);
        const paths: string[] = [];
        const walk = (node: RawDir) => {
            for (const child of node.dirs.values()) {
                walk(child);
            }
            for (const file of node.files) {
                paths.push(file.path);
            }
        };

        walk(root);
        return paths;
    });

    // The shown files in the sidebar's display order, as full change records. Backs
    // the stacked "all files" list (one card per entry); mirrors orderedPaths but
    // carries each file's metadata (status, +/- counts, oldPath) so a card needs no
    // extra lookup.
    const orderedShownFiles = computed<ChangedFile[]>(() => {
        const byPath = new Map(files.value.map((f) => [f.path, f]));
        return orderedPaths.value
            .map((path) => byPath.get(path))
            .filter((f): f is ChangedFile => f !== undefined);
    });

    function selectFile(path: string) {
        // A manual pick lands at the top of the file; drop any pending cross-file
        // edge so it can't hijack this selection with an unexpected jump.
        pendingChangeEdge.value = null;
        selectedPath.value = path;
    }

    // Update the current file from the stacked list's scroll position, so the sidebar
    // highlight and status bar follow what the reader is looking at. A plain
    // assignment (no pendingChangeEdge reset); the single-file loader is gated off in
    // the stacked layout, so this does not trigger a per-file fetch.
    function setCurrentFromScroll(path: string) {
        if (path && path !== selectedPath.value) {
            selectedPath.value = path;
        }
    }

    // Move the selection to the next/previous file in display order, wrapping at
    // the ends, and record which change edge the viewer should land on. Returns
    // whether the selection actually changed: a single-file set wraps onto itself,
    // so the caller wraps within the current viewer instead. The pending edge is
    // set only on a real switch, since a no-op switch triggers no diff reload for
    // the viewer to consume it on.
    function goToAdjacentFile(direction: 'next' | 'prev'): boolean {
        const paths = orderedPaths.value;
        if (paths.length === 0) {
            return false;
        }

        const current = paths.indexOf(selectedPath.value);
        const step = direction === 'next' ? 1 : -1;
        // With nothing selected, step forward onto the first file and back onto
        // the last, treating the position as sitting before the list.
        const from = current === -1 ? (direction === 'next' ? -1 : 0) : current;
        const nextPath = paths[(from + step + paths.length) % paths.length]!;
        if (nextPath === selectedPath.value) {
            return false;
        }

        pendingChangeEdge.value = direction === 'next' ? 'first' : 'last';
        selectedPath.value = nextPath;
        return true;
    }

    function clearChangeEdge() {
        pendingChangeEdge.value = null;
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

    function toggleStatusFilter(status: FileStatus) {
        toggleInSet(filterStatuses, status);
    }
    function toggleExtensionFilter(ext: string) {
        toggleInSet(filterExtensions, ext);
    }
    function toggleMarkerFilter(marker: FileMarker) {
        toggleInSet(filterMarkers, marker);
    }

    // Drop every active facet at once (the menu's "Clear all"). The text box is a
    // separate control, so it is left as is.
    function clearFilters() {
        filterStatuses.value = new Set();
        filterExtensions.value = new Set();
        filterMarkers.value = new Set();
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
        clearFilters();
        selectedPath.value = '';
        pullRequest.value = null;
        prStatus.value = 'no-pr';
        prMessage.value = '';
        reviewThreads.value = [];
        checkAnnotations.value = [];
        prLoading.value = false;
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
        // A fresh change set (range change, refresh, repo switch) invalidates any
        // queued cross-file landing, so it can't fire on a file it wasn't set for.
        pendingChangeEdge.value = null;
        // The stacked view's per-file pair cache is keyed to the old range; drop it
        // so cards refetch against the new change set.
        clearPairCache();

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
        // A refresh keeps the same range, so the [base, head] watch does not fire;
        // re-detect the PR directly in case it opened, merged, or its body changed.
        await loadPullRequest();
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
        filterStatuses,
        filterExtensions,
        filterMarkers,
        availableStatuses,
        availableExtensions,
        availableMarkers,
        activeFilterCount,
        hasActiveFilters,
        collapsed,
        pendingChangeEdge,
        lastSyncedAt,
        pullRequest,
        prStatus,
        prMessage,
        prLoading,
        hasPullRequest,
        prWarning,
        reviewThreads,
        threadsForFile,
        commentStateForFile,
        replyToReviewThread,
        setReviewThreadResolved,
        checkAnnotations,
        annotationsForFile,
        annotationLevelForFile,
        loadPullRequest,
        postComment,
        editComment,
        deleteComment,
        editDescription,
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
        orderedPaths,
        orderedShownFiles,
        allCollapsed,
        selectFile,
        setCurrentFromScroll,
        openFile,
        pairFor,
        goToAdjacentFile,
        clearChangeEdge,
        toggleViewed,
        toggleDirViewed,
        toggleDir,
        expandAll,
        collapseAll,
        toggleAll,
        setTreeFilter,
        toggleStatusFilter,
        toggleExtensionFilter,
        toggleMarkerFilter,
        clearFilters,
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
