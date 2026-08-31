// IPC handlers bridging window.api to main-process work. Each channel here has a
// matching method in the preload contextBridge (electron/preload.ts) and an
// entry in MoireApi (src/shared/types.ts). Keep the three in sync.

import path from 'node:path';
import { ipcMain, dialog } from 'electron';
import { simpleGit, CheckRepoActions } from 'simple-git';
import { GitService } from '../git/GitService';
import { watchRepo } from '../watcher/RepoWatcher';
import {
    getRecentRepos,
    addRecentRepo,
    removeRecentRepo,
    getBranchSelection,
    setBranchSelection,
} from '../settings';
import { currentThemeState } from '../theme';
import { logError } from '../logger';

type CompareMode = 'merge-base' | 'direct';

// ipcMain.handle that logs a handler rejection before it propagates. A git
// operation that fails (a bad ref, a repo that moved) otherwise surfaces only as
// a rejected promise the renderer swallows, leaving no trace; this records it.
// The IPC event is unused by every handler, so it is dropped from the callback.
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
    ipcMain.handle(channel, async (_event, ...args) => {
        try {
            return await fn(...(args as A));
        } catch (error) {
            logError(`ipc ${channel}`, error);
            throw error;
        }
    });
}

// The app compares one repository at a time (multi-repo is a non-goal), so the
// git-backed channels operate on whichever repo was opened last. `repo:open`
// sets this on a successful open.
let currentRepo: GitService | null = null;

function requireRepo(): GitService {
    if (!currentRepo) {
        throw new Error('No repository is open.');
    }

    return currentRepo;
}

// The open repo's path (null when none), so the menu can mark it active in the
// Open Recent list.
function getCurrentRepoPath(): string | null {
    return currentRepo?.repoPath ?? null;
}

async function isGitRepo(repoPath: string): Promise<boolean> {
    try {
        // IS_REPO_ROOT is the string 'root'; using the enum keeps the type check happy.
        return await simpleGit(repoPath).checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
    } catch {
        // Non-repo paths make checkIsRepo resolve false, but a missing path or an
        // absent git binary throws; treat every failure as "not a repo" here.
        return false;
    }
}

// Confirms a git binary is on PATH by running `git --version` (which needs no
// repo). The app can do nothing without git, so main runs this as a launch gate.
// The runner is injectable so the probe is unit-testable without spawning git.
async function isGitAvailable(
    git: { raw: (args: string[]) => Promise<unknown> } = simpleGit()
): Promise<boolean> {
    try {
        await git.raw(['--version']);
        return true;
    } catch {
        return false;
    }
}

// onRecentsChanged fires after the recent-repos list changes (an open or a
// removal) so main can rebuild the app menu's "Open Recent" submenu.
function registerIpcHandlers({ onRecentsChanged }: { onRecentsChanged?: () => void } = {}): void {
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

    handle('repo:open', async (repoPath: string) => {
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

    handle('repo:remove-recent', async (repoPath: string) => {
        const next = await removeRecentRepo(repoPath);
        onRecentsChanged?.();
        return next;
    });

    // Per-repo base/head persistence, so reopening a repo restores its last
    // compared range (validated against the live branch list in the renderer).
    handle('settings:branch-selection:get', (repoPath: string) => getBranchSelection(repoPath));

    handle('settings:branch-selection:set', (repoPath: string, base: string, head: string) =>
        setBranchSelection(repoPath, base, head)
    );

    // Theme is owned by nativeTheme in the main process; the renderer reads the
    // current resolved state on launch, then stays in sync via 'theme:changed'.
    handle('theme:get', () => currentThemeState());

    // Git-backed channels. Each operates on the currently open repo and has a
    // matching method in the preload bridge and an entry in MoireApi.
    handle('git:branches', () => requireRepo().branches());

    handle('git:changed-files', (base: string, head: string, mode: CompareMode) =>
        requireRepo().changedFiles(base, head, mode)
    );

    handle('git:file-pair', (base: string, head: string, filePath: string, mode: CompareMode) =>
        requireRepo().filePair(base, head, filePath, mode)
    );
}

export { registerIpcHandlers, isGitAvailable, getCurrentRepoPath };
