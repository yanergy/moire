import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import {
    extractPath,
    mergePaths,
    resolvePath,
    repairPath,
    type DirExists,
    type ShellPathProbe,
} from '../electron/shell-path';

const MARKER = '__MOIRE_PATH__';
const sep = path.delimiter;

// The probe and the directory check are injected throughout, so no login shell is
// spawned and no real filesystem is read.
const probing =
    (value: string): ShellPathProbe =>
    async () =>
        `${MARKER}${value}${MARKER}`;
const holding =
    (...dirs: string[]): DirExists =>
    async (dir) =>
        dirs.includes(dir);
const noDirs = holding();

// A login shell that cannot be run, or that hangs past the probe timeout.
const failingProbe: ShellPathProbe = async () => {
    throw new Error('spawn /bin/zsh ETIMEDOUT');
};

describe('extractPath', () => {
    it('takes the PATH from between the markers, ignoring rc-file noise', () => {
        const output = `Welcome to your shell!\n${MARKER}/opt/homebrew/bin:/usr/bin${MARKER}`;
        expect(extractPath(output)).toBe('/opt/homebrew/bin:/usr/bin');
    });

    it('is empty when the shell printed no markers', () => {
        expect(extractPath('zsh: command not found\n')).toBe('');
    });
});

describe('mergePaths', () => {
    it('keeps the first occurrence of each directory so earlier lists win', () => {
        expect(mergePaths(`/a${sep}/b`, `/b${sep}/c`)).toBe(`/a${sep}/b${sep}/c`);
    });

    it('drops empty segments left by a trailing or doubled delimiter', () => {
        expect(mergePaths(`/a${sep}${sep}/b${sep}`)).toBe(`/a${sep}/b`);
    });
});

describe('resolvePath', () => {
    it('puts the login shell PATH ahead of the inherited one', async () => {
        const probe = probing(`/opt/homebrew/bin${sep}/usr/bin`);
        const resolved = await resolvePath(`/usr/bin${sep}/bin`, probe, noDirs);
        expect(resolved).toBe(`/opt/homebrew/bin${sep}/usr/bin${sep}/bin`);
    });

    it('appends well-known install directories that exist, at the lowest priority', async () => {
        const resolved = await resolvePath(
            '/bin',
            probing('/usr/bin'),
            holding('/opt/homebrew/bin')
        );
        expect(resolved).toBe(`/usr/bin${sep}/bin${sep}/opt/homebrew/bin`);
    });

    // The whole point of the fallback: a Finder launch whose shell probe fails must
    // still find a Homebrew-installed gh rather than report it as not installed.
    it('falls back to the known directories when the shell probe throws', async () => {
        const resolved = await resolvePath(
            `/usr/bin${sep}/bin`,
            failingProbe,
            holding('/opt/homebrew/bin')
        );
        expect(resolved).toBe(`/usr/bin${sep}/bin${sep}/opt/homebrew/bin`);
    });

    it('never repeats a directory another source already contributed', async () => {
        const resolved = await resolvePath(
            `/usr/local/bin${sep}/usr/bin`,
            probing('/usr/bin'),
            holding('/usr/local/bin')
        );
        expect(resolved).toBe(`/usr/bin${sep}/usr/local/bin`);
    });
});

describe('repairPath', () => {
    const originalPath = process.env.PATH;

    afterEach(() => {
        process.env.PATH = originalPath;
        vi.restoreAllMocks();
    });

    it('writes the resolved PATH back onto process.env so children inherit it', async () => {
        process.env.PATH = '/usr/bin';
        const resolved = await repairPath(probing(`/opt/homebrew/bin${sep}/usr/bin`), noDirs);

        expect(resolved).toBe(`/opt/homebrew/bin${sep}/usr/bin`);
        expect(process.env.PATH).toBe(resolved);
    });

    it('leaves PATH untouched on Windows, where a GUI process inherits the full env', async () => {
        process.env.PATH = 'C:\\Windows\\system32';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        const probe = vi.fn<ShellPathProbe>(probing('/opt/homebrew/bin'));

        expect(await repairPath(probe, noDirs)).toBe('C:\\Windows\\system32');
        expect(process.env.PATH).toBe('C:\\Windows\\system32');
        expect(probe).not.toHaveBeenCalled();
    });
});
