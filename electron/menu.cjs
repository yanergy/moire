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

// Pure builder so the menu shape (and the Theme radio group) can be unit-tested
// without a running Electron instance. `currentTheme` marks the checked item,
// `onSelectTheme(preference)` is each theme item's click handler, and `onRefresh`
// backs the View → Refresh item.
function buildMenuTemplate({ isMac, currentTheme, onSelectTheme, onRefresh }) {
    return [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        { role: 'fileMenu' },
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
    ];
}

function installAppMenu(currentTheme, onSelectTheme, onRefresh) {
    const template = buildMenuTemplate({
        isMac: process.platform === 'darwin',
        currentTheme,
        onSelectTheme,
        onRefresh,
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installAppMenu, buildMenuTemplate, THEME_OPTIONS };
