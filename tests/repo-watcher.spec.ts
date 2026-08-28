import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    RepoWatcher,
    classifyRelPath,
    worktreeIgnored,
    refWatchPaths,
    coalesceReason,
} from '../electron/watcher/RepoWatcher.cjs';

// Stand-in for a native fs.watch FSWatcher: records the target and options it was
// created with, keeps the change listener so tests can fire synthetic events, and
// tracks close().
function fakeFsWatch() {
    const created: Array<{
        target: string;
        options: Record<string, unknown>;
        fire: (event: string, name: string) => void;
        closed: boolean;
    }> = [];

    const fsWatch = (
        target: string,
        options: Record<string, unknown>,
        listener: (event: string, name: string) => void
    ) => {
        const watcher = {
            target,
            options,
            closed: false,
            on() {
                return watcher;
            },
            fire(event: string, name: string) {
                listener(event, name);
            },
            close() {
                watcher.closed = true;
            },
        };
        created.push(watcher);
        return watcher;
    };

    return { fsWatch, created };
}

// fs.watch that throws the way Node does when recursive watching is unsupported
// (Linux), forcing the chokidar fallback.
function unsupportedFsWatch() {
    return () => {
        const error = new Error('recursive not supported') as Error & { code: string };
        error.code = 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM';
        throw error;
    };
}

// Stand-in for a chokidar FSWatcher used by the fallback backend.
function fakeChokidar() {
    const created: Array<{
        paths: unknown;
        options: Record<string, unknown>;
        fire: (event: string, path: string) => void;
        closed: boolean;
    }> = [];

    const chokidar = {
        watch(paths: unknown, options: Record<string, unknown>) {
            const handlers: Record<string, (event: string, path: string) => void> = {};
            const watcher = {
                paths,
                options,
                closed: false,
                on(event: string, handler: (event: string, path: string) => void) {
                    handlers[event] = handler;
                    return watcher;
                },
                fire(event: string, path: string) {
                    handlers.all?.(event, path);
                },
                async close() {
                    watcher.closed = true;
                },
            };
            created.push(watcher);
            return watcher;
        },
    };

    return { chokidar, created };
}

const REPO = '/repo';

describe('classifyRelPath', () => {
    it('maps working-tree paths to worktree and ref paths to refs', () => {
        expect(classifyRelPath('src/main.ts')).toBe('worktree');
        expect(classifyRelPath('.git/HEAD')).toBe('refs');
        expect(classifyRelPath('.git/packed-refs')).toBe('refs');
        expect(classifyRelPath('.git/refs/heads/main')).toBe('refs');
    });

    it('ignores git churn, node_modules, and non-repo paths', () => {
        expect(classifyRelPath('')).toBeNull();
        expect(classifyRelPath('../outside')).toBeNull();
        expect(classifyRelPath('node_modules/vue/index.js')).toBeNull();
        expect(classifyRelPath('.git/objects/ab/cdef')).toBeNull();
        expect(classifyRelPath('.git/index')).toBeNull();
        expect(classifyRelPath('.git/logs/HEAD')).toBeNull();
    });
});

describe('worktreeIgnored', () => {
    it('keeps working-tree files but skips .git and node_modules', () => {
        expect(worktreeIgnored(REPO, REPO)).toBe(false);
        expect(worktreeIgnored(REPO, '/repo/src/main.ts')).toBe(false);
        expect(worktreeIgnored(REPO, '/repo/.git/refs/heads/main')).toBe(true);
        expect(worktreeIgnored(REPO, '/repo/node_modules/vue/index.js')).toBe(true);
        expect(worktreeIgnored(REPO, '/repo/packages/app/node_modules/x')).toBe(true);
    });
});

describe('refWatchPaths', () => {
    it('watches only HEAD, packed-refs, and refs/ inside .git', () => {
        expect(refWatchPaths('/repo/.git')).toEqual([
            '/repo/.git/HEAD',
            '/repo/.git/packed-refs',
            '/repo/.git/refs',
        ]);
    });
});

describe('coalesceReason', () => {
    it('lets refs outrank worktree', () => {
        expect(coalesceReason(new Set(['worktree']))).toBe('worktree');
        expect(coalesceReason(new Set(['refs']))).toBe('refs');
        expect(coalesceReason(new Set(['worktree', 'refs']))).toBe('refs');
    });
});

