// Persistent app settings in the main process. electron-store v11 is ESM-only,
// so it is loaded with a dynamic import rather than a static one, keeping the
// store off the module's synchronous init path.

import type { ActivityEntry, DashboardEventKind, DashboardSnapshot } from './github/notifications';

const MAX_RECENT_REPOS = 10;

export interface BranchSelection {
    base: string;
    head: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

// The diff-color palette the editor renders with. Mirrored on the renderer side
// in src/shared/types.ts (the process split forbids sharing across it); keep the
// two in sync.
export type CodeStyle = 'github' | 'vscode';

// How the review area lays diffs out: the current one-file-at-a-time view
// ('single'), or a GitHub-style continuous list of every changed file ('stacked').
// Mirrored on the renderer side in src/shared/types.ts; keep the two in sync.
export type DiffLayout = 'single' | 'stacked';

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
                        codeStyle: 'github',
                        editor: 'auto',
                        branchSelections: {},
                        favoriteBranches: {},
                        windowState: null,
                        flourishes: true,
                        diffLayout: 'single',
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

// Drop one entry, along with any branch selection and favorites remembered for
// it, so a removed repo leaves nothing behind. Returns the new list.
export async function removeRecentRepo(repoPath: string): Promise<string[]> {
    const store = await getStore();
    const next = store.get<string[]>('recentRepos', []).filter((entry) => entry !== repoPath);
    store.set('recentRepos', next);

    const selections = store.get<Record<string, BranchSelection>>('branchSelections', {});
    if (repoPath in selections) {
        delete selections[repoPath];
        store.set('branchSelections', selections);
    }

    const favorites = store.get<Record<string, string[]>>('favoriteBranches', {});
    if (repoPath in favorites) {
        delete favorites[repoPath];
        store.set('favoriteBranches', favorites);
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

// The branches starred in the ref pickers, keyed by repo path so each repo keeps
// its own. A starred branch that was since deleted stays stored (the renderer
// only lists the ones that exist), so it reappears if the branch comes back.
export async function getFavoriteBranches(repoPath: string): Promise<string[]> {
    const store = await getStore();
    return store.get<Record<string, string[]>>('favoriteBranches', {})[repoPath] ?? [];
}

export async function setFavoriteBranches(repoPath: string, names: string[]): Promise<void> {
    const store = await getStore();
    const favorites = store.get<Record<string, string[]>>('favoriteBranches', {});
    if (names.length === 0) {
        delete favorites[repoPath];
    } else {
        favorites[repoPath] = names;
    }

    store.set('favoriteBranches', favorites);
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

// The diff-color palette ('github' | 'vscode'). Read on launch to check the right
// radio in the View → Code Style menu; persisted whenever the user changes it.
// Defaults to 'github'.
export async function getCodeStyle(): Promise<CodeStyle> {
    const store = await getStore();
    return store.get<CodeStyle>('codeStyle', 'github');
}

export async function setCodeStyle(style: CodeStyle): Promise<void> {
    const store = await getStore();
    store.set('codeStyle', style);
}

// Which editor files open in when launched from the diff header: 'auto' (the OS
// default app) or an editor id from electron/editors.ts. Read on launch to seed the
// View → "Open Files In" menu radio; persisted whenever the user changes it.
export async function getEditorPreference(): Promise<string> {
    const store = await getStore();
    return store.get<string>('editor', 'auto');
}

export async function setEditorPreference(editor: string): Promise<void> {
    const store = await getStore();
    store.set('editor', editor);
}

// The diff layout the review area renders with ('single' | 'stacked'). Read on
// launch to seed the View → Diff Layout menu radio; persisted whenever the user
// changes it. Defaults to 'single' (the one-file-at-a-time view).
export async function getDiffLayout(): Promise<DiffLayout> {
    const store = await getStore();
    return store.get<DiffLayout>('diffLayout', 'single');
}

export async function setDiffLayout(layout: DiffLayout): Promise<void> {
    const store = await getStore();
    store.set('diffLayout', layout);
}

// Whether the review-complete flourishes play. Persisted so the (deliberately
// low-key) View menu toggle sticks across launches. Defaults on.
export async function getFlourishes(): Promise<boolean> {
    const store = await getStore();
    return store.get<boolean>('flourishes', true);
}

export async function setFlourishes(enabled: boolean): Promise<void> {
    const store = await getStore();
    store.set('flourishes', enabled);
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

// Whose PRs the dashboard cards count: 'me' is the signed in gh account (kept
// symbolic so it follows an account switch), 'all' is every author, and a list
// names specific logins. Mirrored in src/shared/types.ts; keep the two in sync.
export type AuthorFilter = 'me' | 'all' | string[];

// GitHub notification preferences. `enabled` is the master switch (on by default,
// users can opt out); `events` holds one toggle per event kind; `dockBadge` shows
// the review request count on the dock icon; `notifyDrafts` lets draft PRs send
// notifications. The dashboard's own settings live here too: `dashboardShowDrafts`
// includes draft PRs in its cards, `dashboardAuthors` picks whose PRs the cards
// count, and `dashboardHiddenCards` lists the overview cards turned off in its
// settings menu (the hidden ones, so a card added later shows by default). None
// of the dashboard ones affect notifications. Stored values are merged over the
// defaults, so an event kind added later starts at its default instead of off.
export interface NotificationPrefs {
    enabled: boolean;
    events: Record<DashboardEventKind, boolean>;
    dockBadge: boolean;
    notifyDrafts: boolean;
    dashboardShowDrafts: boolean;
    dashboardAuthors: AuthorFilter;
    dashboardHiddenCards: string[];
}

// Before the dashboard and notifications had their own drafts toggle, one
// `showDrafts` covered both. A stored value still seeds the two new ones.
type StoredNotificationPrefs = Partial<NotificationPrefs> & { showDrafts?: boolean };

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
    enabled: true,
    events: {
        'review-requested': true,
        'changes-requested': true,
        'closed-unmerged': true,
        'checks-failed': true,
        approved: true,
        'merge-conflict': true,
        'ready-to-merge': false,
        'merged-by-other': false,
    },
    dockBadge: true,
    notifyDrafts: true,
    dashboardShowDrafts: true,
    dashboardAuthors: 'me',
    dashboardHiddenCards: [],
};

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
    const store = await getStore();
    const { showDrafts, ...stored } = store.get<StoredNotificationPrefs>('notifications', {});
    return {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(showDrafts === undefined
            ? {}
            : { notifyDrafts: showDrafts, dashboardShowDrafts: showDrafts }),
        ...stored,
        events: { ...DEFAULT_NOTIFICATION_PREFS.events, ...stored.events },
    };
}

// Merge a partial change (a single toggle) into the stored preferences and
// return the result.
export async function setNotificationPrefs(
    change: Partial<Omit<NotificationPrefs, 'events'>> & {
        events?: Partial<NotificationPrefs['events']>;
    }
): Promise<NotificationPrefs> {
    const store = await getStore();
    const current = await getNotificationPrefs();
    const next: NotificationPrefs = {
        ...current,
        ...change,
        events: { ...current.events, ...change.events },
    };
    store.set('notifications', next);
    return next;
}

// The notifier's saved state for one gh login and repository: the last snapshot
// (diffed against on the next poll, so a restart does not resend notifications)
// and the recent activity list. Keyed by `login|owner/name`; null when that pair
// has never been polled, which the notifier treats as a silent baseline.
export interface NotifierRepoState {
    snapshot: DashboardSnapshot;
    activity: ActivityEntry[];
}

export async function getNotifierState(key: string): Promise<NotifierRepoState | null> {
    const store = await getStore();
    return store.get<Record<string, NotifierRepoState>>('notifierState', {})[key] ?? null;
}

export async function setNotifierState(key: string, state: NotifierRepoState): Promise<void> {
    const store = await getStore();
    const all = store.get<Record<string, NotifierRepoState>>('notifierState', {});
    all[key] = state;
    store.set('notifierState', all);
}
