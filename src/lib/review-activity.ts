import type { PrComment, PrReviewThread } from '@/shared/types';

// What a reviewer left on the PR, for their row in the Reviewers tab: each review
// they submitted (an entry in the conversation) and each line comment they wrote in
// a review thread, oldest first. Shown as one short line each, with a jump to it in
// the conversation, so the text is only a one-line preview.
export type ReviewActivityTarget = { entry: number } | { thread: string };

export interface ReviewActivity {
    key: string;
    kind: 'review' | 'line';
    // A review's verdict (APPROVED, CHANGES_REQUESTED, COMMENTED); unset for a line
    // comment.
    state?: string;
    // The file a line comment is on.
    path?: string;
    preview: string;
    createdAt: string;
    target: ReviewActivityTarget;
}

// A Markdown body squashed to one line of plain text for the preview: no markup
// characters that read as noise, whitespace collapsed. The row truncates it.
export function previewText(body: string): string {
    return body
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[`*_>#~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// `entries` are the conversation's entries as rendered (their index is the jump
// target); `threads` are the PR's review threads. Pending (unsubmitted) line
// comments are left out, as they are not on the PR yet.
export function reviewActivityByLogin(
    entries: PrComment[],
    threads: PrReviewThread[]
): Map<string, ReviewActivity[]> {
    const byLogin = new Map<string, ReviewActivity[]>();
    const add = (login: string, item: ReviewActivity) => {
        if (!login) {
            return;
        }

        const list = byLogin.get(login) ?? [];
        list.push(item);
        byLogin.set(login, list);
    };

    entries.forEach((entry, index) => {
        if (entry.kind === 'review') {
            add(entry.author, {
                key: `entry:${index}`,
                kind: 'review',
                state: entry.state,
                preview: previewText(entry.body),
                createdAt: entry.createdAt,
                target: { entry: index },
            });
        }
    });

    for (const thread of threads) {
        for (const comment of thread.comments) {
            if (comment.isPending) {
                continue;
            }

            add(comment.author, {
                key: `comment:${comment.id}`,
                kind: 'line',
                path: thread.path,
                preview: previewText(comment.body),
                createdAt: comment.createdAt,
                target: { thread: thread.id },
            });
        }
    }

    for (const list of byLogin.values()) {
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    return byLogin;
}
