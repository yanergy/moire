import { describe, it, expect, vi } from 'vitest';
import { buildMenuTemplate } from '../electron/menu.cjs';

// menu.cjs is CommonJS loaded natively under vitest, so `require('electron')`
// inside it resolves to the binary path (not the API) and Menu is undefined. The
// template builder is pure — it takes the current preference and a select handler
// as arguments — so it is testable without a running Electron.
function viewSubmenu(currentTheme: string, extra = {}) {
    const template = buildMenuTemplate({ isMac: true, currentTheme, ...extra });
    return template.find((menu) => menu.label === 'View')?.submenu;
}

function themeSubmenu(currentTheme: string, onSelectTheme = () => {}) {
    return viewSubmenu(currentTheme, { onSelectTheme })?.find((entry) => entry.label === 'Theme')
        ?.submenu;
}

describe('application menu', () => {
    it('offers System, Light, and Dark as radio items in the View → Theme menu', () => {
        const items = themeSubmenu('system');
        expect(items?.map((item) => item.label)).toEqual(['System', 'Light', 'Dark']);
        expect(items?.every((item) => item.type === 'radio')).toBe(true);
    });

    it('checks the item matching the current preference', () => {
        const checked = themeSubmenu('light')?.filter((item) => item.checked);
        expect(checked?.map((item) => item.label)).toEqual(['Light']);
    });

    it('reports the chosen preference through onSelectTheme', () => {
        const onSelectTheme = vi.fn<(preference: string) => void>();
        const items = themeSubmenu('system', onSelectTheme);

        items?.find((item) => item.label === 'Dark')?.click();
        expect(onSelectTheme).toHaveBeenCalledWith('dark');
    });

    it('offers a Refresh item bound to Cmd/Ctrl+R in the View menu', () => {
        const refresh = viewSubmenu('system')?.find((item) => item.label === 'Refresh');
        expect(refresh?.accelerator).toBe('CmdOrCtrl+R');
    });

    it('re-reads the repo through onRefresh when the item is chosen', () => {
        const onRefresh = vi.fn<() => void>();
        const refresh = viewSubmenu('system', { onRefresh })?.find(
            (item) => item.label === 'Refresh'
        );

        refresh?.click();
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('omits the macOS app menu on other platforms', () => {
        expect(buildMenuTemplate({ isMac: true, currentTheme: 'system' })[0].role).toBe('appMenu');
        expect(buildMenuTemplate({ isMac: false, currentTheme: 'system' })[0].role).toBe(
            'fileMenu'
        );
    });
});
