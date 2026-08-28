// Persistent app settings in the main process. electron-store v11 is ESM-only,
// so it is loaded with a dynamic import from this CommonJS module rather than a
// require (see documentation/code-conventions.md: main stays CommonJS).

const MAX_RECENT_REPOS = 10;

let storePromise;

function getStore() {
    if (!storePromise) {
        storePromise = import('electron-store').then(
            ({ default: Store }) =>
                new Store({
                    name: 'moire',
                    defaults: { recentRepos: [], theme: 'system', branchSelections: {} },
                })
        );
    }

    return storePromise;
}

async function getRecentRepos() {
    const store = await getStore();
    return store.get('recentRepos', []);
}

// Most-recent-first, de-duplicated, capped. Returns the new list.
async function addRecentRepo(repoPath) {
    const store = await getStore();
    const existing = store.get('recentRepos', []);
    const next = [repoPath, ...existing.filter((entry) => entry !== repoPath)].slice(
        0,
        MAX_RECENT_REPOS
    );
    store.set('recentRepos', next);
    return next;
}

// Drop one entry, along with any branch selection remembered for it, so a
// removed repo leaves nothing behind. Returns the new list.
async function removeRecentRepo(repoPath) {
    const store = await getStore();
    const next = store.get('recentRepos', []).filter((entry) => entry !== repoPath);
    store.set('recentRepos', next);

    const selections = store.get('branchSelections', {});
    if (repoPath in selections) {
        delete selections[repoPath];
        store.set('branchSelections', selections);
    }

    return next;
}

// The base/head refs a repo was last compared on, keyed by repo path so each
// repo restores its own range. Null when the repo has no remembered selection
// (never opened since the feature landed, or the entry was pruned).
async function getBranchSelection(repoPath) {
    const store = await getStore();
    return store.get('branchSelections', {})[repoPath] ?? null;
}

async function setBranchSelection(repoPath, base, head) {
    const store = await getStore();
    const selections = store.get('branchSelections', {});
    selections[repoPath] = { base, head };
    store.set('branchSelections', selections);
}

// Theme preference ('system' | 'light' | 'dark'). Restored on launch to seed
// nativeTheme; persisted whenever the user changes it from the View → Theme menu.
async function getThemePreference() {
    const store = await getStore();
    return store.get('theme', 'system');
}

async function setThemePreference(preference) {
    const store = await getStore();
    store.set('theme', preference);
}

module.exports = {
    getRecentRepos,
    addRecentRepo,
    removeRecentRepo,
    getBranchSelection,
    setBranchSelection,
    getThemePreference,
    setThemePreference,
};
