import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron';
import path from 'node:path';
import { registerIpcHandlers, isGitAvailable, getCurrentRepoPath } from './ipc/handlers';
import { installAppMenu } from './menu';
import { initTheme, setThemePreference, registerThemeBroadcast, currentThemeState } from './theme';
import { restoreWindowState, trackWindowState } from './window-state';
import { initLogging, logError } from './logger';
import { getRecentRepos } from './settings';

// Send a menu-triggered message to the window the user is in (or the only one).
function sendToFocused(channel: string, ...args: unknown[]): void {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.send(channel, ...args);
}

async function createWindow(): Promise<void> {
    // Reopen at the last session's size/position (off-screen positions dropped).
    const { bounds, maximized } = await restoreWindowState();
    const win = new BrowserWindow({
        ...bounds,
        show: false,
        webPreferences: {
            // Non-negotiable process separation: the renderer never touches Node.
            // It reaches main only through this preload bridge (window.api).
            preload: path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // Maximize before showing so it doesn't flash at the restored size first.
    if (maximized) {
        win.maximize();
    }

    trackWindowState(win);

    // Show once the renderer can paint, so there's no blank frame or a flash at
    // the restored size before maximizing.
    win.once('ready-to-show', () => win.show());

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
    }
}

app.whenReady().then(async () => {
    // First, so anything below (and any crash) lands in the log under userData.
    const logPath = initLogging(app.getPath('userData'));

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
        logError('startup', 'Git binary not found on PATH; quitting.');
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
    await initTheme();
    registerThemeBroadcast();

    // Rebuilt whenever the recent-repos list changes, so the File → Open Recent
    // submenu stays current. Reads the live theme so the right radio stays checked.
    const buildMenu = async () => {
        installAppMenu({
            currentTheme: currentThemeState().preference,
            onSelectTheme: (preference) => setThemePreference(preference),
            // The store owns the git re-read / the open flow, so these items just
            // poke the focused window; the renderer acts on the message.
            onRefresh: () => sendToFocused('menu:refresh'),
            onOpenRepo: () => sendToFocused('menu:open-repo'),
            onOpenRecent: (repoPath) => sendToFocused('menu:open-recent', repoPath),
            // Help → Open Log File opens the log in the OS default text viewer.
            onOpenLog: () => void shell.openPath(logPath),
            recentRepos: await getRecentRepos(),
            activeRepo: getCurrentRepoPath(),
        });
    };

    registerIpcHandlers({ onRecentsChanged: () => void buildMenu() });
    await buildMenu();
    await createWindow();
});

// macOS keeps the app running after its last window is closed (see
// window-all-closed below), so reopening from the dock or the app switcher must
// recreate a window. Without this, closing the window is a dead end: the app
// stays in the dock but can never show a window again. The guard avoids a second
// window on the launch-time 'activate'.
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
