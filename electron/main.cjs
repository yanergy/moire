const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            // Non-negotiable process separation: the renderer never touches Node.
            // The preload bridge (window.api) is wired in here once it exists.
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
