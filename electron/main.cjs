const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { registerIpcHandlers, isGitAvailable } = require('./ipc/handlers.cjs');

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

    registerIpcHandlers();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
