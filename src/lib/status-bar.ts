// Pure formatters for the diff pane's status bar, kept out of the component so
// the line-ending detection and the "synced N ago" wording stay unit-testable.

// The dominant line ending in a file's content, or '' when there is none to
// report (empty content, a single line with no newline, or a binary file whose
// text is withheld). Returns 'Mixed' when both styles occur, so a file that would
// silently normalize on save is visible rather than mislabeled.
export function detectEol(text: string | null): string {
    if (!text) {
        return '';
    }

    const crlf = (text.match(/\r\n/g) ?? []).length;
    const lf = (text.match(/\n/g) ?? []).length - crlf;
    if (crlf > 0 && lf > 0) {
        return 'Mixed';
    }
    if (crlf > 0) {
        return 'CRLF';
    }
    if (lf > 0) {
        return 'LF';
    }

    return '';
}

// Human "time since last sync" for the status bar, coarsening as it ages. `from`
// is the sync timestamp and `to` is now (both epoch ms); a future or near-equal
// timestamp reads as "just now".
export function timeSince(from: number, to: number): string {
    const seconds = Math.floor((to - from) / 1000);
    if (seconds < 5) {
        return 'just now';
    }
    if (seconds < 60) {
        return `${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }

    return `${Math.floor(hours / 24)}d ago`;
}
