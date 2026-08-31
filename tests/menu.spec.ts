import { describe, it, expect, vi } from 'vitest';
import { buildMenuTemplate } from '../electron/menu';

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

function fileSubmenu(extra = {}) {
    const template = buildMenuTemplate({ isMac: true, currentTheme: 'system', ...extra });
    return template.find((menu) => menu.label === 'File')?.submenu;
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

    it('offers Open Repository… bound to Cmd/Ctrl+O and wired to onOpenRepo', () => {
        const onOpenRepo = vi.fn<() => void>();
        const open = fileSubmenu({ onOpenRepo })?.find((item) => item.label === 'Open Repository…');

        expect(open?.accelerator).toBe('CmdOrCtrl+O');
        open?.click();
        expect(onOpenRepo).toHaveBeenCalledTimes(1);
    });

    it('lists recent repos by name and opens the chosen path', () => {
        const onOpenRecent = vi.fn<(path: string) => void>();
        const recentRepos = ['/Users/me/Repos/moire', '/Users/me/work/api'];
        const recent = fileSubmenu({ recentRepos, onOpenRecent })?.find(
            (item) => item.label === 'Open Recent'
        )?.submenu;

        expect(recent?.map((item) => item.label)).toEqual(['moire', 'api']);
        recent?.[1]?.click();
        expect(onOpenRecent).toHaveBeenCalledWith('/Users/me/work/api');
    });

    it('marks the active repo checked in the recent list', () => {
        const recentRepos = ['/Users/me/Repos/moire', '/Users/me/work/api'];
        const recent = fileSubmenu({ recentRepos, activeRepo: '/Users/me/work/api' })?.find(
            (item) => item.label === 'Open Recent'
        )?.submenu;

        expect(recent?.map((item) => item.checked)).toEqual([false, true]);
    });

    it('shows a disabled placeholder when there are no recent repos', () => {
        const recent = fileSubmenu()?.find((item) => item.label === 'Open Recent')?.submenu;

        expect(recent).toHaveLength(1);
        expect(recent?.[0]?.label).toBe('No recent repositories');
        expect(recent?.[0]?.enabled).toBe(false);
    });

    it('offers a checked Flourishes toggle in the View menu and reports the new state', () => {
        const onToggleFlourishes = vi.fn<(enabled: boolean) => void>();
        const item = viewSubmenu('system', { flourishes: true, onToggleFlourishes })?.find(
            (entry) => entry.label === 'Flourishes'
        );

        expect(item?.type).toBe('checkbox');
        expect(item?.checked).toBe(true);

        // Electron flips the checkbox before firing click; the handler forwards the new state.
        const click = item!.click as unknown as (menuItem: { checked: boolean }) => void;
        click({ checked: false });
        expect(onToggleFlourishes).toHaveBeenCalledWith(false);
    });

    it('shows the Flourishes toggle unchecked when flourishes are off', () => {
        const item = viewSubmenu('system', { flourishes: false })?.find(
            (entry) => entry.label === 'Flourishes'
        );
        expect(item?.checked).toBe(false);
    });

    it('opens the log through onOpenLog from the Help menu', () => {
        const onOpenLog = vi.fn<() => void>();
        const template = buildMenuTemplate({ isMac: true, currentTheme: 'system', onOpenLog });
        const help = template.find((menu) => menu.role === 'help');
        const item = help?.submenu?.find((entry) => entry.label === 'Open Log File');

        item?.click();
        expect(onOpenLog).toHaveBeenCalledTimes(1);
    });

    it('omits the macOS app menu on other platforms', () => {
        // With the app menu present (mac) the File menu is second; without it, first.
        expect(buildMenuTemplate({ isMac: true, currentTheme: 'system' })[0].role).toBe('appMenu');
        expect(buildMenuTemplate({ isMac: true, currentTheme: 'system' })[1].label).toBe('File');
        expect(buildMenuTemplate({ isMac: false, currentTheme: 'system' })[0].label).toBe('File');
    });
});
