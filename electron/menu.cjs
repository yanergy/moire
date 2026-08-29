// The native application menu (File / Edit / View / Window). Electron would
// synthesize a default menu on its own; we build our own so the View menu can
// carry a "Theme" submenu (System / Light / Dark). Picking an item sets the
// preference in the main process (electron/theme.cjs → nativeTheme), which then
// pushes the resolved theme to the renderer over the preload bridge.

const { Menu } = require('electron');

const THEME_OPTIONS = [
    { label: 'System', preference: 'system' },
    { label: 'Light', preference: 'light' },
    { label: 'Dark', preference: 'dark' },
];

// The trailing path segment, for a readable "Open Recent" label (the full path
// stays available on hover as the item's toolTip).
function repoLabel(repoPath) {
    const parts = repoPath.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || repoPath;
}

// Pure builder so the menu shape (the Theme radio group, the recent list) can be
// unit-tested without a running Electron instance. `currentTheme` marks the
// checked theme; `onSelectTheme(preference)`, `onRefresh`, and `onOpenLog` back
// the View/Help items; `onOpenRepo` and `onOpenRecent(path)` back the File menu,
// whose "Open Recent" submenu is built from `recentRepos` (most-recent-first).
function buildMenuTemplate({
    isMac,
    currentTheme,
    onSelectTheme,
    onRefresh,
    onOpenLog,
    onOpenRepo,
    onOpenRecent,
    recentRepos = [],
    activeRepo = null,
}) {
    const recentItems = recentRepos.length
        ? recentRepos.map((repoPath) => ({
              label: repoLabel(repoPath),
              toolTip: repoPath,
              // A checkmark marks the repo that is currently open.
              type: 'checkbox',
              checked: repoPath === activeRepo,
              click: () => onOpenRecent?.(repoPath),
          }))
        : [{ label: 'No recent repositories', enabled: false }];

    return [
        ...(isMac ? [{ role: 'appMenu' }] : []),
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
                    submenu: THEME_OPTIONS.map(({ label, preference }) => ({
                        label,
                        type: 'radio',
                        checked: currentTheme === preference,
                        click: () => onSelectTheme(preference),
                    })),
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

function installAppMenu(options) {
    const template = buildMenuTemplate({ isMac: process.platform === 'darwin', ...options });
    Menu.setApplicationMenu(
        Menu.buildFromTemplate(
            /** @type {import('electron').MenuItemConstructorOptions[]} */ (template)
        )
    );
}

module.exports = { installAppMenu, buildMenuTemplate, THEME_OPTIONS };
