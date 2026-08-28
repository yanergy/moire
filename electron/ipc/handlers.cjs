// IPC handlers bridging window.api to main-process work. Each channel here has a
// matching method in the preload contextBridge (electron/preload.cjs) and an
// entry in MoireApi (src/shared/types.ts). Keep the three in sync.

const path = require('node:path');
const { ipcMain, dialog } = require('electron');
const { simpleGit } = require('simple-git');
const { GitService } = require('../git/GitService.cjs');
const {
    getRecentRepos,
    addRecentRepo,
    removeRecentRepo,
    getBranchSelection,
    setBranchSelection,
} = require('../settings.cjs');
const { currentThemeState } = require('../theme.cjs');

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

function registerIpcHandlers() {
    ipcMain.handle('dialog:open-repo', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Open repository',
            properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    });

    ipcMain.handle('repo:open', async (_event, repoPath) => {
        if (!(await isGitRepo(repoPath))) {
            dialog.showErrorBox(
                'Not a Git repository',
                `This folder is not the root of a Git repository:\n\n${repoPath}`
            );
            return null;
        }

        await addRecentRepo(repoPath);
        currentRepo = new GitService(repoPath);
        return { path: repoPath, name: path.basename(repoPath) };
    });

    ipcMain.handle('repo:recent', () => getRecentRepos());

    ipcMain.handle('repo:remove-recent', (_event, repoPath) => removeRecentRepo(repoPath));

    // Per-repo base/head persistence, so reopening a repo restores its last
    // compared range (validated against the live branch list in the renderer).
    ipcMain.handle('settings:branch-selection:get', (_event, repoPath) =>
        getBranchSelection(repoPath)
    );

    ipcMain.handle('settings:branch-selection:set', (_event, repoPath, base, head) =>
        setBranchSelection(repoPath, base, head)
    );

    // Theme is owned by nativeTheme in the main process; the renderer reads the
    // current resolved state on launch, then stays in sync via 'theme:changed'.
    ipcMain.handle('theme:get', () => currentThemeState());

    // Git-backed channels. Each operates on the currently open repo and has a
    // matching method in the preload bridge and an entry in MoireApi.
    ipcMain.handle('git:branches', () => requireRepo().branches());

    ipcMain.handle('git:changed-files', (_event, base, head, mode) =>
        requireRepo().changedFiles(base, head, mode)
    );

    ipcMain.handle('git:file-pair', (_event, base, head, filePath) =>
        requireRepo().filePair(base, head, filePath)
    );
}

module.exports = { registerIpcHandlers, isGitAvailable };
