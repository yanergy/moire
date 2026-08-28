import { describe, it, expect } from 'vitest';
import {
    parseNameStatus,
    parseNumstat,
    parseNulPaths,
    mergeChangedFiles,
} from '../electron/git/parsers.cjs';

// The inputs below mirror the exact `-z` bytes `git diff` emits (NUL as \x00,
// TAB as \t), captured from a real repo with a modify, add, binary change,
// rename-with-edit (path containing a space), and delete.

const NAME_STATUS =
    'M\x00a.txt\x00' +
    'A\x00added.txt\x00' +
    'M\x00blob.bin\x00' +
    'R065\x00dir/old name.txt\x00dir/new name.txt\x00' +
    'D\x00keep.txt\x00';

const NUMSTAT =
    '2\t1\ta.txt\x00' +
    '1\t0\tadded.txt\x00' +
    '-\t-\tblob.bin\x00' +
    '1\t0\t\x00dir/old name.txt\x00dir/new name.txt\x00' +
    '0\t1\tkeep.txt\x00';

describe('parseNameStatus', () => {
    it('reads each status and path from the NUL-separated stream', () => {
        const files = parseNameStatus(NAME_STATUS);
        expect(files).toEqual([
            { status: 'M', path: 'a.txt' },
            { status: 'A', path: 'added.txt' },
            { status: 'M', path: 'blob.bin' },
            { status: 'R', oldPath: 'dir/old name.txt', path: 'dir/new name.txt' },
            { status: 'D', path: 'keep.txt' },
        ]);
    });

    it('keeps the new path and old path for a rename, dropping the score', () => {
        const [file] = parseNameStatus('R100\x00old/name.ts\x00new/name.ts\x00');
        expect(file).toEqual({ status: 'R', oldPath: 'old/name.ts', path: 'new/name.ts' });
    });

    it('folds a copy into a rename and a type change into a modification', () => {
        const files = parseNameStatus('C075\x00src.ts\x00copy.ts\x00T\x00link\x00');
        expect(files).toEqual([
            { status: 'R', oldPath: 'src.ts', path: 'copy.ts' },
            { status: 'M', path: 'link' },
        ]);
    });

    it('returns nothing for empty output', () => {
        expect(parseNameStatus('')).toEqual([]);
    });
});

describe('parseNumstat', () => {
    it('reads additions and deletions keyed by path', () => {
        const counts = parseNumstat(NUMSTAT);
        expect(counts.get('a.txt')).toEqual({ additions: 2, deletions: 1, binary: false });
        expect(counts.get('added.txt')).toEqual({ additions: 1, deletions: 0, binary: false });
    });

    it('flags binary files (both counts are a dash) with zeroed counts', () => {
        const counts = parseNumstat(NUMSTAT);
        expect(counts.get('blob.bin')).toEqual({ additions: 0, deletions: 0, binary: true });
    });

    it('keys a rename on the new path, past the empty path field', () => {
        const counts = parseNumstat(NUMSTAT);
        expect(counts.has('dir/old name.txt')).toBe(false);
        expect(counts.get('dir/new name.txt')).toEqual({
            additions: 1,
            deletions: 0,
            binary: false,
        });
    });
});

describe('parseNulPaths', () => {
    it('splits the untracked-file list and drops the trailing empty token', () => {
        expect(parseNulPaths('new.ts\x00dir/with space.txt\x00')).toEqual([
            'new.ts',
            'dir/with space.txt',
        ]);
    });

    it('returns nothing for empty output', () => {
        expect(parseNulPaths('')).toEqual([]);
    });
});

describe('mergeChangedFiles', () => {
    it('joins statuses with their line counts and binary flag', () => {
        const files = mergeChangedFiles(parseNameStatus(NAME_STATUS), parseNumstat(NUMSTAT));
        expect(files).toEqual([
            { path: 'a.txt', status: 'M', additions: 2, deletions: 1, binary: false },
            { path: 'added.txt', status: 'A', additions: 1, deletions: 0, binary: false },
            { path: 'blob.bin', status: 'M', additions: 0, deletions: 0, binary: true },
            {
                path: 'dir/new name.txt',
                oldPath: 'dir/old name.txt',
                status: 'R',
                additions: 1,
                deletions: 0,
                binary: false,
            },
            { path: 'keep.txt', status: 'D', additions: 0, deletions: 1, binary: false },
        ]);
    });

    it('defaults to zero counts when a file is absent from numstat', () => {
        const [file] = mergeChangedFiles([{ status: 'M', path: 'only.ts' }], new Map());
        expect(file).toEqual({
            path: 'only.ts',
            status: 'M',
            additions: 0,
            deletions: 0,
            binary: false,
        });
    });
});
