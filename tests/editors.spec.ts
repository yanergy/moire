import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// editors.ts probes the filesystem (macOS app bundles) and PATH (CLI launchers) and
// spawns a launcher to open a file. Back those node built-ins with controllable
// stubs so detection and opening are testable without a real editor or a specific
// OS. execFile is stubbed callback-style so the module's real promisify wraps it.
const state = vi.hoisted(() => ({
    access: vi.fn<(p: string) => Promise<void>>(),
    execFile: vi.fn<(...args: unknown[]) => void>(),
    homedir: vi.fn<() => string>(() => '/Users/test'),
}));

// Provide a default export alongside the named ones: these built-ins are also
// imported as `import x from '...'` elsewhere, so vitest's ESM interop expects it.
vi.mock('node:fs/promises', () => ({ default: { access: state.access }, access: state.access }));
vi.mock('node:os', () => ({ default: { homedir: state.homedir }, homedir: state.homedir }));
vi.mock('node:child_process', () => ({
    default: { execFile: state.execFile },
    execFile: state.execFile,
}));

async function loadEditors() {
    vi.resetModules();
    return import('../electron/editors');
}

// Swap process.platform for a test, restoring it after.
const realPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('editor detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: nothing installed, and every spawn succeeds.
        state.access.mockRejectedValue(new Error('not found'));
        state.execFile.mockImplementation((...args: unknown[]) => {
            (args[args.length - 1] as (e: unknown) => void)(null);
        });
    });
    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
    });

    it('detects installed macOS app bundles, in catalog order', async () => {
        setPlatform('darwin');
        const installed = new Set([
            '/Applications/PhpStorm.app',
            '/Applications/Visual Studio Code.app',
        ]);
        state.access.mockImplementation((p: string) =>
            installed.has(p) ? Promise.resolve() : Promise.reject(new Error('nope'))
        );

        const { detectEditors } = await loadEditors();
        const found = await detectEditors();

        expect(found.map((e) => e.id)).toEqual(['phpstorm', 'vscode']);
        expect(found[0]).toMatchObject({ kind: 'mac-app', target: '/Applications/PhpStorm.app' });
    });

    it('returns nothing on macOS when no editor is installed', async () => {
        setPlatform('darwin'); // access rejects everything by default
        const { detectEditors } = await loadEditors();
        expect(await detectEditors()).toEqual([]);
    });

    it('falls back to the full CLI catalog off macOS when none are on PATH', async () => {
        setPlatform('linux');
        // Every `which`/`where` fails, so detection finds nothing.
        state.execFile.mockImplementation((...args: unknown[]) => {
            (args[args.length - 1] as (e: unknown) => void)(new Error('not found'));
        });

        const { detectEditors, EDITOR_CATALOG } = await loadEditors();
        const found = await detectEditors();

        expect(found).toHaveLength(EDITOR_CATALOG.filter((e) => e.cli).length);
        expect(found.every((e) => e.kind === 'cli')).toBe(true);
    });

    it('opens a mac app with `open -a <app> <file>` and reports success', async () => {
        setPlatform('darwin');
        const { openWithEditor } = await loadEditors();

        const error = await openWithEditor(
            {
                id: 'phpstorm',
                label: 'PhpStorm',
                kind: 'mac-app',
                target: '/Applications/PhpStorm.app',
            },
            '/repo/src/a.ts'
        );

        expect(error).toBe('');
        expect(state.execFile).toHaveBeenCalledWith(
            'open',
            ['-a', '/Applications/PhpStorm.app', '/repo/src/a.ts'],
            expect.any(Function)
        );
    });

    it('returns the error message when the launcher fails', async () => {
        const { openWithEditor } = await loadEditors();
        state.execFile.mockImplementation((...args: unknown[]) => {
            (args[args.length - 1] as (e: unknown) => void)(new Error('spawn boom'));
        });

        const error = await openWithEditor(
            { id: 'code', label: 'VS Code', kind: 'cli', target: 'code' },
            '/repo/src/a.ts'
        );

        expect(error).toBe('spawn boom');
    });
});
