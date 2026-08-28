// Watches one open repository and pushes coalesced change events to the renderer
// so the diff auto-refreshes. All filesystem watching stays in the main process;
// the renderer only reacts to the 'repo:changed' events this broadcasts, typed
// as RepoChangeEvent in src/shared/types.ts.
//
// Backend choice matters here. chokidar watches one directory per fs.watch
// handle (no recursive flag), which on macOS means a kqueue file descriptor per
// directory: ~1800 handles for a modest repo. In Electron's main process, which
// already holds many Chromium fds, that fd churn collides with the stdio fds git
// needs when it spawns and surfaces as `spawn EBADF`, breaking every git call.
// So on the platforms that support it (macOS, Windows) we use Node's native
// recursive fs.watch: ONE OS-level watcher for the whole tree, no fd churn, no
// EBADF. Linux has no recursive fs.watch, so it falls back to chokidar there,
// where inotify does not have the kqueue-vs-spawn problem.
//
// A single git operation (commit, checkout, rebase) storms the watcher with
// dozens of events, so reasons are collected and flushed as ONE event after a
// quiet window. refs outranks worktree in the coalesce.

const fs = require('node:fs');
const path = require('node:path');
const defaultChokidar = require('chokidar');
const { BrowserWindow } = require('electron');

const REPO_CHANGED_CHANNEL = 'repo:changed';

// Long enough to swallow the event burst of a single git operation, short enough
// that the refresh still feels immediate after it settles.
const DEBOUNCE_MS = 250;

// The only paths inside .git worth refreshing on: HEAD (checkout), packed-refs
// (gc/pack-refs), and refs/ (branch create, delete, and commits moving a ref).
// Everything else there (objects/, logs/, index, *.lock, COMMIT_EDITMSG,
// FETCH_HEAD) is write churn we ignore, or every git command would trigger a
// refresh storm.
function refWatchPaths(gitDir) {
    return [path.join(gitDir, 'HEAD'), path.join(gitDir, 'packed-refs'), path.join(gitDir, 'refs')];
}

// Classify a changed path (relative to the repo root) into the refresh reason it
// should trigger, or null to ignore it. Used by the native recursive watcher,
// which sees the whole tree, so it does the .git filtering the two chokidar
// watchers get from their scoped paths instead.
function classifyRelPath(rel) {
    if (rel === '' || rel.startsWith('..')) {
        return null;
    }

    const segments = rel.split(path.sep);
    // node_modules is effectively always git-ignored; changes there never affect
    // the diff.
    if (segments.includes('node_modules')) {
        return null;
    }

    if (segments[0] === '.git') {
        const gitRel = segments.slice(1);
        if (gitRel[0] === 'refs') {
            return 'refs';
        }

        if (gitRel.length === 1 && (gitRel[0] === 'HEAD' || gitRel[0] === 'packed-refs')) {
            return 'refs';
        }

        return null; // objects/, logs/, index, lockfiles: churn we don't refresh on
    }

    return 'worktree';
}

// True for paths the chokidar-fallback working-tree watcher should skip: the
// .git dir (its ref bits are covered by the dedicated fallback ref watcher) and
// node_modules (a performance guard, since chokidar watches it one dir at a time
// and would exhaust inotify on Linux for no benefit).
function worktreeIgnored(repoPath, fullPath) {
    const rel = path.relative(repoPath, fullPath);
    if (rel === '') {
        return false; // the repo root itself
    }

    const segments = rel.split(path.sep);
    return segments[0] === '.git' || segments.includes('node_modules');
}

// refs outranks worktree: a checkout touches both, and the moved ref is the more
// meaningful change to report. The event is informational for now (the renderer
// re-reads everything on any change), but keeping it accurate future-proofs it.
function coalesceReason(reasons) {
    return reasons.has('refs') ? 'refs' : 'worktree';
}

