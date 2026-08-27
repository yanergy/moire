import { describe, it, expect, vi } from 'vitest';
import { buildMenuTemplate, sendThemeToggle, THEME_TOGGLE_CHANNEL } from '../electron/menu.cjs';

// menu.cjs is CommonJS loaded natively under vitest, so `require('electron')`
// inside it resolves to the binary path (not the API) and Menu/BrowserWindow are
// undefined. The template builder is pure and the click handler takes its target
// window as an argument, so both are testable without a running Electron.
describe('application menu', () => {
    it('adds a Toggle Theme command to the View menu', () => {
        const onToggleTheme = vi.fn<() => void>();
        const template = buildMenuTemplate({ isMac: true, onToggleTheme });

        const view = template.find((menu) => menu.label === 'View');
        const item = view?.submenu.find((entry) => entry.label === 'Toggle Theme');

        expect(item).toBeDefined();
        expect(item?.accelerator).toBe('CmdOrCtrl+Shift+L');
        expect(item?.click).toBe(onToggleTheme);
    });

    it('omits the macOS app menu on other platforms', () => {
        expect(buildMenuTemplate({ isMac: true, onToggleTheme() {} })[0].role).toBe('appMenu');
        expect(buildMenuTemplate({ isMac: false, onToggleTheme() {} })[0].role).toBe('fileMenu');
    });

    it('sends the toggle to the window that owns the command', () => {
        const send = vi.fn<(channel: string) => void>();
        sendThemeToggle(null, { webContents: { send } });
        expect(send).toHaveBeenCalledWith(THEME_TOGGLE_CHANNEL);
    });
});
