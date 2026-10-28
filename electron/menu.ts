// The native application menu (File / Edit / View / Window). Electron would
// synthesize a default menu on its own; we build our own so the View menu can
// carry a "Theme" submenu (System / Light / Dark). Picking an item sets the
// preference in the main process (electron/theme.ts → nativeTheme), which then
// pushes the resolved theme to the renderer over the preload bridge.

import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { CodeStyle, DiffLayout, NotificationPrefs, ThemePreference } from './settings';
import type { GhAccount } from './github/gh';
import type { DashboardEventKind } from './github/notifications';

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

interface NotificationEventOption {
    label: string;
    kind: DashboardEventKind;
}

export const NOTIFICATION_EVENT_OPTIONS: NotificationEventOption[] = [
    { label: 'Review Requested', kind: 'review-requested' },
    { label: 'Changes Requested', kind: 'changes-requested' },
    { label: 'Closed Without Merge', kind: 'closed-unmerged' },
    { label: 'Checks Failed', kind: 'checks-failed' },
    { label: 'Approved', kind: 'approved' },
    { label: 'Merge Conflict', kind: 'merge-conflict' },
    { label: 'Ready to Merge', kind: 'ready-to-merge' },
    { label: 'Merged by Someone Else', kind: 'merged-by-other' },
];

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
    // The authenticated gh accounts, for the Git menu's account switcher. That
    // menu appears only when at least one account is present (gh is connected);
    // choosing a non-active one switches through onSelectAccount.
    accounts?: GhAccount[];
    onSelectAccount?: (login: string, host: string) => void;
    // The Git → Notifications submenu: the master switch, one checkbox per event
    // kind and the dock badge. The per event and badge items are disabled while
    // the master switch is off. Omitted prefs hide the submenu.
    notificationPrefs?: NotificationPrefs;
    onToggleNotifications?: (enabled: boolean) => void;
    onToggleNotificationEvent?: (kind: DashboardEventKind, enabled: boolean) => void;
    onToggleDockBadge?: (enabled: boolean) => void;
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
    accounts = [],
    onSelectAccount,
    notificationPrefs,
    onToggleNotifications,
    onToggleNotificationEvent,
    onToggleDockBadge,
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

    // GitHub notifications for the open repository. Lives in the Git menu, since
    // it needs a connected gh just like the account switcher.
    const notificationItems: MenuItemConstructorOptions[] = notificationPrefs
        ? [
              { type: 'separator' },
              {
                  label: 'Notifications',
                  submenu: [
                      {
                          label: 'Enable Notifications',
                          type: 'checkbox',
                          checked: notificationPrefs.enabled,
                          click: (item) => onToggleNotifications?.(item.checked),
                      },
                      { type: 'separator' },
                      ...NOTIFICATION_EVENT_OPTIONS.map(
                          ({ label, kind }): MenuItemConstructorOptions => ({
                              label,
                              type: 'checkbox',
                              checked: notificationPrefs.events[kind],
                              enabled: notificationPrefs.enabled,
                              click: (item) => onToggleNotificationEvent?.(kind, item.checked),
                          })
                      ),
                      { type: 'separator' },
                      {
                          label: 'Dock Badge',
                          type: 'checkbox',
                          checked: notificationPrefs.dockBadge,
                          enabled: notificationPrefs.enabled,
                          click: (item) => onToggleDockBadge?.(item.checked),
                      },
                  ],
              },
          ]
        : [];

    // The Git menu carries the gh account switcher and appears only when gh is
    // connected with at least one account. Each account is a radio item; the
    // active one is checked, and choosing another switches gh's active account.
    const gitMenu: MenuItemConstructorOptions[] = accounts.length
        ? [
              {
                  label: 'Git',
                  submenu: [
                      { label: 'Accounts', enabled: false },
                      { type: 'separator' },
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
                      ...notificationItems,
                  ],
              },
          ]
        : [];

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
        ...gitMenu,
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
