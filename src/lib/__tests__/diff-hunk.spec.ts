import { describe, it, expect } from 'vitest';
import { parseHunkTail } from '@/lib/diff-hunk';

describe('parseHunkTail', () => {
    it('numbers each line on its sides and keeps the last four', () => {
        const hunk = [
            '@@ -10,4 +10,5 @@ function a() {',
            ' one',
            '-two',
            '+two!',
            '+three',
            ' four',
        ].join('\n');

        expect(parseHunkTail(hunk)).toEqual([
            { kind: 'del', oldLine: 11, newLine: null, text: 'two' },
            { kind: 'add', oldLine: null, newLine: 11, text: 'two!' },
            { kind: 'add', oldLine: null, newLine: 12, text: 'three' },
            { kind: 'context', oldLine: 12, newLine: 13, text: 'four' },
        ]);
    });

    it('skips the no-newline marker and reads a single-line header', () => {
        const hunk = ['@@ -1 +1 @@', '-a', '\\ No newline at end of file', '+b'].join('\n');

        expect(parseHunkTail(hunk)).toEqual([
            { kind: 'del', oldLine: 1, newLine: null, text: 'a' },
            { kind: 'add', oldLine: null, newLine: 1, text: 'b' },
        ]);
    });

    it('gives no lines for something that is not a hunk', () => {
        expect(parseHunkTail('')).toEqual([]);
        expect(parseHunkTail('just text')).toEqual([]);
    });
});
