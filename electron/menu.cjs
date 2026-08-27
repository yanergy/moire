// The native application menu (File / Edit / View / Window). Electron would
// synthesize a default menu on its own; we build our own so the View menu can
// carry a "Toggle Theme" command that reaches the renderer over the preload
// bridge (window.api.onToggleTheme). Channel name matches electron/preload.cjs.

const { Menu, BrowserWindow } = require('electron');

const THEME_TOGGLE_CHANNEL = 'theme:toggle';

// Pure builder so the menu shape (and the Toggle Theme item) can be unit-tested
// without a running Electron instance. `onToggleTheme` is injected as the item's
// click handler.
function buildMenuTemplate({ isMac, onToggleTheme }) {
    return [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
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
                    label: 'Toggle Theme',
                    accelerator: 'CmdOrCtrl+Shift+L',
                    click: onToggleTheme,
                },
            ],
        },
        { role: 'windowMenu' },
    ];
}

// Sends the toggle to the window that owned the menu command, falling back to
// the focused window when the accelerator fires with no window argument.
function sendThemeToggle(_menuItem, browserWindow) {
    const target = browserWindow ?? BrowserWindow.getFocusedWindow();
    target?.webContents?.send(THEME_TOGGLE_CHANNEL);
}

function installAppMenu() {
    const template = buildMenuTemplate({
        isMac: process.platform === 'darwin',
        onToggleTheme: sendThemeToggle,
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installAppMenu, buildMenuTemplate, sendThemeToggle, THEME_TOGGLE_CHANNEL };
