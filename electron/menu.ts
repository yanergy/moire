// The native application menu (File / Edit / View / Window). Electron would
// synthesize a default menu on its own; we build our own so the View menu can
// carry a "Theme" submenu (System / Light / Dark). Picking an item sets the
// preference in the main process (electron/theme.ts → nativeTheme), which then
// pushes the resolved theme to the renderer over the preload bridge.

import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { CodeStyle, DiffLayout, ThemePreference } from './settings';
import type { GhAccount } from './github/gh';
import { WORKING_TREE } from './git/GitService';
import type { BranchInfo, RepoBranchSettings } from '../src/shared/types';

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

interface DiffLayoutOption {
    label: string;
    layout: DiffLayout;
}

export const DIFF_LAYOUT_OPTIONS: DiffLayoutOption[] = [
    { label: 'Single File', layout: 'single' },
    { label: 'All Files', layout: 'stacked' },
];

// One Git → Comparison Presets item: the base and head it selects, and whether
// both refs exist, so a preset that would compare against nothing is disabled.
export interface ComparisonPreset {
    label: string;
    base: string;
    head: string;
    enabled: boolean;
}

// Restated from DEVELOPMENT_BRANCH_CANDIDATES in src/lib/branch-recommendations.ts
// (the process split forbids importing it); keep the two in sync.
const DEVELOPMENT_BRANCH_CANDIDATES = [
    'origin/development',
    'origin/develop',
    'origin/dev',
    'development',
    'develop',
    'dev',
];

// The repo's development branch: the one picked on the Settings page while it
// exists, otherwise the first conventional name present. Null when the Settings
// page set it to None or nothing matches.
export function developmentBranch(
    branches: BranchInfo[],
    settings: RepoBranchSettings = {}
): string | null {
    if (settings.development === null) {
        return null;
    }

    const exists = (name: string) => branches.some((b) => b.name === name);
    if (settings.development && exists(settings.development)) {
        return settings.development;
    }

    return DEVELOPMENT_BRANCH_CANDIDATES.find(exists) ?? null;
}

// The hardcoded comparison presets for the open repository's branches. With no
// current branch (detached HEAD, or no repository) both are disabled, and the
// development one also when the repo has no development branch.
export function comparisonPresets(
    branches: BranchInfo[],
    settings: RepoBranchSettings = {}
): ComparisonPreset[] {
    const current = branches.find((b) => b.kind === 'local' && b.isCurrent)?.name;
    const hasRemote = (name: string) =>
        branches.some((b) => b.kind === 'remote' && b.name === name);
    const development = developmentBranch(branches, settings);
    const upstream = current ? `origin/${current}` : '';

    return [
        {
            label: 'Compare Current Branch to Development',
            base: development ?? '',
            head: current ?? '',
            enabled: !!current && !!development,
        },
        {
            label: 'Compare Working Tree to Origin',
            base: upstream,
            head: WORKING_TREE,
            enabled: !!current && hasRemote(upstream),
        },
    ];
}

export interface MenuOptions {
    isMac: boolean;
    currentTheme: ThemePreference;
    onSelectTheme: (preference: ThemePreference) => void;
    // The diff-color palette radio group. Optional so callers that don't care
    // (and the menu tests) fall back to the 'github' default.
    currentCodeStyle?: CodeStyle;
    onSelectCodeStyle?: (style: CodeStyle) => void;
    // The "Diff Layout" radio group: the persisted layout that marks the checked
    // radio, and the select handler. Optional so callers that don't care (and the
    // menu tests) fall back to the 'single' default.
    currentDiffLayout?: DiffLayout;
    onSelectDiffLayout?: (layout: DiffLayout) => void;
    // The "Open Files In" radio group: the editors detected on this machine, the
    // stored preference ('auto' or an editor id) that marks the checked radio, and
    // the select handler. Optional so callers that don't care fall back to 'auto'
    // with no editors listed.
    editors?: { id: string; label: string }[];
    currentEditor?: string;
    onSelectEditor?: (editor: string) => void;
    onRefresh: () => void;
    // View → Dashboard, enabled only while a repository is open (`activeRepo`).
    onShowDashboard?: () => void;
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
    // The Git → Comparison Presets items (see comparisonPresets); choosing an
    // enabled one reports its base and head through onSelectPreset.
    comparisonPresets?: ComparisonPreset[];
    onSelectPreset?: (base: string, head: string) => void;
    // The authenticated gh accounts, for the Git menu's account switcher, shown
    // only when at least one account is present (gh is connected); choosing a
    // non-active one switches through onSelectAccount.
    accounts?: GhAccount[];
    onSelectAccount?: (login: string, host: string) => void;
    // Settings… (Cmd/Ctrl+,): in the app menu on macOS, the File menu elsewhere.
    onOpenSettings?: () => void;
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
    currentDiffLayout = 'single',
    onSelectDiffLayout,
    editors = [],
    currentEditor = 'auto',
    onSelectEditor,
    onRefresh,
    onShowDashboard,
    onOpenLog,
    onOpenRepo,
    onOpenRecent,
    recentRepos = [],
    activeRepo = null,
    flourishes = true,
    onToggleFlourishes,
    comparisonPresets: presets = comparisonPresets([]),
    onSelectPreset,
    accounts = [],
    onSelectAccount,
    onOpenSettings,
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

