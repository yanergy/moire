import {
    app,
    BrowserWindow,
    dialog,
    nativeImage,
    Notification,
    powerMonitor,
    shell,
} from 'electron';
import path from 'node:path';
import { registerIpcHandlers, isGitAvailable, getCurrentRepoPath } from './ipc/handlers';
import { getAccounts, switchAccount } from './github/gh';
import { fetchSnapshot, getRepoIdentity } from './github/notifications';
import { Notifier, type DashboardState, type NotificationContent } from './notifier';
import { stopWatchingRepo } from './watcher/RepoWatcher';
import { installAppMenu } from './menu';
import { initTheme, setThemePreference, registerThemeBroadcast, currentThemeState } from './theme';
import { restoreWindowState, trackWindowState } from './window-state';
import { initLogging, logError, logInfo } from './logger';
import { repairPath } from './shell-path';
import {
    getRecentRepos,
    getFlourishes,
    setFlourishes,
    getCodeStyle,
    setCodeStyle,
    getEditorPreference,
    setEditorPreference,
    getDiffLayout,
    setDiffLayout,
    getNotificationPrefs,
    setNotificationPrefs,
    getNotifierState,
    setNotifierState,
} from './settings';
import { detectEditors } from './editors';
import { promptUpdateIfAvailable } from './updates';

// Send a menu-triggered message to the window the user is in (or the only one).
function sendToFocused(channel: string, ...args: unknown[]): void {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.send(channel, ...args);
}

// Native notifications are garbage collected once nothing references them, which
// silently drops their click handler. Hold each one until it is clicked or closed.
const liveNotifications = new Set<Notification>();

function showNotification(content: NotificationContent, onClick: () => void): void {
    if (!Notification.isSupported()) {
        return;
    }

    const notification = new Notification(content);
    liveNotifications.add(notification);
    notification.on('click', () => {
        liveNotifications.delete(notification);
        onClick();
    });
    notification.on('close', () => liveNotifications.delete(notification));
    notification.show();
}

// Bring the main window to the front, recreating it when it was closed (the app
// stays alive on macOS), for a notification click that needs the app.
async function revealWindow(): Promise<BrowserWindow> {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
        const created = await createWindow();
        // A fresh renderer cannot receive messages until it has loaded.
        await new Promise<void>((resolve) => created.webContents.once('did-finish-load', resolve));
        return created;
    }

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
}

// Switch the main window to the dashboard (the summary notification and View →
// Dashboard).
async function showDashboard(): Promise<void> {
    const win = await revealWindow();
    win.webContents.send('dashboard:show');
}

// Polls GitHub for the open repository. See notifier.ts and
// documentation/github-notifications-plan.md.
const notifier = new Notifier({
    getRepoIdentity: (repoPath) => getRepoIdentity(repoPath),
    fetchSnapshot: (repoPath, repo, now) => fetchSnapshot(repoPath, repo, now),
    getPrefs: getNotificationPrefs,
    loadState: getNotifierState,
    saveState: setNotifierState,
    notify: showNotification,
    setBadge: (count) => app.dock?.setBadge(count > 0 ? String(count) : ''),
    // The renderer opens it in the PR view, or on GitHub when it cannot.
    onOpenPr: (pr) => {
        void revealWindow().then((win) => win.webContents.send('dashboard:open-pr', pr));
    },
    onOpenDashboard: () => void showDashboard(),
    // Keep an open dashboard current after every poll.
    onChange: () => {
        void dashboardState().then((state) => {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send('dashboard:changed', state);
            }
        });
    },
    logError,
});

async function dashboardState(): Promise<DashboardState> {
    const { showDrafts } = await getNotificationPrefs();
    return { ...notifier.getView(), showDrafts };
}

