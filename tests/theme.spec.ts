import { describe, it, expect, vi } from 'vitest';
import {
    themeStateOf,
    initTheme,
    setThemePreference,
    registerThemeBroadcast,
    THEME_CHANGED_CHANNEL,
} from '../electron/theme.cjs';

// theme.cjs is CommonJS loaded natively under vitest, so `require('electron')`
// resolves to the binary path and `nativeTheme` is undefined. Every function
// below takes an injectable nativeTheme, so a stub that mimics themeSource +
// shouldUseDarkColors keeps the mapping and wiring testable without Electron.
function fakeNativeTheme({ osDark = false } = {}) {
    const listeners: Array<() => void> = [];
    return {
        themeSource: 'system',
        get shouldUseDarkColors() {
            if (this.themeSource === 'dark') return true;
            if (this.themeSource === 'light') return false;
            return osDark;
        },
        on(_event: string, listener: () => void) {
            listeners.push(listener);
        },
        emitUpdated() {
            listeners.forEach((listener) => listener());
        },
    };
}

describe('theme', () => {
    it('maps a nativeTheme to the renderer ThemeState shape', () => {
        const nativeTheme = fakeNativeTheme({ osDark: true });
        expect(themeStateOf(nativeTheme)).toEqual({ preference: 'system', isDark: true });

        nativeTheme.themeSource = 'light';
        expect(themeStateOf(nativeTheme)).toEqual({ preference: 'light', isDark: false });
    });

    it('seeds nativeTheme from the persisted preference on launch', async () => {
        const nativeTheme = fakeNativeTheme();
        const load = vi.fn<() => Promise<string>>().mockResolvedValue('dark');

        const preference = await initTheme({ nativeTheme, load });

        expect(preference).toBe('dark');
        expect(nativeTheme.themeSource).toBe('dark');
    });

    it('applies and persists a new preference, returning the resolved state', async () => {
        const nativeTheme = fakeNativeTheme();
        const persist = vi.fn<(preference: string) => Promise<void>>().mockResolvedValue();

        const state = await setThemePreference('dark', { nativeTheme, persist });

        expect(nativeTheme.themeSource).toBe('dark');
        expect(persist).toHaveBeenCalledWith('dark');
        expect(state).toEqual({ preference: 'dark', isDark: true });
    });

    it('resolves the system preference against the OS setting', async () => {
        const nativeTheme = fakeNativeTheme({ osDark: true });
        const persist = vi.fn<(preference: string) => Promise<void>>().mockResolvedValue();

        const state = await setThemePreference('system', { nativeTheme, persist });

        expect(state).toEqual({ preference: 'system', isDark: true });
    });

    it('broadcasts the resolved state to every window when the theme changes', () => {
        const nativeTheme = fakeNativeTheme({ osDark: false });
        const send = vi.fn<(channel: string, state: unknown) => void>();
        const getWindows = () => [{ webContents: { send } }];

        registerThemeBroadcast({ nativeTheme, getWindows });
        nativeTheme.themeSource = 'dark';
        nativeTheme.emitUpdated();

        expect(send).toHaveBeenCalledWith(THEME_CHANGED_CHANNEL, {
            preference: 'dark',
            isDark: true,
        });
    });
});