    const settingsItem: MenuItemConstructorOptions = {
        label: 'Settings…',
        accelerator: 'CmdOrCtrl+,',
        click: () => onOpenSettings?.(),
    };

    // The standard macOS app menu, spelled out so it can carry Settings… where
    // macOS users look for it.
    const appMenu: MenuItemConstructorOptions[] = isMac
        ? [
              {
                  role: 'appMenu',
                  submenu: [
                      { role: 'about' },
                      { type: 'separator' },
                      settingsItem,
                      { type: 'separator' },
                      { role: 'services' },
                      { type: 'separator' },
                      { role: 'hide' },
                      { role: 'hideOthers' },
                      { role: 'unhide' },
                      { type: 'separator' },
                      { role: 'quit' },
                  ],
              },
          ]
        : [];

    // The gh account switcher, only when gh is connected with at least one
    // account. Each account is a radio item; the active one is
    // checked, and choosing another switches gh's active account.
    const accountItems: MenuItemConstructorOptions[] = accounts.length
        ? [
              { type: 'separator' },
              { label: 'Accounts', enabled: false },
              ...accounts.map((account): MenuItemConstructorOptions => ({
                  label: account.login,
                  type: 'radio',
                  checked: account.active,
                  click: () => {
                      if (!account.active) {
                          onSelectAccount?.(account.login, account.host);
                      }
                  },
              })),
          ]
        : [];

    // Always shown: the presets need only local git.
    const gitMenu: MenuItemConstructorOptions = {
        label: 'Git',
        submenu: [
            // A flat list under a disabled header, like the accounts below.
            { label: 'Comparison Presets', enabled: false },
            ...presets.map(({ label, base, head, enabled }): MenuItemConstructorOptions => ({
                label,
                enabled,
                click: () => onSelectPreset?.(base, head),
            })),
            ...accountItems,
        ],
    };

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
                ...(isMac ? [] : [{ type: 'separator' } as const, settingsItem]),
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
                // The GitHub dashboard is always about the open repository.
                {
                    label: 'Dashboard',
                    accelerator: 'CmdOrCtrl+Shift+D',
                    enabled: !!activeRepo,
                    click: () => onShowDashboard?.(),
                },
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
                // How the review area lays out diffs: one file at a time, or a
                // GitHub-style continuous list of every changed file.
                {
                    label: 'Diff Layout',
                    submenu: DIFF_LAYOUT_OPTIONS.map(
                        ({ label, layout }): MenuItemConstructorOptions => ({
                            label,
                            type: 'radio',
                            checked: currentDiffLayout === layout,
                            click: () => onSelectDiffLayout?.(layout),
                        })
                    ),
                },
                // Which editor a file opens in from the diff header: the OS default
                // app, or a detected editor, in catalog order. One contiguous radio
                // group (no separator between the default and the editors) so
                // Electron's native radio behavior unchecks the previous choice when
                // a new one is picked. A separator would split the group and leave
                // both the old and new selection checked.
                {
                    label: 'Open Files In',
                    submenu: [
                        {
                            label: 'System Default',
                            type: 'radio',
                            checked: currentEditor === 'auto',
                            click: () => onSelectEditor?.('auto'),
                        },
                        ...editors.map(({ id, label }): MenuItemConstructorOptions => ({
                            label,
                            type: 'radio',
                            checked: currentEditor === id,
                            click: () => onSelectEditor?.(id),
                        })),
                    ],
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
        gitMenu,
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
