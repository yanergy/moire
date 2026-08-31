import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitService, WORKING_TREE } from '../electron/git/GitService';

// GitService takes an injectable git so its orchestration is testable without a
// real repo (parsing itself is covered in parsers.spec.ts). Each fake stubs only
// the simple-git methods the case under test reaches.

interface BranchSummary {
    all: string[];
    current: string;
}

describe('GitService.branches', () => {
    it('lists locals first (current flagged), then remotes, dropping origin/HEAD', async () => {
        const git = {
            branchLocal: vi
                .fn<() => Promise<BranchSummary>>()
                .mockResolvedValue({ all: ['main', 'feature'], current: 'main' }),
            branch: vi.fn<(args: string[]) => Promise<{ all: string[] }>>().mockResolvedValue({
                all: ['origin/HEAD -> origin/main', 'origin/main', 'origin/feature'],
            }),
        };
        const service = new GitService('/repo', git);

        expect(await service.branches()).toEqual([
            { name: 'main', kind: 'local', isCurrent: true },
            { name: 'feature', kind: 'local' },
            { name: 'origin/main', kind: 'remote' },
            { name: 'origin/feature', kind: 'remote' },
        ]);
    });
});

describe('GitService.rangeArgs', () => {
    const service = new GitService('/repo', {});

    it('uses three-dot merge-base by default', () => {
        expect(service.rangeArgs('main', 'feature', 'merge-base')).toEqual(['main...feature']);
    });

    it('uses two-dot for a direct comparison', () => {
        expect(service.rangeArgs('main', 'feature', 'direct')).toEqual(['main..feature']);
    });

    it('drops the second ref when the head is the working tree', () => {
        expect(service.rangeArgs('main', 'WORKING TREE', 'merge-base')).toEqual(['main']);
    });
});

describe('GitService.changedFiles', () => {
    it('runs both porcelain passes over the range and merges them', async () => {
        const raw = vi.fn<(args: string[]) => Promise<string>>(async (args) => {
            return args.includes('--name-status')
                ? 'A\x00new.ts\x00R100\x00old.ts\x00moved.ts\x00'
                : '3\t0\tnew.ts\x002\t1\t\x00old.ts\x00moved.ts\x00';
        });
        const service = new GitService('/repo', { raw });

        const files = await service.changedFiles('main', 'feature', 'merge-base');

        expect(files).toEqual([
            { path: 'new.ts', status: 'A', additions: 3, deletions: 0, binary: false },
            {
                path: 'moved.ts',
                oldPath: 'old.ts',
                status: 'R',
                additions: 2,
                deletions: 1,
                binary: false,
            },
        ]);
        expect(raw.mock.calls[0][0]).toEqual([
            'diff',
            '--name-status',
            '-M',
            '-z',
            'main...feature',
        ]);
    });

    it('does not list untracked files for a branch-to-branch comparison', async () => {
        const raw = vi.fn<(args: string[]) => Promise<string>>(async () => '');
        await new GitService('/repo', { raw }).changedFiles('main', 'feature', 'merge-base');

        expect(raw.mock.calls.some((call) => call[0].includes('ls-files'))).toBe(false);
    });

    it('folds untracked files into the working-tree change set as adds', async () => {
        const repo = await mkdtemp(path.join(tmpdir(), 'moire-untracked-'));
        await writeFile(path.join(repo, 'new.txt'), 'one\ntwo\nthree\n');
        await writeFile(path.join(repo, 'logo.png'), 'PNG\x00\x01binary');

        const raw = vi.fn<(args: string[]) => Promise<string>>(async (args) => {
            if (args.includes('--name-status')) return 'M\x00tracked.ts\x00';
            if (args.includes('--numstat')) return '2\t1\ttracked.ts\x00';
            return 'new.txt\x00logo.png\x00'; // git ls-files --others
        });

        const files = await new GitService(repo, { raw }).changedFiles(
            'main',
            'WORKING TREE',
            'merge-base'
        );

        expect(files).toEqual([
            { path: 'tracked.ts', status: 'M', additions: 2, deletions: 1, binary: false },
            { path: 'new.txt', status: 'A', additions: 3, deletions: 0, binary: false },
            { path: 'logo.png', status: 'A', additions: 0, deletions: 0, binary: true },
        ]);
        expect(raw.mock.calls.some((call) => call[0].includes('ls-files'))).toBe(true);
    });
});

