// Context-isolated bridge: the only surface the renderer (window.api) can reach.
// Each method forwards to an ipcMain.handle channel in electron/ipc/handlers.cjs
// and is typed by DiffViewerApi in src/shared/types.ts. The git-backend methods
// (getBranches, getChangedFiles, getFilePair, onRepoChanged) land in Phase 2
// together with their handlers.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openRepoDialog: () => ipcRenderer.invoke('dialog:open-repo'),
    openRepo: (repoPath) => ipcRenderer.invoke('repo:open', repoPath),
    getRecentRepos: () => ipcRenderer.invoke('repo:recent'),
    removeRecentRepo: (repoPath) => ipcRenderer.invoke('repo:remove-recent', repoPath),
    // Main-process menu event (View → Toggle Theme), pushed to the renderer.
    // Returns an unsubscribe function so the caller can drop the listener.
    onToggleTheme: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('theme:toggle', listener);
        return () => ipcRenderer.removeListener('theme:toggle', listener);
    },
});
