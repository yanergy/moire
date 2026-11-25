import { describe, it, expect } from 'vitest';
import type { PrComment, PrReviewThread } from '@/shared/types';
import { previewText, reviewActivityByLogin } from '@/lib/review-activity';

const entry = (over: Partial<PrComment>): PrComment => ({
    author: 'ann',
    body: '',
    createdAt: '2026-09-01T00:00:00Z',
    kind: 'review',
    id: '',
    canEdit: false,
    canDelete: false,
    ...over,
});

const thread = (comments: Partial<PrReviewThread['comments'][number]>[]): PrReviewThread => ({
    id: 'RT_1',
    path: 'src/a.ts',
    line: 3,
    originalLine: null,
    side: 'RIGHT',
    isResolved: false,
    isOutdated: false,
    isPending: false,
    comments: comments.map((c, i) => ({
        id: `RC_${i}`,
        author: 'ann',
        body: '',
        createdAt: '',
        isPending: false,
        viewerDidAuthor: false,
        canEdit: false,
        canDelete: false,
        ...c,
    })),
});

describe('previewText', () => {
    it('squashes Markdown to one plain line', () => {
        expect(previewText('## Looks **good**\n\nSee [the docs](https://x.y) and `code`.')).toBe(
            'Looks good See the docs and code.'
        );
    });
});

describe('reviewActivityByLogin', () => {
    it("lists a reviewer's reviews and line comments, oldest first, with their jump targets", () => {
        const activity = reviewActivityByLogin(
            [
                entry({ kind: 'comment', author: 'ann', body: 'plain comment' }),
                entry({ state: 'APPROVED', body: 'Ship it', createdAt: '2026-09-03T00:00:00Z' }),
                entry({ author: 'bob', state: 'COMMENTED' }),
            ],
            [
                thread([
                    { body: 'this can race', createdAt: '2026-09-02T00:00:00Z' },
                    { author: 'bob', body: 'fixed', createdAt: '2026-09-04T00:00:00Z' },
                    { body: 'draft', isPending: true, createdAt: '2026-09-05T00:00:00Z' },
                ]),
            ]
        );

        // A plain conversation comment is not a review, and a pending one is not
        // on the PR yet.
        expect(activity.get('ann')).toEqual([
            {
                key: 'comment:RC_0',
                kind: 'line',
                path: 'src/a.ts',
                preview: 'this can race',
                createdAt: '2026-09-02T00:00:00Z',
                target: { thread: 'RT_1' },
            },
            {
                key: 'entry:1',
                kind: 'review',
                state: 'APPROVED',
                preview: 'Ship it',
                createdAt: '2026-09-03T00:00:00Z',
                target: { entry: 1 },
            },
        ]);
        expect(activity.get('bob')!.map((a) => a.target)).toEqual([
            { entry: 2 },
            { thread: 'RT_1' },
        ]);
    });
});
