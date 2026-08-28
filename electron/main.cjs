const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const path = require('node:path');
const { registerIpcHandlers, isGitAvailable } = require('./ipc/handlers.cjs');
const { installAppMenu } = require('./menu.cjs');
const { initTheme, setThemePreference, registerThemeBroadcast } = require('./theme.cjs');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            // Non-negotiable process separation: the renderer never touches Node.
            // It reaches main only through this preload bridge (window.api).
            preload: path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
    }
}

app.whenReady().then(async () => {
    // A packaged build gets its icon from the app bundle (build/icon.icns, picked
    // up by electron-builder). In dev there is no bundle, so the dock would show
    // the generic Electron icon; set it explicitly from the same source PNG.
    if (!app.isPackaged && process.platform === 'darwin') {
        const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png'));
        if (!icon.isEmpty()) app.dock?.setIcon(icon);
    }

    // Git is a hard dependency: without it there is nothing to diff. Gate launch
    // on it, show a native error box (the renderer is not up yet), and quit.
    if (!(await isGitAvailable())) {
        dialog.showErrorBox(
            'Git is required',
            'Moiré could not find Git on your system.\n\nInstall Git, then relaunch the app.'
        );
        app.quit();
        return;
    }

    // Seed nativeTheme from the persisted preference, then broadcast resolved
    // theme changes to windows. registerThemeBroadcast runs after initTheme so
    // the initial seed doesn't fire a pointless broadcast (no window exists yet).
    const themePreference = await initTheme();
    registerThemeBroadcast();

    registerIpcHandlers();
    installAppMenu(themePreference, (preference) => setThemePreference(preference));
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
