// IPC handlers bridging window.api to main-process work. Each channel here has a
// matching method in the preload contextBridge (electron/preload.cjs) and an
// entry in MoireApi (src/shared/types.ts). Keep the three in sync.

const path = require('node:path');
const { ipcMain, dialog } = require('electron');
const { simpleGit } = require('simple-git');
const { GitService } = require('../git/GitService.cjs');
const { watchRepo } = require('../watcher/RepoWatcher.cjs');
const {
    getRecentRepos,
    addRecentRepo,
    removeRecentRepo,
    getBranchSelection,
    setBranchSelection,
} = require('../settings.cjs');
const { currentThemeState } = require('../theme.cjs');
const { logError } = require('../logger.cjs');

// ipcMain.handle that logs a handler rejection before it propagates. A git
// operation that fails (a bad ref, a repo that moved) otherwise surfaces only as
// a rejected promise the renderer swallows, leaving no trace; this records it.
function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            return await fn(event, ...args);
        } catch (error) {
            logError(`ipc ${channel}`, error);
            throw error;
        }
    });
}

// The app compares one repository at a time (multi-repo is a non-goal), so the
// git-backed channels operate on whichever repo was opened last. `repo:open`
// sets this on a successful open.
let currentRepo = null;

function requireRepo() {
    if (!currentRepo) {
        throw new Error('No repository is open.');
    }

    return currentRepo;
}

// The open repo's path (null when none), so the menu can mark it active in the
// Open Recent list.
function getCurrentRepoPath() {
    return currentRepo?.repoPath ?? null;
}

async function isGitRepo(repoPath) {
    try {
        return await simpleGit(repoPath).checkIsRepo('root');
    } catch {
        // Non-repo paths make checkIsRepo resolve false, but a missing path or an
        // absent git binary throws; treat every failure as "not a repo" here.
        return false;
    }
}

// Confirms a git binary is on PATH by running `git --version` (which needs no
// repo). The app can do nothing without git, so main runs this as a launch gate.
// The runner is injectable so the probe is unit-testable without spawning git.
async function isGitAvailable(git = simpleGit()) {
    try {
        await git.raw(['--version']);
        return true;
    } catch {
        return false;
    }
}

// onRecentsChanged fires after the recent-repos list changes (an open or a
// removal) so main can rebuild the app menu's "Open Recent" submenu.
function registerIpcHandlers({ onRecentsChanged } = {}) {
    handle('dialog:open-repo', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Open repository',
            properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    });

    handle('repo:open', async (_event, repoPath) => {
        if (!(await isGitRepo(repoPath))) {
            dialog.showErrorBox(
                'Not a Git repository',
                `This folder is not the root of a Git repository:\n\n${repoPath}`
            );
            return null;
        }

        await addRecentRepo(repoPath);
        currentRepo = new GitService(repoPath);
        // Watch the newly opened repo so the diff auto-refreshes; this replaces
        // any watcher from a previously opened repo.
        watchRepo(repoPath);
        // After currentRepo is set, so the rebuilt menu can mark it active.
        onRecentsChanged?.();
        return { path: repoPath, name: path.basename(repoPath) };
    });

    handle('repo:recent', () => getRecentRepos());

    handle('repo:remove-recent', async (_event, repoPath) => {
        const next = await removeRecentRepo(repoPath);
        onRecentsChanged?.();
        return next;
    });

    // Per-repo base/head persistence, so reopening a repo restores its last
    // compared range (validated against the live branch list in the renderer).
    handle('settings:branch-selection:get', (_event, repoPath) => getBranchSelection(repoPath));

    handle('settings:branch-selection:set', (_event, repoPath, base, head) =>
        setBranchSelection(repoPath, base, head)
    );

    // Theme is owned by nativeTheme in the main process; the renderer reads the
    // current resolved state on launch, then stays in sync via 'theme:changed'.
    handle('theme:get', () => currentThemeState());

    // Git-backed channels. Each operates on the currently open repo and has a
    // matching method in the preload bridge and an entry in MoireApi.
    handle('git:branches', () => requireRepo().branches());

    handle('git:changed-files', (_event, base, head, mode) =>
        requireRepo().changedFiles(base, head, mode)
    );

    handle('git:file-pair', (_event, base, head, filePath) =>
        requireRepo().filePair(base, head, filePath)
    );
}

module.exports = { registerIpcHandlers, isGitAvailable, getCurrentRepoPath };
