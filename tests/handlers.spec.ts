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
    getFlourishes: vi.fn<() => Promise<boolean>>(),
    getCodeStyle: vi.fn<() => Promise<string>>(),
    getDiffLayout: vi.fn<() => Promise<string>>(),
    currentThemeState: vi.fn<() => { preference: string; isDark: boolean }>(),
    logError: vi.fn<(context: string, error: unknown) => void>(),
    onRecentsChanged: vi.fn<() => void>(),
    getPullRequest: vi.fn<(repoPath: string, base: string, head: string) => Promise<unknown>>(),
    openExternal: vi.fn<(url: string) => Promise<void>>(),
    openPath: vi.fn<(p: string) => Promise<string>>(),
    getEditorPreference: vi.fn<() => Promise<string>>(),
    detectEditors:
        vi.fn<() => Promise<{ id: string; label: string; kind: string; target: string }[]>>(),
    openWithEditor: vi.fn<(editor: unknown, p: string) => Promise<string>>(),
}));

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
            state.handlers.set(channel, fn),
    },
    dialog: { showOpenDialog: state.showOpenDialog, showErrorBox: state.showErrorBox },
    shell: { openExternal: state.openExternal, openPath: state.openPath },
}));

vi.mock('../electron/editors', () => ({
    detectEditors: state.detectEditors,
    openWithEditor: state.openWithEditor,
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

vi.mock('../electron/github/gh', () => ({ getPullRequest: state.getPullRequest }));
vi.mock('../electron/watcher/RepoWatcher', () => ({ watchRepo: state.watchRepo }));
vi.mock('../electron/settings', () => ({
    getRecentRepos: state.getRecentRepos,
    addRecentRepo: state.addRecentRepo,
    removeRecentRepo: state.removeRecentRepo,
    getBranchSelection: state.getBranchSelection,
    setBranchSelection: state.setBranchSelection,
    getFlourishes: state.getFlourishes,
    getCodeStyle: state.getCodeStyle,
    getEditorPreference: state.getEditorPreference,
    getDiffLayout: state.getDiffLayout,
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
        state.getFlourishes.mockResolvedValue(true);
        state.getCodeStyle.mockResolvedValue('github');
        state.getDiffLayout.mockResolvedValue('single');
        state.getEditorPreference.mockResolvedValue('auto');
        state.openPath.mockResolvedValue('');
        state.detectEditors.mockResolvedValue([]);
        state.openWithEditor.mockResolvedValue('');
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
            'flourishes:get',
            'code-style:get',
            'diff-layout:get',
            'git:branches',
            'git:changed-files',
            'git:file-pair',
            'gh:pull-request',
            'shell:open-external',
            'shell:open-path',
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

    it('serves the flourishes setting', async () => {
        expect(await invoke('flourishes:get')).toBe(true);
    });

    it('serves the code style setting', async () => {
        expect(await invoke('code-style:get')).toBe('github');
    });

    it('serves the diff layout setting', async () => {
        expect(await invoke('diff-layout:get')).toBe('single');
    });

    it('looks up a PR against the open repo path, forwarding base and head', async () => {
        await invoke('repo:open', '/repos/moire');
        const prResult = { status: 'ok', pr: { number: 7 } };
        state.getPullRequest.mockResolvedValue(prResult);

        const result = await invoke('gh:pull-request', 'main', 'feature');

        expect(state.getPullRequest).toHaveBeenCalledWith('/repos/moire', 'main', 'feature');
        expect(result).toBe(prResult);
    });

    it('rejects the PR lookup before any repo is opened', async () => {
        await expect(invoke('gh:pull-request', 'main', 'feature')).rejects.toThrow(
            'No repository is open'
        );
    });

    it('opens only http(s) URLs externally', async () => {
        await invoke('shell:open-external', 'https://github.com/o/r/pull/1');
        expect(state.openExternal).toHaveBeenCalledWith('https://github.com/o/r/pull/1');

        state.openExternal.mockClear();
        await invoke('shell:open-external', 'file:///etc/passwd');
        await invoke('shell:open-external', 'javascript:alert(1)');
        expect(state.openExternal).not.toHaveBeenCalled();
    });

    it('opens a repo file in the OS default app under the auto preference', async () => {
        await invoke('repo:open', '/repos/moire');

        const result = await invoke('shell:open-path', 'src/a.ts');

        expect(state.openPath).toHaveBeenCalledWith('/repos/moire/src/a.ts');
        expect(state.openWithEditor).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true });
    });

    it('opens in the chosen editor when one is set and detected', async () => {
        state.getEditorPreference.mockResolvedValue('phpstorm');
        state.detectEditors.mockResolvedValue([
            {
                id: 'phpstorm',
                label: 'PhpStorm',
                kind: 'mac-app',
                target: '/Applications/PhpStorm.app',
            },
        ]);
        await invoke('repo:open', '/repos/moire');

        const result = await invoke('shell:open-path', 'src/a.ts');

        expect(state.openWithEditor).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'phpstorm' }),
            '/repos/moire/src/a.ts'
        );
        expect(state.openPath).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true });
    });

    it('falls back to the OS default when the chosen editor is gone or fails', async () => {
        state.getEditorPreference.mockResolvedValue('phpstorm');
        state.detectEditors.mockResolvedValue([]); // no longer installed
        await invoke('repo:open', '/repos/moire');

        await invoke('shell:open-path', 'src/a.ts');
        expect(state.openWithEditor).not.toHaveBeenCalled();
        expect(state.openPath).toHaveBeenCalledWith('/repos/moire/src/a.ts');
    });

    it('refuses to open a path that escapes the repository', async () => {
        await invoke('repo:open', '/repos/moire');

        const result = await invoke('shell:open-path', '../../etc/passwd');

        expect(result).toEqual({
            ok: false,
            message: 'Refusing to open a path outside the repository.',
        });
        expect(state.openPath).not.toHaveBeenCalled();
        expect(state.openWithEditor).not.toHaveBeenCalled();
    });
});
