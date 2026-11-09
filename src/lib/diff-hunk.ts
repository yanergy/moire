// A review thread's diff hunk (GitHub's `diffHunk`: a unified diff hunk ending at
// the commented line) as numbered lines, so the PR view can show the code a
// comment is about, as GitHub does under a review.

export interface HunkLine {
    kind: 'add' | 'del' | 'context';
    // The line's number in the base (old) and head (new) file; null on the side it
    // is not in (an added line has no old number, a removed line no new one).
    oldLine: number | null;
    newLine: number | null;
    text: string;
}

const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// GitHub shows the last few lines of the hunk, which end on the commented line.
export const HUNK_TAIL_LINES = 4;

// Parse a hunk into its lines with their numbers, keeping the last `tail` lines.
// Anything that is not a hunk (no header) gives no lines.
export function parseHunkTail(diffHunk: string, tail = HUNK_TAIL_LINES): HunkLine[] {
    const [header, ...body] = diffHunk.split('\n');
    const match = HEADER.exec(header ?? '');
    if (!match) {
        return [];
    }

    let oldLine = Number(match[1]);
    let newLine = Number(match[2]);
    const lines: HunkLine[] = [];
    for (const raw of body) {
        const mark = raw.charAt(0);
        const text = raw.slice(1);
        if (mark === '+') {
            lines.push({ kind: 'add', oldLine: null, newLine: newLine++, text });
        } else if (mark === '-') {
            lines.push({ kind: 'del', oldLine: oldLine++, newLine: null, text });
        } else if (mark === ' ' || raw === '') {
            lines.push({ kind: 'context', oldLine: oldLine++, newLine: newLine++, text });
        }
        // "\ No newline at end of file" and anything else carries no line.
    }

    return lines.slice(-tail);
}
