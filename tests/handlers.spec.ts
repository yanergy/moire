import { describe, it, expect, beforeEach, vi } from 'vitest';

// registerIpcHandlers wires the IPC surface to electron/simple-git/settings, none
// of which are injectable here, so mock them. ipcMain.handle captures each handler
// into `state.handlers` so tests can invoke a channel directly; the rest are
// controllable stubs. (git-availability.spec.ts imports the same module without
// mocks and is unaffected, since vitest isolates modules per file.)
const state = vi.hoisted(() => ({
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    checkIsRepo: vi.fn<() => Promise<boolean>>(),
    showOpenDialog: vi.fn<() => Promise<{ canceled: boolean; filePaths: string[] }>>(),
    showErrorBox: vi.fn<(title: string, content: string) => void>(),
    watchRepo: vi.fn<(repoPath: string) => void>(),
    addRecentRepo: vi.fn<(repoPath: string) => Promise<string[]>>(),
    getRecentRepos: vi.fn<() => Promise<string[]>>(),
    removeRecentRepo: vi.fn<(repoPath: string) => Promise<string[]>>(),
    getBranchSelection: vi.fn<(repoPath: string) => Promise<unknown>>(),
    setBranchSelection: vi.fn<() => Promise<void>>(),
    currentThemeState: vi.fn<() => { preference: string; isDark: boolean }>(),
    logError: vi.fn<(context: string, error: unknown) => void>(),
    onRecentsChanged: vi.fn<() => void>(),
}));

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
            state.handlers.set(channel, fn),
    },
    dialog: { showOpenDialog: state.showOpenDialog, showErrorBox: state.showErrorBox },
}));

vi.mock('simple-git', () => ({
    simpleGit: () => ({ checkIsRepo: state.checkIsRepo, raw: vi.fn<() => Promise<string>>() }),
    CheckRepoActions: { IS_REPO_ROOT: 'root' },
}));

vi.mock('../electron/git/GitService', () => ({
    GitService: class {
        repoPath: string;
        constructor(repoPath: string) {
            this.repoPath = repoPath;
        }
        branches() {
            return Promise.resolve([]);
        }
    },
}));

vi.mock('../electron/watcher/RepoWatcher', () => ({ watchRepo: state.watchRepo }));
vi.mock('../electron/settings', () => ({
    getRecentRepos: state.getRecentRepos,
    addRecentRepo: state.addRecentRepo,
    removeRecentRepo: state.removeRecentRepo,
    getBranchSelection: state.getBranchSelection,
    setBranchSelection: state.setBranchSelection,
}));
vi.mock('../electron/theme', () => ({ currentThemeState: state.currentThemeState }));
vi.mock('../electron/logger', () => ({ logError: state.logError }));

let mod: typeof import('../electron/ipc/handlers');

// Invoke a captured handler the way ipcMain would: a dropped event, then the args.
function invoke(channel: string, ...args: unknown[]): unknown {
    const fn = state.handlers.get(channel);
    if (!fn) {
        throw new Error(`no handler for ${channel}`);
    }

    return fn({}, ...args);
}

describe('registerIpcHandlers', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        state.handlers.clear();
        state.checkIsRepo.mockResolvedValue(true);
        state.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
        state.addRecentRepo.mockResolvedValue(['/repos/moire']);
        state.getRecentRepos.mockResolvedValue([]);
        state.removeRecentRepo.mockResolvedValue([]);
        state.getBranchSelection.mockResolvedValue(null);
        state.setBranchSelection.mockResolvedValue(undefined);
        state.currentThemeState.mockReturnValue({ preference: 'system', isDark: false });

        // Fresh module each test so the internal currentRepo starts unset.
        vi.resetModules();
        mod = await import('../electron/ipc/handlers');
        mod.registerIpcHandlers({ onRecentsChanged: state.onRecentsChanged });
    });

    it('registers every IPC channel', () => {
        for (const channel of [
            'dialog:open-repo',
            'repo:open',
            'repo:recent',
            'repo:remove-recent',
            'settings:branch-selection:get',
            'settings:branch-selection:set',
            'theme:get',
            'git:branches',
            'git:changed-files',
            'git:file-pair',
        ]) {
            expect(state.handlers.has(channel)).toBe(true);
        }
    });

    it('rejects a git channel with "No repository is open" before any repo is opened', async () => {
        await expect(invoke('git:branches')).rejects.toThrow('No repository is open');
        expect(state.logError).toHaveBeenCalled(); // the handle wrapper records it
        expect(mod.getCurrentRepoPath()).toBeNull();
    });

    it('opens a valid repo: sets the current repo, records it, watches, and notifies', async () => {
        const result = await invoke('repo:open', '/repos/moire');

        expect(result).toEqual({ path: '/repos/moire', name: 'moire' });
        expect(state.addRecentRepo).toHaveBeenCalledWith('/repos/moire');
        expect(state.watchRepo).toHaveBeenCalledWith('/repos/moire');
        expect(state.onRecentsChanged).toHaveBeenCalledTimes(1);
        expect(mod.getCurrentRepoPath()).toBe('/repos/moire');

        // A git channel now resolves instead of throwing the guard.
        await expect(invoke('git:branches')).resolves.toEqual([]);
    });

    it('rejects a non-repository path with an error box and leaves no current repo', async () => {
        state.checkIsRepo.mockResolvedValue(false);

        const result = await invoke('repo:open', '/tmp/not-a-repo');

        expect(result).toBeNull();
        expect(state.showErrorBox).toHaveBeenCalled();
        expect(state.addRecentRepo).not.toHaveBeenCalled();
        expect(mod.getCurrentRepoPath()).toBeNull();
    });

    it('treats a checkIsRepo failure as "not a repository"', async () => {
        state.checkIsRepo.mockRejectedValue(new Error('git missing'));

        const result = await invoke('repo:open', '/x');

        expect(result).toBeNull();
        expect(state.showErrorBox).toHaveBeenCalled();
    });

    it('returns the chosen folder from the open dialog, or null when canceled', async () => {
        expect(await invoke('dialog:open-repo')).toBeNull();

        state.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/repos/x'] });
        expect(await invoke('dialog:open-repo')).toBe('/repos/x');
    });

    it('serves the current theme state', async () => {
        expect(await invoke('theme:get')).toEqual({ preference: 'system', isDark: false });
    });
});
