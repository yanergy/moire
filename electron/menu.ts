// The native application menu (File / Edit / View / Window). Electron would
// synthesize a default menu on its own; we build our own so the View menu can
// carry a "Theme" submenu (System / Light / Dark). Picking an item sets the
// preference in the main process (electron/theme.ts → nativeTheme), which then
// pushes the resolved theme to the renderer over the preload bridge.

import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { CodeStyle, ThemePreference } from './settings';

interface ThemeOption {
    label: string;
    preference: ThemePreference;
}

export const THEME_OPTIONS: ThemeOption[] = [
    { label: 'System', preference: 'system' },
    { label: 'Light', preference: 'light' },
    { label: 'Dark', preference: 'dark' },
];

interface CodeStyleOption {
    label: string;
    style: CodeStyle;
}

export const CODE_STYLE_OPTIONS: CodeStyleOption[] = [
    { label: 'GitHub', style: 'github' },
    { label: 'VS Code', style: 'vscode' },
];

export interface MenuOptions {
    isMac: boolean;
    currentTheme: ThemePreference;
    onSelectTheme: (preference: ThemePreference) => void;
    // The diff-color palette radio group. Optional so callers that don't care
    // (and the menu tests) fall back to the 'github' default.
    currentCodeStyle?: CodeStyle;
    onSelectCodeStyle?: (style: CodeStyle) => void;
    onRefresh: () => void;
    onOpenLog?: () => void;
    onOpenRepo?: () => void;
    onOpenRecent?: (repoPath: string) => void;
    recentRepos?: string[];
    activeRepo?: string | null;
    // The review-complete flourishes. Left intentionally low-key: a plain
    // "Flourishes" checkbox, checked when on, that gives nothing away about what it
    // actually gates.
    flourishes?: boolean;
    onToggleFlourishes?: (enabled: boolean) => void;
}

// The trailing path segment, for a readable "Open Recent" label (the full path
// stays available on hover as the item's toolTip). Duplicated from the renderer's
// `repoLabel` in src/lib/repo-path.ts: the strict process split means the main
// process cannot import from src/, so this side keeps its own copy in sync.
function repoLabel(repoPath: string): string {
    const parts = repoPath.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || repoPath;
}

// Pure builder so the menu shape (the Theme radio group, the recent list) can be
// unit-tested without a running Electron instance. `currentTheme` marks the
// checked theme; `onSelectTheme(preference)`, `onRefresh`, and `onOpenLog` back
// the View/Help items; `onOpenRepo` and `onOpenRecent(path)` back the File menu,
// whose "Open Recent" submenu is built from `recentRepos` (most-recent-first).
export function buildMenuTemplate({
    isMac,
    currentTheme,
    onSelectTheme,
    currentCodeStyle = 'github',
    onSelectCodeStyle,
    onRefresh,
    onOpenLog,
    onOpenRepo,
    onOpenRecent,
    recentRepos = [],
    activeRepo = null,
    flourishes = true,
    onToggleFlourishes,
}: MenuOptions): MenuItemConstructorOptions[] {
    const recentItems: MenuItemConstructorOptions[] = recentRepos.length
        ? recentRepos.map((repoPath): MenuItemConstructorOptions => ({
              label: repoLabel(repoPath),
              toolTip: repoPath,
              // A checkmark marks the repo that is currently open.
              type: 'checkbox',
              checked: repoPath === activeRepo,
              click: () => onOpenRecent?.(repoPath),
          }))
        : [{ label: 'No recent repositories', enabled: false }];

    const appMenu: MenuItemConstructorOptions[] = isMac ? [{ role: 'appMenu' }] : [];

    return [
        ...appMenu,
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Repository…',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => onOpenRepo?.(),
                },
                { label: 'Open Recent', submenu: recentItems },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                // Re-reads the repo for the current range (branches, changed files,
                // open pair). Takes Cmd/Ctrl+R since a git re-scan is the refresh a
                // user of this app wants; the full-page reload stays on Force Reload.
                { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => onRefresh() },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                { type: 'separator' },
                {
                    label: 'Theme',
                    submenu: THEME_OPTIONS.map(
                        ({ label, preference }): MenuItemConstructorOptions => ({
                            label,
                            type: 'radio',
                            checked: currentTheme === preference,
                            click: () => onSelectTheme(preference),
                        })
                    ),
                },
                {
                    label: 'Code Style',
                    submenu: CODE_STYLE_OPTIONS.map(
                        ({ label, style }): MenuItemConstructorOptions => ({
                            label,
                            type: 'radio',
                            checked: currentCodeStyle === style,
                            click: () => onSelectCodeStyle?.(style),
                        })
                    ),
                },
                { type: 'separator' },
                // Unobtrusive toggle for the review-complete flourishes; the label
                // deliberately doesn't spell out what it does.
                {
                    label: 'Flourishes',
                    type: 'checkbox',
                    checked: flourishes,
                    click: (item) => onToggleFlourishes?.(item.checked),
                },
            ],
        },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [{ label: 'Open Log File', click: () => onOpenLog?.() }],
        },
    ];
}

export function installAppMenu(options: Omit<MenuOptions, 'isMac'>): void {
    const template = buildMenuTemplate({ isMac: process.platform === 'darwin', ...options });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
