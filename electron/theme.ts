// Theme ownership lives in the main process. Electron's `nativeTheme` is the
// single source of truth: `themeSource` holds the user's preference ('system' |
// 'light' | 'dark') and `shouldUseDarkColors` is the resolved value, which
// follows the OS while the preference is 'system'. The renderer only mirrors and
// applies what main pushes here; the native View → Theme menu is what changes it.
//
// nativeTheme is imported at module scope but only ever touched through the
// functions below, which take an injectable `nativeTheme` defaulting to the real
// one. That keeps the mapping logic unit-testable without a running Electron
// (import('electron') resolves to a path, not the API, under vitest).

import { nativeTheme as defaultNativeTheme, BrowserWindow } from 'electron';
import {
    getThemePreference,
    setThemePreference as persistThemePreference,
    type ThemePreference,
} from './settings';

export const THEME_CHANGED_CHANNEL = 'theme:changed';

// The subset of electron's nativeTheme this module reads and listens on. Kept
// structural so tests can inject a stand-in without a running Electron.
interface ThemeLike {
    themeSource: ThemePreference;
    shouldUseDarkColors: boolean;
    on(event: 'updated', listener: () => void): void;
}

export interface ThemeState {
    preference: ThemePreference;
    isDark: boolean;
}

// Pure over its argument: maps a nativeTheme-like object to the ThemeState shape
// the renderer consumes (src/shared/types.ts).
export function themeStateOf(nativeTheme: ThemeLike): ThemeState {
    return { preference: nativeTheme.themeSource, isDark: nativeTheme.shouldUseDarkColors };
}

export function currentThemeState(): ThemeState {
    return themeStateOf(defaultNativeTheme);
}

// Seed nativeTheme from the persisted preference on launch. Returns the applied
// preference so the caller can build the menu with the matching item checked.
export async function initTheme({
    nativeTheme = defaultNativeTheme,
    load = getThemePreference,
}: {
    nativeTheme?: ThemeLike;
    load?: () => Promise<ThemePreference>;
} = {}): Promise<ThemePreference> {
    const preference = await load();
    nativeTheme.themeSource = preference;
    return preference;
}

// Apply and persist a new preference. Setting `themeSource` fires nativeTheme's
// 'updated' event, so the broadcast below reaches the renderer; no explicit push
// is needed here. Returns the resolved state for callers that want it.
export async function setThemePreference(
    preference: ThemePreference,
    {
        nativeTheme = defaultNativeTheme,
        persist = persistThemePreference,
    }: { nativeTheme?: ThemeLike; persist?: (preference: ThemePreference) => Promise<void> } = {}
): Promise<ThemeState> {
    nativeTheme.themeSource = preference;
    await persist(preference);
    return themeStateOf(nativeTheme);
}

// Push the resolved theme to every window whenever it changes. One 'updated'
// listener covers both cases: the user picking from the menu (which sets
// themeSource) and the OS theme changing while the preference is 'system'.
export function registerThemeBroadcast({
    nativeTheme = defaultNativeTheme,
    getWindows = () => BrowserWindow.getAllWindows(),
}: { nativeTheme?: ThemeLike; getWindows?: () => BrowserWindow[] } = {}): void {
    nativeTheme.on('updated', () => {
        const state = themeStateOf(nativeTheme);
        for (const win of getWindows()) {
            win.webContents.send(THEME_CHANGED_CHANNEL, state);
        }
    });
}
