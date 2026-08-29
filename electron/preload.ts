// Context-isolated bridge: the only surface the renderer (window.api) can reach.
// Each method forwards to an ipcMain.handle channel in electron/ipc/handlers.ts
// and is typed by MoireApi in src/shared/types.ts.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
    openRepoDialog: () => ipcRenderer.invoke('dialog:open-repo'),
    openRepo: (repoPath: string) => ipcRenderer.invoke('repo:open', repoPath),
    getRecentRepos: () => ipcRenderer.invoke('repo:recent'),
    removeRecentRepo: (repoPath: string) => ipcRenderer.invoke('repo:remove-recent', repoPath),
    getBranchSelection: (repoPath: string) =>
        ipcRenderer.invoke('settings:branch-selection:get', repoPath),
    setBranchSelection: (repoPath: string, base: string, head: string) =>
        ipcRenderer.invoke('settings:branch-selection:set', repoPath, base, head),
    getBranches: () => ipcRenderer.invoke('git:branches'),
    getChangedFiles: (base: string, head: string, mode: string) =>
        ipcRenderer.invoke('git:changed-files', base, head, mode),
    getFilePair: (base: string, head: string, filePath: string) =>
        ipcRenderer.invoke('git:file-pair', base, head, filePath),
    // Theme is owned by main (nativeTheme). `getTheme` reads the resolved state;
    // `onThemeChanged` fires when the View → Theme selection or the OS theme
    // changes, returning an unsubscribe function so the caller can drop it.
    getTheme: () => ipcRenderer.invoke('theme:get'),
    onThemeChanged: (callback: (state: unknown) => void) => {
        const listener = (_event: IpcRendererEvent, state: unknown) => callback(state);
        ipcRenderer.on('theme:changed', listener);
        return () => ipcRenderer.removeListener('theme:changed', listener);
    },
    // Fired when the native View → Refresh item is chosen. Returns an unsubscribe
    // function so the caller can drop the listener.
    onMenuRefresh: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('menu:refresh', listener);
        return () => ipcRenderer.removeListener('menu:refresh', listener);
    },
    // Fired when the native File → Open Repository… item is chosen; the renderer
    // runs its open-folder flow. Returns an unsubscribe function.
    onMenuOpenRepo: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('menu:open-repo', listener);
        return () => ipcRenderer.removeListener('menu:open-repo', listener);
    },
    // Fired when a native File → Open Recent entry is chosen, with its path.
    // Returns an unsubscribe function.
    onMenuOpenRecent: (callback: (repoPath: string) => void) => {
        const listener = (_event: IpcRendererEvent, repoPath: string) => callback(repoPath);
        ipcRenderer.on('menu:open-recent', listener);
        return () => ipcRenderer.removeListener('menu:open-recent', listener);
    },
    // Fired when the RepoWatcher (main process) sees the open repo's refs or
    // working tree change, so the renderer can auto-refresh. Returns an
    // unsubscribe function so the caller can drop the listener.
    onRepoChanged: (callback: (change: unknown) => void) => {
        const listener = (_event: IpcRendererEvent, change: unknown) => callback(change);
        ipcRenderer.on('repo:changed', listener);
        return () => ipcRenderer.removeListener('repo:changed', listener);
    },
});
