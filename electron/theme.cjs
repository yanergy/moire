// Theme ownership lives in the main process. Electron's `nativeTheme` is the
// single source of truth: `themeSource` holds the user's preference ('system' |
// 'light' | 'dark') and `shouldUseDarkColors` is the resolved value, which
// follows the OS while the preference is 'system'. The renderer only mirrors and
// applies what main pushes here; the native View → Theme menu is what changes it.
//
// nativeTheme is required lazily-ish (module scope) but only ever touched through
// the functions below, which take an injectable `nativeTheme` defaulting to the
// real one. That keeps the mapping logic unit-testable without a running Electron
// (require('electron') resolves to a path, not the API, under vitest).

const { nativeTheme: defaultNativeTheme, BrowserWindow } = require('electron');
const {
    getThemePreference,
    setThemePreference: persistThemePreference,
} = require('./settings.cjs');

const THEME_CHANGED_CHANNEL = 'theme:changed';

// Pure over its argument: maps a nativeTheme-like object to the ThemeState shape
// the renderer consumes (src/shared/types.ts).
function themeStateOf(nativeTheme) {
    return { preference: nativeTheme.themeSource, isDark: nativeTheme.shouldUseDarkColors };
}

function currentThemeState() {
    return themeStateOf(defaultNativeTheme);
}

// Seed nativeTheme from the persisted preference on launch. Returns the applied
// preference so the caller can build the menu with the matching item checked.
async function initTheme({ nativeTheme = defaultNativeTheme, load = getThemePreference } = {}) {
    const preference = await load();
    nativeTheme.themeSource = preference;
    return preference;
}

// Apply and persist a new preference. Setting `themeSource` fires nativeTheme's
// 'updated' event, so the broadcast below reaches the renderer; no explicit push
// is needed here. Returns the resolved state for callers that want it.
async function setThemePreference(
    preference,
    { nativeTheme = defaultNativeTheme, persist = persistThemePreference } = {}
) {
    nativeTheme.themeSource = preference;
    await persist(preference);
    return themeStateOf(nativeTheme);
}

// Push the resolved theme to every window whenever it changes. One 'updated'
// listener covers both cases: the user picking from the menu (which sets
// themeSource) and the OS theme changing while the preference is 'system'.
function registerThemeBroadcast({
    nativeTheme = defaultNativeTheme,
    getWindows = () => BrowserWindow.getAllWindows(),
} = {}) {
    nativeTheme.on('updated', () => {
        const state = themeStateOf(nativeTheme);
        for (const win of getWindows()) {
            win.webContents.send(THEME_CHANGED_CHANNEL, state);
        }
    });
}

module.exports = {
    THEME_CHANGED_CHANNEL,
    themeStateOf,
    currentThemeState,
    initTheme,
    setThemePreference,
    registerThemeBroadcast,
};
