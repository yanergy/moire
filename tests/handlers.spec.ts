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
    watchRepo:
        vi.fn<
            (
                repoPath: string,
                options: { onChange: (event: { reason: 'refs' | 'worktree'; at: number }) => void }
            ) => void
        >(),
    addRecentRepo: vi.fn<(repoPath: string) => Promise<string[]>>(),
    getRecentRepos: vi.fn<() => Promise<string[]>>(),
    removeRecentRepo: vi.fn<(repoPath: string) => Promise<string[]>>(),
    getBranchSelection: vi.fn<(repoPath: string) => Promise<unknown>>(),
    setBranchSelection: vi.fn<() => Promise<void>>(),
    getFavoriteBranches: vi.fn<(repoPath: string) => Promise<string[]>>(),
    setFavoriteBranches: vi.fn<(repoPath: string, names: string[]) => Promise<void>>(),
    getRepoBranches: vi.fn<(repoPath: string) => Promise<unknown>>(),
    setRepoBranches: vi.fn<(repoPath: string, settings: unknown) => Promise<void>>(),
    getFlourishes: vi.fn<() => Promise<boolean>>(),
    getCodeStyle: vi.fn<() => Promise<string>>(),
    getDiffLayout: vi.fn<() => Promise<string>>(),
    currentThemeState: vi.fn<() => { preference: string; isDark: boolean }>(),
    logError: vi.fn<(context: string, error: unknown) => void>(),
    onRecentsChanged: vi.fn<() => void>(),
    onRepoOpened: vi.fn<(repoPath: string) => void>(),
    onRefsChanged: vi.fn<() => void>(),
    onRepoBranchesChanged: vi.fn<() => void>(),
    dashboard: {
        state: vi.fn<() => Promise<unknown>>(),
        setMergedPeriod: vi.fn<(period: string) => Promise<unknown>>(),
        get: vi.fn<() => Promise<unknown>>(),
        refresh: vi.fn<() => Promise<unknown>>(),
        setShowDrafts: vi.fn<(show: boolean) => Promise<unknown>>(),
        setAuthors: vi.fn<(authors: unknown) => Promise<unknown>>(),
        setHiddenCards: vi.fn<(keys: string[]) => Promise<unknown>>(),
        setNotificationSettings: vi.fn<(change: unknown) => Promise<unknown>>(),
        markRead: vi.fn<(id: string) => Promise<unknown>>(),
        markUnread: vi.fn<(id: string) => Promise<unknown>>(),
        markAllRead: vi.fn<() => Promise<unknown>>(),
        deleteNotification: vi.fn<(id: string) => Promise<unknown>>(),
    },
    getPullRequest: vi.fn<(repoPath: string, base: string, head: string) => Promise<unknown>>(),
    addReviewComment:
        vi.fn<(repoPath: string, reviewId: string, comment: unknown) => Promise<unknown>>(),
    submitReview:
        vi.fn<
            (repoPath: string, reviewId: string, event: string, body: string) => Promise<unknown>
        >(),
    openExternal: vi.fn<(url: string) => Promise<void>>(),
    openPath: vi.fn<(p: string) => Promise<string>>(),
    getEditorPreference: vi.fn<() => Promise<string>>(),
    detectEditors:
        vi.fn<() => Promise<{ id: string; label: string; kind: string; target: string }[]>>(),
    openWithEditor: vi.fn<(editor: unknown, p: string) => Promise<string>>(),
    getPrStack: vi.fn<(repoPath: string, head: string) => Promise<unknown>>(),
    getStackAction: vi.fn<(repoPath: string, prNumber: number) => Promise<unknown>>(),
    createStack: vi.fn<(repoPath: string, prNumbers: number[]) => Promise<unknown>>(),
    addToStack: vi.fn<(repoPath: string, stack: number, prNumbers: number[]) => Promise<unknown>>(),
    branches: [] as { name: string; kind: string }[],
    isAncestor: vi.fn<(a: string, b: string) => Promise<boolean | null>>(),
    getDiffDisplay: vi.fn<() => Promise<unknown>>(),
    setCompareMode: vi.fn<(mode: string) => Promise<void>>(),
    setViewMode: vi.fn<(mode: string) => Promise<void>>(),
    menuTemplate: [] as { label?: string; enabled?: boolean; click?: () => void }[],
    menuPopup: vi.fn<(options: unknown) => void>(),
    writeText: vi.fn<(text: string) => void>(),
}));

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
            state.handlers.set(channel, fn),
    },
    dialog: { showOpenDialog: state.showOpenDialog, showErrorBox: state.showErrorBox },
    shell: { openExternal: state.openExternal, openPath: state.openPath },
    BrowserWindow: { fromWebContents: () => ({ id: 1 }) },
    clipboard: { writeText: state.writeText },
    Menu: {
        buildFromTemplate: (template: typeof state.menuTemplate) => {
            state.menuTemplate = template;
            return { popup: state.menuPopup };
        },
    },
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
    WORKING_TREE: 'WORKING TREE',
    GitService: class {
        repoPath: string;
        constructor(repoPath: string) {
            this.repoPath = repoPath;
        }
        branches() {
            return Promise.resolve(state.branches);
        }
        isAncestor(a: string, b: string) {
            return state.isAncestor(a, b);
        }
    },
}));

