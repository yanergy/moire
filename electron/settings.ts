// Persistent app settings in the main process. electron-store v11 is ESM-only,
// so it is loaded with a dynamic import rather than a static one, keeping the
// store off the module's synchronous init path.

const MAX_RECENT_REPOS = 10;

export interface BranchSelection {
    base: string;
    head: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface WindowState {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    maximized?: boolean;
}

// The subset of electron-store's API this module uses. electron-store's own type
// is generic over the schema; this structural type keeps the call sites typed
// without threading that generic through.
interface SettingsStore {
    get<T>(key: string, defaultValue: T): T;
    set(key: string, value: unknown): void;
}

let storePromise: Promise<SettingsStore> | undefined;

function getStore(): Promise<SettingsStore> {
    if (!storePromise) {
        storePromise = import('electron-store').then(
            ({ default: Store }) =>
                new Store({
                    name: 'moire',
                    defaults: {
                        recentRepos: [],
                        theme: 'system',
                        branchSelections: {},
                        windowState: null,
                    },
                }) as unknown as SettingsStore
        );
    }

    return storePromise;
}

export async function getRecentRepos(): Promise<string[]> {
    const store = await getStore();
    return store.get<string[]>('recentRepos', []);
}

// Most-recent-first, de-duplicated, capped. Returns the new list.
export async function addRecentRepo(repoPath: string): Promise<string[]> {
    const store = await getStore();
    const existing = store.get<string[]>('recentRepos', []);
    const next = [repoPath, ...existing.filter((entry) => entry !== repoPath)].slice(
        0,
        MAX_RECENT_REPOS
    );
    store.set('recentRepos', next);
    return next;
}

// Drop one entry, along with any branch selection remembered for it, so a
// removed repo leaves nothing behind. Returns the new list.
export async function removeRecentRepo(repoPath: string): Promise<string[]> {
    const store = await getStore();
    const next = store.get<string[]>('recentRepos', []).filter((entry) => entry !== repoPath);
    store.set('recentRepos', next);

    const selections = store.get<Record<string, BranchSelection>>('branchSelections', {});
    if (repoPath in selections) {
        delete selections[repoPath];
        store.set('branchSelections', selections);
    }

    return next;
}

// The base/head refs a repo was last compared on, keyed by repo path so each
// repo restores its own range. Null when the repo has no remembered selection
// (never opened since the feature landed, or the entry was pruned).
export async function getBranchSelection(repoPath: string): Promise<BranchSelection | null> {
    const store = await getStore();
    return store.get<Record<string, BranchSelection>>('branchSelections', {})[repoPath] ?? null;
}

export async function setBranchSelection(
    repoPath: string,
    base: string,
    head: string
): Promise<void> {
    const store = await getStore();
    const selections = store.get<Record<string, BranchSelection>>('branchSelections', {});
    selections[repoPath] = { base, head };
    store.set('branchSelections', selections);
}

// Theme preference ('system' | 'light' | 'dark'). Restored on launch to seed
// nativeTheme; persisted whenever the user changes it from the View → Theme menu.
export async function getThemePreference(): Promise<ThemePreference> {
    const store = await getStore();
    return store.get<ThemePreference>('theme', 'system');
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
    const store = await getStore();
    store.set('theme', preference);
}

// The main window's last size, position, and maximized state, restored on launch
// so the app reopens where it was left. Null until the first window closes.
export async function getWindowState(): Promise<WindowState | null> {
    const store = await getStore();
    return store.get<WindowState | null>('windowState', null);
}

export async function setWindowState(state: WindowState): Promise<void> {
    const store = await getStore();
    store.set('windowState', state);
}
