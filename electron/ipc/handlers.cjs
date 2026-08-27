// IPC handlers bridging window.api to main-process work. Each channel here has a
// matching method in the preload contextBridge (electron/preload.cjs) and an
// entry in DiffViewerApi (src/shared/types.ts). Keep the three in sync.

const path = require('node:path');
const { ipcMain, dialog } = require('electron');
const { simpleGit } = require('simple-git');
const { getRecentRepos, addRecentRepo, removeRecentRepo } = require('../settings.cjs');

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
async function isGitAvailable() {
    try {
        await simpleGit().raw(['--version']);
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
        return { path: repoPath, name: path.basename(repoPath) };
    });

    ipcMain.handle('repo:recent', () => getRecentRepos());

    ipcMain.handle('repo:remove-recent', (_event, repoPath) => removeRecentRepo(repoPath));
}

module.exports = { registerIpcHandlers, isGitAvailable };
