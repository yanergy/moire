import { describe, it, expect, vi } from 'vitest';
import { GitService } from '../electron/git/GitService.cjs';

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
});

describe('GitService.filePair', () => {
    it('returns both sides and the inferred language for a modified file', async () => {
        const show = vi.fn<(options: string[]) => Promise<string>>(async ([spec]) =>
            spec.startsWith('main:') ? 'old\n' : 'new\n'
        );
        const service = new GitService('/repo', { show });

        const pair = await service.filePair('main', 'feature', 'src/a.ts');

        expect(pair).toEqual({
            path: 'src/a.ts',
            oldContent: 'old\n',
            newContent: 'new\n',
            language: 'typescript',
            binary: false,
            tooLarge: false,
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
            'src/b.ts'
        );
        expect(pair.oldContent).toBeNull();
        expect(pair.newContent).toBe('added\n');
    });

    it('withholds binary content and flags it', async () => {
        const show = vi.fn<(options: string[]) => Promise<string>>(async () => 'PNG\x00\x01binary');
        const pair = await new GitService('/repo', { show }).filePair(
            'main',
            'feature',
            'logo.png'
        );

        expect(pair.binary).toBe(true);
        expect(pair.oldContent).toBeNull();
        expect(pair.newContent).toBeNull();
    });
});
