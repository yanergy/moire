import { describe, it, expect, beforeEach, vi } from 'vitest';

// preload.ts is the security-critical bridge: on import it calls
// contextBridge.exposeInMainWorld('api', {...}). Capture what it exposes and stub
// ipcRenderer so the surface and each channel forward can be asserted.
type BridgeApi = Record<string, (...args: unknown[]) => unknown>;

const bridge = vi.hoisted(() => ({
    api: undefined as BridgeApi | undefined,
    invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    on: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
    removeListener: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
}));

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: (key: string, value: unknown) => {
            if (key === 'api') {
                bridge.api = value as BridgeApi;
            }
        },
    },
    ipcRenderer: { invoke: bridge.invoke, on: bridge.on, removeListener: bridge.removeListener },
}));

function api(): BridgeApi {
    if (!bridge.api) {
        throw new Error('bridge api was not exposed');
    }

    return bridge.api;
}

describe('preload bridge', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        bridge.api = undefined;
        bridge.invoke.mockResolvedValue(undefined);
        vi.resetModules();
        await import('../electron/preload');
    });

    it('exposes the full MoireApi surface as functions', () => {
        for (const method of [
            'openRepoDialog',
            'openRepo',
            'getRecentRepos',
            'removeRecentRepo',
            'getBranchSelection',
            'setBranchSelection',
            'getBranches',
            'getChangedFiles',
            'getFilePair',
            'getTheme',
            'onThemeChanged',
            'getFlourishes',
            'onFlourishesChanged',
            'getCodeStyle',
            'onCodeStyleChanged',
            'onMenuRefresh',
            'onMenuOpenRepo',
            'onMenuOpenRecent',
            'onRepoChanged',
        ]) {
            expect(typeof api()[method]).toBe('function');
        }
    });

    it('forwards invoke channels with their arguments', async () => {
        await api().openRepo!('/repos/x');
        expect(bridge.invoke).toHaveBeenCalledWith('repo:open', '/repos/x');

        await api().getChangedFiles!('main', 'WORKING TREE', 'direct');
        expect(bridge.invoke).toHaveBeenCalledWith(
            'git:changed-files',
            'main',
            'WORKING TREE',
            'direct'
        );

        await api().getFilePair!('main', 'feature', 'src/a.ts', 'merge-base', true);
        expect(bridge.invoke).toHaveBeenCalledWith(
            'git:file-pair',
            'main',
            'feature',
            'src/a.ts',
            'merge-base',
            true
        );
    });

    it('subscribes and returns an unsubscribe that removes the same listener', () => {
        const cb = vi.fn<(change: unknown) => void>();
        const off = api().onRepoChanged!(cb);

        expect(bridge.on).toHaveBeenCalledWith('repo:changed', expect.any(Function));
        const listener = bridge.on.mock.calls.find((c) => c[0] === 'repo:changed')![1];

        off!();
        expect(bridge.removeListener).toHaveBeenCalledWith('repo:changed', listener);
    });

    it('delivers the event payload to the callback, dropping the IpcRendererEvent', () => {
        const cb = vi.fn<(path: string) => void>();
        api().onMenuOpenRecent!(cb);

        const listener = bridge.on.mock.calls.find((c) => c[0] === 'menu:open-recent')![1];
        listener({}, '/repos/x'); // (event, path)

        expect(cb).toHaveBeenCalledWith('/repos/x');
    });
});