class RepoWatcher {
    // fs.watch, chokidar, and gitDir are injectable so the backends and the
    // debounce are unit-testable without a real filesystem.
    constructor(
        repoPath,
        onChange,
        { debounceMs = DEBOUNCE_MS, fsWatch = fs.watch, chokidar = defaultChokidar, gitDir } = {}
    ) {
        this.repoPath = repoPath;
        this.onChange = onChange;
        this.debounceMs = debounceMs;
        this.fsWatch = fsWatch;
        this.chokidar = chokidar;
        this.gitDir = gitDir ?? path.join(repoPath, '.git');
        this.watchers = [];
        this.pendingReasons = new Set();
        this.timer = null;
    }

    start() {
        const native = this.startNative();
        this.watchers = native ?? this.startChokidar();
        return this;
    }

    // One recursive fs.watch over the whole repo, classifying each event path.
    // Returns the watcher wrappers, or null when recursive watching is not
    // supported (Linux), so the caller falls back to chokidar.
    startNative() {
        try {
            const watcher = this.fsWatch(
                this.repoPath,
                { recursive: true, persistent: true },
                (_event, name) => {
                    if (!name) {
                        return;
                    }

                    const reason = classifyRelPath(
                        path.relative(this.repoPath, path.join(this.repoPath, name))
                    );
                    if (reason) {
                        this.record(reason);
                    }
                }
            );
            watcher.on('error', () => {});
            return [{ close: () => watcher.close() }];
        } catch {
            // ERR_FEATURE_UNAVAILABLE_ON_PLATFORM (recursive unsupported) or any
            // other native failure: let chokidar take over.
            return null;
        }
    }

    // Linux fallback: two scoped chokidar watchers (per-dir inotify, which is not
    // affected by the macOS EBADF problem). The working tree minus .git and
    // node_modules, and the ref-defining .git paths.
    startChokidar() {
        const worktree = this.chokidar.watch(this.repoPath, {
            ignoreInitial: true,
            ignored: (fullPath) => worktreeIgnored(this.repoPath, fullPath),
        });
        worktree.on('all', () => this.record('worktree'));
        worktree.on('error', () => {});

        const refs = this.chokidar.watch(refWatchPaths(this.gitDir), { ignoreInitial: true });
        refs.on('all', () => this.record('refs'));
        refs.on('error', () => {});

        return [{ close: () => worktree.close() }, { close: () => refs.close() }];
    }

    record(reason) {
        this.pendingReasons.add(reason);
        if (this.timer) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => this.flush(), this.debounceMs);
    }

    flush() {
        this.timer = null;
        const reason = coalesceReason(this.pendingReasons);
        this.pendingReasons.clear();
        this.onChange({ reason, at: Date.now() });
    }

    async close() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.pendingReasons.clear();
        await Promise.all(this.watchers.map((watcher) => watcher.close()));
        this.watchers = [];
    }
}

// The app compares one repository at a time, so a single watcher is kept and
// replaced whenever a repo is opened. Broadcasting to every window mirrors the
// theme broadcast (electron/theme.cjs); the renderer's refresh is a no-op when
// no repo is open, so a lingering event is harmless.
let current = null;

function watchRepo(
    repoPath,
    { getWindows = () => BrowserWindow.getAllWindows(), ...options } = {}
) {
    stopWatchingRepo();
    current = new RepoWatcher(
        repoPath,
        (event) => {
            for (const win of getWindows()) {
                win.webContents.send(REPO_CHANGED_CHANNEL, event);
            }
        },
        options
    ).start();
    return current;
}

function stopWatchingRepo() {
    if (!current) {
        return;
    }

    void current.close();
    current = null;
}

module.exports = {
    REPO_CHANGED_CHANNEL,
    RepoWatcher,
    classifyRelPath,
    worktreeIgnored,
    refWatchPaths,
    coalesceReason,
    watchRepo,
    stopWatchingRepo,
};
