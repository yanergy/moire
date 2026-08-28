// Persistent app settings in the main process. electron-store v11 is ESM-only,
// so it is loaded with a dynamic import from this CommonJS module rather than a
// require (see documentation/code-conventions.md: main stays CommonJS).

const MAX_RECENT_REPOS = 10;

let storePromise;

function getStore() {
    if (!storePromise) {
        storePromise = import('electron-store').then(
            ({ default: Store }) =>
                new Store({ name: 'moire', defaults: { recentRepos: [], theme: 'system' } })
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

// Drop one entry. Returns the new list.
async function removeRecentRepo(repoPath) {
    const store = await getStore();
    const next = store.get('recentRepos', []).filter((entry) => entry !== repoPath);
    store.set('recentRepos', next);
    return next;
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
    getThemePreference,
    setThemePreference,
};