describe('GitService.filePair', () => {
    it('returns both sides and the inferred language for a modified file', async () => {
        const show = vi.fn<(options: string[]) => Promise<string>>(async ([spec]) =>
            spec.startsWith('main:') ? 'old\n' : 'new\n'
        );
        const service = new GitService('/repo', { show });

        const pair = await service.filePair('main', 'feature', 'src/a.ts', 'direct');

        expect(pair).toEqual({
            path: 'src/a.ts',
            oldContent: 'old\n',
            newContent: 'new\n',
            language: 'typescript',
            binary: false,
            tooLarge: false,
            sizeBytes: 4, // 'new\n' is the larger (equal) side
        });
    });

    it('nulls the base side of an added file (absent at base)', async () => {
        const show = vi.fn<(options: string[]) => Promise<string>>(async ([spec]) => {
            if (spec.startsWith('main:')) {
                throw new Error("path 'src/b.ts' does not exist in 'main'");
            }

            return 'added\n';
        });

        const pair = await new GitService('/repo', { show }).filePair(
            'main',
            'feature',
            'src/b.ts',
            'direct'
        );
        expect(pair.oldContent).toBeNull();
        expect(pair.newContent).toBe('added\n');
    });

    it('flags a file over the render threshold and reports its size', async () => {
        const big = 'x'.repeat(512 * 1024 + 10);
        const show = vi.fn<(options: string[]) => Promise<string>>(async () => big);
        const pair = await new GitService('/repo', { show }).filePair(
            'main',
            'feature',
            'big.txt',
            'direct'
        );

        expect(pair.tooLarge).toBe(true);
        expect(pair.sizeBytes).toBe(big.length);
        // Content is still returned; the renderer gates it behind "Load diff".
        expect(pair.oldContent).toBe(big);
    });

    it('withholds binary content and flags it', async () => {
        const show = vi.fn<(options: string[]) => Promise<string>>(async () => 'ELF\x00\x01binary');
        const pair = await new GitService('/repo', { show }).filePair(
            'main',
            'feature',
            'app.bin',
            'direct'
        );

        expect(pair.binary).toBe(true);
        expect(pair.oldContent).toBeNull();
        expect(pair.newContent).toBeNull();
    });

    it('reads the old side at the merge base in merge-base mode', async () => {
        const raw = vi.fn<(args: string[]) => Promise<string>>(async (args) =>
            args[0] === 'merge-base' ? 'abc123\n' : ''
        );
        const show = vi.fn<(options: string[]) => Promise<string>>(async ([spec]) =>
            spec.startsWith('abc123:') ? 'ancestor\n' : 'new\n'
        );
        const service = new GitService('/repo', { raw, show });

        const pair = await service.filePair('main', 'feature', 'src/a.ts', 'merge-base');

        // The old side is the file at the merge base commit, matching what the
        // changed-file list diffed against (`base...head`), not the base tip.
        expect(raw).toHaveBeenCalledWith(['merge-base', 'main', 'feature']);
        expect(show).toHaveBeenCalledWith(['abc123:src/a.ts']);
        expect(pair.oldContent).toBe('ancestor\n');
        expect(pair.newContent).toBe('new\n');
    });

    it('reads the old side at the base tip in direct mode, without a merge-base lookup', async () => {
        const raw = vi.fn<(args: string[]) => Promise<string>>(async () => '');
        const show = vi.fn<(options: string[]) => Promise<string>>(async ([spec]) =>
            spec.startsWith('main:') ? 'base\n' : 'new\n'
        );
        const service = new GitService('/repo', { raw, show });

        const pair = await service.filePair('main', 'feature', 'src/a.ts', 'direct');

        expect(raw).not.toHaveBeenCalled();
        expect(show).toHaveBeenCalledWith(['main:src/a.ts']);
        expect(pair.oldContent).toBe('base\n');
    });
});

describe('GitService.filePair images', () => {
    const oldPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const newPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);

    type BlobReader = (ref: string, filePath: string) => Promise<Buffer | null>;
    type DiskReader = (filePath: string) => Promise<Buffer | null>;

    it('previews an image as before/after data URIs, withholding text content', async () => {
        const readBlobBytes = vi.fn<BlobReader>(async (ref) => (ref === 'main' ? oldPng : newPng));
        const service = new GitService('/repo', {}, { readBlobBytes });

        const pair = await service.filePair('main', 'feature', 'assets/logo.png', 'direct');

        expect(pair.image).toBe(true);
        expect(pair.binary).toBe(true);
        expect(pair.oldImage).toBe(`data:image/png;base64,${oldPng.toString('base64')}`);
        expect(pair.newImage).toBe(`data:image/png;base64,${newPng.toString('base64')}`);
        expect(pair.oldContent).toBeNull();
        expect(pair.newContent).toBeNull();
    });

    it('reads the working-tree side from disk for an image', async () => {
        const readBlobBytes = vi.fn<BlobReader>(async () => oldPng);
        const readDiskBytes = vi.fn<DiskReader>(async () => newPng);
        const service = new GitService('/repo', {}, { readBlobBytes, readDiskBytes });

        const pair = await service.filePair('main', WORKING_TREE, 'logo.png', 'merge-base');

        expect(readDiskBytes).toHaveBeenCalledWith('logo.png');
        expect(pair.newImage).toBe(`data:image/png;base64,${newPng.toString('base64')}`);
    });

    it('nulls the missing side of an added image', async () => {
        const readBlobBytes = vi.fn<BlobReader>(async (ref) => (ref === 'main' ? null : newPng));
        const service = new GitService('/repo', {}, { readBlobBytes });

        const pair = await service.filePair('main', 'feature', 'new.png', 'direct');

        expect(pair.oldImage).toBeNull();
        expect(pair.newImage).toContain('base64,');
    });

    it('falls back to a plain binary notice for an oversized image', async () => {
        const huge = Buffer.alloc(7 * 1024 * 1024); // over the 6 MB inline cap
        const readBlobBytes = vi.fn<BlobReader>(async () => huge);
        const service = new GitService('/repo', {}, { readBlobBytes });

        const pair = await service.filePair('main', 'feature', 'big.png', 'direct');

        expect(pair.image).toBe(false);
        expect(pair.binary).toBe(true);
        expect(pair.oldImage).toBeNull();
        expect(pair.newImage).toBeNull();
        expect(pair.sizeBytes).toBe(huge.length);
    });
});