async function createWindow(): Promise<BrowserWindow> {
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

    return win;
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

    // Before anything spawns a child process: a Finder/Dock launch inherits only
    // launchd's minimal PATH, which hides Homebrew-installed tools such as `gh`.
    // See shell-path.ts. Logged because the effective PATH is the first thing to
    // check when a tool reads as missing.
    logInfo(`PATH: ${await repairPath()}`);

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
        // The gh accounts back the Git menu; an empty list (gh missing or signed
        // out) hides the menu. This is a fast local `gh auth status`, no network.
        const { accounts } = await getAccounts();
        // The editors installed on this machine seed the "Open Files In" submenu.
        const detected = await detectEditors();
        installAppMenu({
            currentTheme: currentThemeState().preference,
            onSelectTheme: (preference) => setThemePreference(preference),
            // Persist the diff palette and tell the renderer, which re-themes
            // Monaco. Electron keeps the radio checkmark in sync on click; the
            // stored value seeds it on the next menu rebuild.
            currentCodeStyle: await getCodeStyle(),
            onSelectCodeStyle: (style) => {
                void setCodeStyle(style);
                sendToFocused('code-style:changed', style);
            },
            // The diff layout (single-file vs the stacked all-files list). Persist
            // the choice and tell the renderer, which swaps the review pane. Electron
            // keeps the clicked radio checked; the stored value re-seeds it on rebuild.
            currentDiffLayout: await getDiffLayout(),
            onSelectDiffLayout: (layout) => {
                void setDiffLayout(layout);
                sendToFocused('diff-layout:changed', layout);
            },
            // The chosen editor is read by the main-process open handler, so a change
            // just persists; Electron keeps the clicked radio checked for the session,
            // and the stored value re-seeds the checkmark on the next menu rebuild.
            editors: detected.map(({ id, label }) => ({ id, label })),
            currentEditor: await getEditorPreference(),
            onSelectEditor: (editor) => void setEditorPreference(editor),
            // The store owns the git re-read / the open flow, so these items just
            // poke the focused window; the renderer acts on the message.
            onRefresh: () => sendToFocused('menu:refresh'),
            onShowDashboard: () => void showDashboard(),
            onOpenRepo: () => sendToFocused('menu:open-repo'),
            onOpenRecent: (repoPath) => sendToFocused('menu:open-recent', repoPath),
            // Help → Open Log File opens the log in the OS default text viewer.
            onOpenLog: () => void shell.openPath(logPath),
            recentRepos: await getRecentRepos(),
            activeRepo: getCurrentRepoPath(),
            flourishes: await getFlourishes(),
            // Persist the choice and tell the renderer, which gates the effects.
            onToggleFlourishes: (enabled) => {
                void setFlourishes(enabled);
                sendToFocused('flourishes:changed', enabled);
            },
            accounts,
            notificationPrefs: await getNotificationPrefs(),
            // The master switch starts or stops background polling (and clears
            // the badge); the menu is rebuilt so the per event items enable or
            // disable with it.
            onToggleNotifications: (enabled) => {
                void (async () => {
                    await setNotificationPrefs({ enabled });
                    await buildMenu();
                    await notifier.restart();
                })();
            },
            onToggleNotificationEvent: (kind, enabled) =>
                void setNotificationPrefs({ events: { [kind]: enabled } }),
            onToggleDockBadge: (enabled) => {
                void (async () => {
                    await setNotificationPrefs({ dockBadge: enabled });
                    await notifier.restart();
                })();
            },
            // Switch gh's active account, then rebuild the menu (to move the
            // checkmark) and refresh the renderer so the PR view reflects the
            // newly active account. A failure surfaces as a native error box.
            onSelectAccount: (login, host) => {
                void (async () => {
                    const result = await switchAccount(login, host);
                    if (result.status !== 'ok') {
                        dialog.showErrorBox(
                            'Could not switch account',
                            result.message || `Failed to switch to ${login}.`
                        );
                    }

                    await buildMenu();
                    sendToFocused('menu:refresh');
                    // The notifier follows the active account: re-poll, which
                    // starts a fresh baseline for the new login.
                    await notifier.restart();
                })();
            },
        });
    };

    registerIpcHandlers({
        onRecentsChanged: () => void buildMenu(),
        onRepoOpened: (repoPath) => void notifier.setRepo(repoPath),
        dashboard: {
            get: async () => {
                if (!notifier.getView().snapshot) {
                    await notifier.poll();
                }
                return dashboardState();
            },
            refresh: async () => {
                await notifier.poll();
                return dashboardState();
            },
            // The badge also follows this toggle, so restart to recount it.
            setShowDrafts: async (show) => {
                await setNotificationPrefs({ showDrafts: show });
                await notifier.restart();
                return dashboardState();
            },
        },
    });
    // Catch up right after the Mac wakes instead of waiting for the next tick.
    powerMonitor.on('resume', () => notifier.onResume());
    await buildMenu();
    await createWindow();

    // Best-effort update check against the GitHub Releases feed. Fire-and-forget
    // so it never delays the window: it pops a native dialog when a newer release
    // exists and stays silent when the build is current or the check fails.
    void promptUpdateIfAvailable();
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

// Close the repo watcher's file handles on the way out. It is otherwise only ever
// replaced when a new repo opens, so a clean quit would leave the last one open
// (the OS reclaims it anyway, but the teardown path should be complete).
app.on('before-quit', () => {
    stopWatchingRepo();
    notifier.stop();
});
