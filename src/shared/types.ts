// Types shared across the IPC boundary between the Electron main process and
// the renderer. During the UI-shell phase only the renderer consumes them; the
// git backend (GitService, preload bridge) will import the same definitions so
// neither side redefines a shape.

export type FileStatus = 'A' | 'M' | 'D' | 'R';
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
}

export interface BranchInfo {
    name: string;
    kind: 'local' | 'remote';
    isCurrent?: boolean;
    meta?: string; // e.g. 'default', 'ahead 6', 'on disk'
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
    getFilePair(base: string, head: string, path: string): Promise<FilePair>;
    onRepoChanged(cb: (event: RepoChangeEvent) => void): () => void;
    // Theme is owned by the main process via nativeTheme. `getTheme` reads the
    // current resolved state; `onThemeChanged` fires when the native "View →
    // Theme" selection or the OS theme changes, and returns an unsubscribe
    // function.
    getTheme(): Promise<ThemeState>;
    onThemeChanged(cb: (state: ThemeState) => void): () => void;
}
