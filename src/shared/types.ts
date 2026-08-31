// Types shared across the IPC boundary between the Electron main process and
// the renderer. During the UI-shell phase only the renderer consumes them; the
// git backend (GitService, preload bridge) will import the same definitions so
// neither side redefines a shape.

export type FileStatus = 'A' | 'M' | 'D' | 'R';
// The renderer's copy of the compare-mode union. The backend keeps its own in
// electron/git/GitService.ts (the process split forbids sharing across it); keep
// the two in sync.
export type CompareMode = 'merge-base' | 'direct';
export type ViewMode = 'split' | 'unified';
// The concrete theme the UI resolves to. `ThemePreference` is what the user
// picks; `system` follows the OS and resolves to one of these.
export type ThemeName = 'dark' | 'light';
export type ThemePreference = 'system' | 'light' | 'dark';

// The theme state the main process owns (via nativeTheme) and pushes to the
// renderer: the chosen preference plus the resolved dark/light it maps to.
export interface ThemeState {
    preference: ThemePreference;
    isDark: boolean;
}

// Head-side sentinel for "compare against the on-disk working tree".
export const WORKING_TREE = 'WORKING TREE';

export interface ChangedFile {
    path: string;
    oldPath?: string; // set for renames
    status: FileStatus;
    additions: number;
    deletions: number;
    binary: boolean;
}

export interface FilePair {
    path: string;
    oldContent: string | null; // null for added files
    newContent: string | null; // null for deleted files
    language: string; // inferred from extension, for Monaco
    binary: boolean;
    tooLarge: boolean; // above render threshold
    sizeBytes: number; // larger side's byte length, shown on the large-file gate
    // Set for image files the renderer can preview. `image` gates the preview;
    // the two sides are base64 data URIs (null for an add/delete side, or when the
    // image is too large to inline).
    image?: boolean;
    oldImage?: string | null;
    newImage?: string | null;
}

export interface BranchInfo {
    name: string;
    kind: 'local' | 'remote';
    isCurrent?: boolean; // the checked-out branch, marked in the ref selector
}

export interface RepoInfo {
    path: string;
    name: string;
}

// The base/head refs a repo was last compared on, persisted per repo so
// reopening it restores the range. `head` may be the WORKING_TREE sentinel;
// `base` may be empty (the user swapped it away).
export interface BranchSelection {
    base: string;
    head: string;
}

export interface RepoChangeEvent {
    reason: 'refs' | 'worktree';
    at: number;
}

// Preload API surface, exposed on window.api once the git backend lands.
export interface MoireApi {
    openRepoDialog(): Promise<string | null>;
    openRepo(path: string): Promise<RepoInfo | null>; // null when the folder is not a Git repo
    getRecentRepos(): Promise<string[]>;
    removeRecentRepo(path: string): Promise<string[]>; // returns the updated list
    getBranchSelection(path: string): Promise<BranchSelection | null>; // null when none is remembered
    setBranchSelection(path: string, base: string, head: string): Promise<void>;
    getBranches(): Promise<BranchInfo[]>;
    getChangedFiles(base: string, head: string, mode: CompareMode): Promise<ChangedFile[]>;
    // `full` refetches a large file's withheld content when the "Load diff" gate
    // is cleared; the default (false) gates it, so selecting a large file ships no
    // content over IPC.
    getFilePair(
        base: string,
        head: string,
        path: string,
        mode: CompareMode,
        full?: boolean
    ): Promise<FilePair>;
    onRepoChanged(cb: (event: RepoChangeEvent) => void): () => void;
    // Theme is owned by the main process via nativeTheme. `getTheme` reads the
    // current resolved state; `onThemeChanged` fires when the native "View →
    // Theme" selection or the OS theme changes, and returns an unsubscribe
    // function.
    getTheme(): Promise<ThemeState>;
    onThemeChanged(cb: (state: ThemeState) => void): () => void;
    // Fired when the native View → Refresh item is chosen; the renderer re-reads
    // the repo for the current range. Returns an unsubscribe function.
    onMenuRefresh(cb: () => void): () => void;
    // Fired when the native File → Open Repository… item is chosen; the renderer
    // runs its open-folder flow. Returns an unsubscribe function.
    onMenuOpenRepo(cb: () => void): () => void;
    // Fired when a native File → Open Recent entry is chosen, with its path.
    // Returns an unsubscribe function.
    onMenuOpenRecent(cb: (path: string) => void): () => void;
}