describe('RepoWatcher (native recursive backend)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function makeWatcher(onChange: (event: unknown) => void, debounceMs = 250) {
        const { fsWatch, created } = fakeFsWatch();
        const watcher = new RepoWatcher(REPO, onChange, { fsWatch, debounceMs }).start();
        return { watcher, created };
    }

    it('uses one recursive watcher over the repo root', () => {
        const { created } = makeWatcher(() => {});

        expect(created).toHaveLength(1);
        expect(created[0].target).toBe(REPO);
        expect(created[0].options.recursive).toBe(true);
    });

    it('coalesces a burst of working-tree events into one debounced change', () => {
        const onChange = vi.fn<(event: unknown) => void>();
        const { created } = makeWatcher(onChange);

        created[0].fire('change', 'a.ts');
        created[0].fire('change', 'b.ts');
        vi.advanceTimersByTime(100);
        created[0].fire('rename', 'c.ts');

        expect(onChange).not.toHaveBeenCalled();
        vi.advanceTimersByTime(250);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toMatchObject({ reason: 'worktree' });
    });

    it('reports refs when a ref change is part of the burst', () => {
        const onChange = vi.fn<(event: unknown) => void>();
        const { created } = makeWatcher(onChange);

        created[0].fire('change', 'a.ts');
        created[0].fire('change', '.git/HEAD');
        vi.advanceTimersByTime(250);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toMatchObject({ reason: 'refs' });
    });

    it('does not refresh on git churn or node_modules changes', () => {
        const onChange = vi.fn<(event: unknown) => void>();
        const { created } = makeWatcher(onChange);

        created[0].fire('change', '.git/objects/ab/cdef');
        created[0].fire('change', '.git/index');
        created[0].fire('change', 'node_modules/vue/index.js');
        vi.advanceTimersByTime(250);

        expect(onChange).not.toHaveBeenCalled();
    });

    it('emits a fresh change for a new burst after the first flush', () => {
        const onChange = vi.fn<(event: unknown) => void>();
        const { created } = makeWatcher(onChange);

        created[0].fire('change', '.git/refs/heads/main');
        vi.advanceTimersByTime(250);
        created[0].fire('change', 'a.ts');
        vi.advanceTimersByTime(250);

        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange.mock.calls[0][0]).toMatchObject({ reason: 'refs' });
        expect(onChange.mock.calls[1][0]).toMatchObject({ reason: 'worktree' });
    });

    it('closes the watcher and cancels a pending flush', async () => {
        const onChange = vi.fn<(event: unknown) => void>();
        const { watcher, created } = makeWatcher(onChange);

        created[0].fire('change', 'a.ts');
        await watcher.close();
        vi.advanceTimersByTime(250);

        expect(created[0].closed).toBe(true);
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('RepoWatcher (chokidar fallback)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function makeWatcher(onChange: (event: unknown) => void) {
        const { chokidar, created } = fakeChokidar();
        const watcher = new RepoWatcher(REPO, onChange, {
            fsWatch: unsupportedFsWatch(),
            chokidar,
            gitDir: '/repo/.git',
            debounceMs: 250,
        }).start();
        return { watcher, created };
    }

    it('falls back to two scoped chokidar watchers when recursive is unsupported', () => {
        const { created } = makeWatcher(() => {});

        expect(created).toHaveLength(2);
        const [worktree, refs] = created;
        expect(worktree.paths).toBe(REPO);
        expect(worktree.options.ignoreInitial).toBe(true);
        expect(refs.paths).toEqual([
            '/repo/.git/HEAD',
            '/repo/.git/packed-refs',
            '/repo/.git/refs',
        ]);
    });

    it('coalesces events across both fallback watchers, refs winning', () => {
        const onChange = vi.fn<(event: unknown) => void>();
        const { created } = makeWatcher(onChange);
        const [worktree, refs] = created;

        worktree.fire('change', '/repo/a.ts');
        refs.fire('change', '/repo/.git/HEAD');
        vi.advanceTimersByTime(250);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toMatchObject({ reason: 'refs' });
    });

    it('closes both fallback watchers', async () => {
        const { watcher, created } = makeWatcher(() => {});
        await watcher.close();
        expect(created.every((w) => w.closed)).toBe(true);
    });
});