vi.mock('../electron/github/gh', () => ({
    getPullRequest: state.getPullRequest,
    getPrStack: state.getPrStack,
    getStackAction: state.getStackAction,
    createStack: state.createStack,
    addToStack: state.addToStack,
    addReviewComment: state.addReviewComment,
    submitReview: state.submitReview,
}));
vi.mock('../electron/watcher/RepoWatcher', () => ({ watchRepo: state.watchRepo }));
vi.mock('../electron/settings', () => ({
    getRecentRepos: state.getRecentRepos,
    addRecentRepo: state.addRecentRepo,
    removeRecentRepo: state.removeRecentRepo,
    getBranchSelection: state.getBranchSelection,
    setBranchSelection: state.setBranchSelection,
    getFavoriteBranches: state.getFavoriteBranches,
    setFavoriteBranches: state.setFavoriteBranches,
    getRepoBranches: state.getRepoBranches,
    setRepoBranches: state.setRepoBranches,
    getFlourishes: state.getFlourishes,
    getCodeStyle: state.getCodeStyle,
    getEditorPreference: state.getEditorPreference,
    getDiffLayout: state.getDiffLayout,
    getDiffDisplay: state.getDiffDisplay,
    setCompareMode: state.setCompareMode,
    setViewMode: state.setViewMode,
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
        state.getFavoriteBranches.mockResolvedValue([]);
        state.setFavoriteBranches.mockResolvedValue(undefined);
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
        mod.registerIpcHandlers({
            onRecentsChanged: state.onRecentsChanged,
            onRepoOpened: state.onRepoOpened,
            onRefsChanged: state.onRefsChanged,
            onRepoBranchesChanged: state.onRepoBranchesChanged,
            dashboard: state.dashboard as never,
        });
    });

    it('registers every IPC channel', () => {
        for (const channel of [
            'dialog:open-repo',
            'repo:open',
            'repo:recent',
            'repo:remove-recent',
            'settings:branch-selection:get',
            'settings:branch-selection:set',
            'settings:favorite-branches:get',
            'settings:favorite-branches:set',
            'settings:repo-branches:get',
            'settings:repo-branches:set',
            'theme:get',
            'flourishes:get',
            'code-style:get',
            'diff-layout:get',
            'git:branches',
            'git:changed-files',
            'git:file-pair',
            'gh:pull-request',
            'gh:add-review-comment',
            'gh:submit-review',
            'git:resolve-commit',
            'shell:open-external',
            'shell:open-path',
            'dashboard:get',
            'dashboard:refresh',
            'dashboard:set-show-drafts',
            'dashboard:set-authors',
            'dashboard:set-hidden-cards',
            'dashboard:set-merged-period',
            'dashboard:state',
            'dashboard:set-notification-settings',
            'dashboard:mark-read',
            'dashboard:mark-unread',
            'dashboard:mark-all-read',
            'dashboard:delete-notification',
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
        expect(state.watchRepo).toHaveBeenCalledWith('/repos/moire', expect.any(Object));
        expect(state.onRecentsChanged).toHaveBeenCalledTimes(1);
        expect(state.onRepoOpened).toHaveBeenCalledWith('/repos/moire');
        expect(mod.getCurrentRepoPath()).toBe('/repos/moire');

        // A git channel now resolves instead of throwing the guard.
        await expect(invoke('git:branches')).resolves.toEqual([]);
        await expect(mod.getCurrentBranches()).resolves.toEqual([]);
    });

    it('reports ref changes of the opened repo, but not working tree changes', async () => {
        await invoke('repo:open', '/repos/moire');
        const { onChange } = state.watchRepo.mock.calls.at(-1)![1];

        onChange({ reason: 'worktree', at: 1 });
        expect(state.onRefsChanged).not.toHaveBeenCalled();

        onChange({ reason: 'refs', at: 2 });
        expect(state.onRefsChanged).toHaveBeenCalledTimes(1);
    });

    it('rejects a non-repository path with an error box and leaves no current repo', async () => {
        state.checkIsRepo.mockResolvedValue(false);

        const result = await invoke('repo:open', '/tmp/not-a-repo');

        expect(result).toBeNull();
        expect(state.showErrorBox).toHaveBeenCalled();
        expect(state.addRecentRepo).not.toHaveBeenCalled();
        expect(state.onRepoOpened).not.toHaveBeenCalled();
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

    describe('review writes', () => {
        beforeEach(async () => {
            await invoke('repo:open', '/repos/moire');
            state.addReviewComment.mockResolvedValue({ ok: true });
            state.submitReview.mockResolvedValue({ ok: true });
        });

        it('passes a well formed line comment on, dropping a start line past its end', async () => {
            await invoke('gh:add-review-comment', 'PRR_1', {
                path: 'src/a.ts',
                line: 4,
                startLine: 9,
                side: 'LEFT',
                body: 'hm',
                extra: true,
            });

            expect(state.addReviewComment).toHaveBeenCalledWith('/repos/moire', 'PRR_1', {
                path: 'src/a.ts',
                line: 4,
                side: 'LEFT',
                body: 'hm',
            });
        });

        it('refuses a malformed line comment without calling gh', async () => {
            const result = await invoke('gh:add-review-comment', 'PRR_1', {
                path: 'src/a.ts',
                line: 0,
                side: 'UP',
                body: 'hm',
            });

            expect(result).toEqual({ ok: false, message: 'Nothing to add.' });
            expect(state.addReviewComment).not.toHaveBeenCalled();
        });

        it('submits an unknown verdict as a comment', async () => {
            await invoke('gh:submit-review', 'PRR_1', 'MERGE', 'done');
            await invoke('gh:submit-review', 'PRR_1', 'REQUEST_CHANGES', 7);

            expect(state.submitReview).toHaveBeenNthCalledWith(
                1,
                '/repos/moire',
                'PRR_1',
                'COMMENT',
                'done'
            );
            expect(state.submitReview).toHaveBeenNthCalledWith(
                2,
                '/repos/moire',
                'PRR_1',
                'REQUEST_CHANGES',
                ''
            );
        });
    });

    it('rejects the dashboard channels before any repo is opened', async () => {
        await expect(invoke('dashboard:get')).rejects.toThrow('No repository is open');
        // The settings are per repository too.
        await expect(invoke('dashboard:state')).rejects.toThrow('No repository is open');
        await expect(invoke('dashboard:set-merged-period', 'month')).rejects.toThrow(
            'No repository is open'
        );
        expect(state.dashboard.get).not.toHaveBeenCalled();
    });

    it('stores a repository branch setting, keeping only valid fields, and reports it', async () => {
        await invoke('settings:repo-branches:set', '/repos/moire', {
            main: 'origin/trunk',
            development: null,
            extra: 1,
        });
        expect(state.setRepoBranches).toHaveBeenCalledWith('/repos/moire', {
            main: 'origin/trunk',
            development: null,
        });
        expect(state.onRepoBranchesChanged).toHaveBeenCalledTimes(1);

        await invoke('settings:repo-branches:set', '/repos/moire', { main: 3, development: 4 });
        expect(state.setRepoBranches).toHaveBeenLastCalledWith('/repos/moire', {});
    });

    it('forwards the dashboard channels to the bridge once a repo is open', async () => {
        await invoke('repo:open', '/repos/moire');
        const dashboardState = { status: 'ok', snapshot: null, activity: [], showDrafts: true };
        state.dashboard.get.mockResolvedValue(dashboardState);
        state.dashboard.refresh.mockResolvedValue(dashboardState);
        state.dashboard.setShowDrafts.mockResolvedValue(dashboardState);

        expect(await invoke('dashboard:get')).toBe(dashboardState);
        state.dashboard.state.mockResolvedValue(dashboardState);
        expect(await invoke('dashboard:state')).toBe(dashboardState);

        // Anything but 'month' is the default week.
        state.dashboard.setMergedPeriod.mockResolvedValue(dashboardState);
        await invoke('dashboard:set-merged-period', 'month');
        expect(state.dashboard.setMergedPeriod).toHaveBeenCalledWith('month');
        await invoke('dashboard:set-merged-period', 'year');
        expect(state.dashboard.setMergedPeriod).toHaveBeenLastCalledWith('week');
        expect(await invoke('dashboard:refresh')).toBe(dashboardState);
        expect(await invoke('dashboard:set-show-drafts', false)).toBe(dashboardState);
        expect(state.dashboard.setShowDrafts).toHaveBeenCalledWith(false);

        state.dashboard.setAuthors.mockResolvedValue(dashboardState);
        expect(await invoke('dashboard:set-authors', ['ann'])).toBe(dashboardState);
        expect(state.dashboard.setAuthors).toHaveBeenCalledWith(['ann']);

        // Anything but a list of keys is dropped before it reaches the settings.
        state.dashboard.setHiddenCards.mockResolvedValue(dashboardState);
        expect(await invoke('dashboard:set-hidden-cards', ['stale', 3])).toBe(dashboardState);
        expect(state.dashboard.setHiddenCards).toHaveBeenCalledWith(['stale']);
        await invoke('dashboard:set-hidden-cards', 'stale');
        expect(state.dashboard.setHiddenCards).toHaveBeenLastCalledWith([]);

        // Only known boolean fields and known event kinds reach the settings.
        state.dashboard.setNotificationSettings.mockResolvedValue(dashboardState);
        expect(
            await invoke('dashboard:set-notification-settings', {
                enabled: false,
                dockBadge: false,
                notifyDrafts: 'no',
                events: { approved: true, bogus: true, 'checks-failed': 1 },
                extra: true,
            })
        ).toBe(dashboardState);
        expect(state.dashboard.setNotificationSettings).toHaveBeenCalledWith({
            enabled: false,
            dockBadge: false,
            events: { approved: true },
        });
        await invoke('dashboard:set-notification-settings', null);
        expect(state.dashboard.setNotificationSettings).toHaveBeenLastCalledWith({});

        state.dashboard.markRead.mockResolvedValue(dashboardState);
        state.dashboard.markUnread.mockResolvedValue(dashboardState);
        state.dashboard.markAllRead.mockResolvedValue(dashboardState);
        state.dashboard.deleteNotification.mockResolvedValue(dashboardState);
        await invoke('dashboard:mark-read', 'id-1');
        await invoke('dashboard:mark-unread', 'id-3');
        await invoke('dashboard:mark-all-read');
        await invoke('dashboard:delete-notification', 'id-2');
        expect(state.dashboard.markRead).toHaveBeenCalledWith('id-1');
        expect(state.dashboard.markUnread).toHaveBeenCalledWith('id-3');
        expect(state.dashboard.markAllRead).toHaveBeenCalledTimes(1);
        expect(state.dashboard.deleteNotification).toHaveBeenCalledWith('id-2');
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

    it('refuses to stage anything but a list of paths', async () => {
        await invoke('repo:open', '/repos/moire');
        await expect(invoke('git:stage', 'a.ts')).rejects.toThrow('Expected a list of paths');
        await expect(invoke('git:unstage', [1])).rejects.toThrow('Expected a list of paths');
    });

    describe('gh:pr-stack', () => {
        const entry = (position: number, number: number, head: string, base: string) => ({
            position,
            number,
            title: '',
            url: '',
            headRefName: head,
            baseRefName: base,
            state: 'OPEN',
            isDraft: false,
            reviewDecision: '',
            isCurrent: false,
        });

        it('looks the stack up by the PR node id', async () => {
            await invoke('repo:open', '/repos/moire');
            state.getPrStack.mockResolvedValue(null);
            await invoke('gh:pr-stack', 'PR_1');
            expect(state.getPrStack).toHaveBeenCalledWith('/repos/moire', 'PR_1');
        });

        it('marks a PR whose parent moved on as needing a rebase', async () => {
            await invoke('repo:open', '/repos/moire');
            state.branches = [
                { name: 'origin/a', kind: 'remote' },
                { name: 'origin/b', kind: 'remote' },
                { name: 'c', kind: 'local' },
            ];
            state.getPrStack.mockResolvedValue({
                number: 580,
                size: 3,
                baseRefName: 'main',
                entries: [entry(1, 1, 'a', 'main'), entry(2, 2, 'b', 'a'), entry(3, 3, 'c', 'b')],
            });
            state.isAncestor.mockImplementation((parent) => Promise.resolve(parent === 'origin/a'));

            const stack = (await invoke('gh:pr-stack', 'PR_2')) as {
                entries: { needsRebase?: boolean }[];
            };

            expect(state.isAncestor).toHaveBeenCalledWith('origin/a', 'origin/b');
            expect(state.isAncestor).toHaveBeenCalledWith('origin/b', 'c');
            expect(stack.entries.map((e) => e.needsRebase)).toEqual([undefined, false, true]);
        });

        it('passes on no stack', async () => {
            await invoke('repo:open', '/repos/moire');
            state.getPrStack.mockResolvedValue(null);
            expect(await invoke('gh:pr-stack', 'PR_1')).toBeNull();
        });
    });

    describe('stack writes', () => {
        it('reads the stack action for a PR number in the open repository', async () => {
            await invoke('repo:open', '/repos/moire');
            state.getStackAction.mockResolvedValue(null);
            await invoke('gh:stack-action', 42);
            expect(state.getStackAction).toHaveBeenCalledWith('/repos/moire', 42);
        });

        it('creates a stack from PR numbers, bottom to top', async () => {
            await invoke('repo:open', '/repos/moire');
            state.createStack.mockResolvedValue({ ok: true });
            expect(await invoke('gh:create-stack', [41, 42])).toEqual({ ok: true });
            expect(state.createStack).toHaveBeenCalledWith('/repos/moire', [41, 42]);
        });

        it('adds PR numbers to the top of a stack by its number', async () => {
            await invoke('repo:open', '/repos/moire');
            state.addToStack.mockResolvedValue({ ok: false, message: 'Validation Failed' });
            expect(await invoke('gh:add-to-stack', 7, [43])).toEqual({
                ok: false,
                message: 'Validation Failed',
            });
            expect(state.addToStack).toHaveBeenCalledWith('/repos/moire', 7, [43]);
        });

        it('rejects malformed arguments before reaching gh', async () => {
            await invoke('repo:open', '/repos/moire');
            await expect(invoke('gh:stack-action', '42')).rejects.toThrow(TypeError);
            await expect(invoke('gh:create-stack', [41, '42'])).rejects.toThrow(TypeError);
            await expect(invoke('gh:add-to-stack', '7', [43])).rejects.toThrow(TypeError);
            expect(state.createStack).not.toHaveBeenCalled();
            expect(state.addToStack).not.toHaveBeenCalled();
        });
    });

    describe('diff display', () => {
        it('reads and saves the compare mode and the layout', async () => {
            state.getDiffDisplay.mockResolvedValue({ compareMode: 'direct', viewMode: 'split' });
            expect(await invoke('diff-display:get')).toEqual({
                compareMode: 'direct',
                viewMode: 'split',
            });

            await invoke('diff-display:set-compare-mode', 'direct');
            expect(state.setCompareMode).toHaveBeenCalledWith('direct');
            await invoke('diff-display:set-view-mode', 'unified');
            expect(state.setViewMode).toHaveBeenCalledWith('unified');
        });

        it('rejects unknown values', async () => {
            await expect(invoke('diff-display:set-compare-mode', 'sideways')).rejects.toThrow(
                'expects merge-base or direct'
            );
            await expect(invoke('diff-display:set-view-mode', 'stacked')).rejects.toThrow(
                'expects split or unified'
            );
        });
    });

    describe('clipboard:write-text', () => {
        it('writes text to the clipboard', async () => {
            await invoke('clipboard:write-text', 'npm install');
            expect(state.writeText).toHaveBeenCalledWith('npm install');
        });

        it('refuses anything but text', async () => {
            await expect(invoke('clipboard:write-text', { x: 1 })).rejects.toThrow(
                'Only text can be copied.'
            );
            expect(state.writeText).not.toHaveBeenCalled();
        });
    });

    describe('menu:branch-picker', () => {
        it('pops up the comparison presets and sends a pick back to the window', async () => {
            const send = vi.fn<(channel: string, ...args: unknown[]) => void>();
            // This channel reads the event's sender, so call it with one.
            await state.handlers.get('menu:branch-picker')!({ sender: { send } }, 'feature');

            expect(state.menuPopup).toHaveBeenCalledWith({ window: { id: 1 } });
            const labels = state.menuTemplate.map((item) => item.label);
            expect(labels).toEqual([
                'Copy Branch Name',
                undefined,
                'Comparison Presets',
                'Compare Current Branch to Development',
                'Compare Working Tree to Origin',
            ]);

            state.menuTemplate[4]!.click!();
            expect(send).toHaveBeenCalledWith('menu:compare-preset', '', 'WORKING TREE');
        });

        it("copies the picker's ref to the clipboard", async () => {
            const send = vi.fn<(channel: string, ...args: unknown[]) => void>();
            await state.handlers.get('menu:branch-picker')!({ sender: { send } }, 'feature');

            state.menuTemplate[0]!.click!();
            expect(state.writeText).toHaveBeenCalledWith('feature');
        });
    });
});
