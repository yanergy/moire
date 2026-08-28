// Context-isolated bridge: the only surface the renderer (window.api) can reach.
// Each method forwards to an ipcMain.handle channel in electron/ipc/handlers.cjs
// and is typed by MoireApi in src/shared/types.ts. onRepoChanged lands with the
// RepoWatcher in Phase 4; nothing pushes those events yet.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openRepoDialog: () => ipcRenderer.invoke('dialog:open-repo'),
    openRepo: (repoPath) => ipcRenderer.invoke('repo:open', repoPath),
    getRecentRepos: () => ipcRenderer.invoke('repo:recent'),
    removeRecentRepo: (repoPath) => ipcRenderer.invoke('repo:remove-recent', repoPath),
    getBranchSelection: (repoPath) => ipcRenderer.invoke('settings:branch-selection:get', repoPath),
    setBranchSelection: (repoPath, base, head) =>
        ipcRenderer.invoke('settings:branch-selection:set', repoPath, base, head),
    getBranches: () => ipcRenderer.invoke('git:branches'),
    getChangedFiles: (base, head, mode) =>
        ipcRenderer.invoke('git:changed-files', base, head, mode),
    getFilePair: (base, head, filePath) =>
        ipcRenderer.invoke('git:file-pair', base, head, filePath),
    // Theme is owned by main (nativeTheme). `getTheme` reads the resolved state;
    // `onThemeChanged` fires when the View → Theme selection or the OS theme
    // changes, returning an unsubscribe function so the caller can drop it.
    getTheme: () => ipcRenderer.invoke('theme:get'),
    onThemeChanged: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('theme:changed', listener);
        return () => ipcRenderer.removeListener('theme:changed', listener);
    },
});
