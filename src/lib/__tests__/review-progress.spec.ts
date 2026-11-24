import { describe, it, expect } from 'vitest';
import type { PrReviewer } from '@/shared/types';
import { reviewProgress, reviewSummary } from '@/lib/review-progress';

const reviewer = (login: string, state: PrReviewer['state'], rerequested = false): PrReviewer => ({
    login,
    kind: 'user',
    state,
    rerequested,
});

describe('reviewProgress', () => {
    it('counts the reviewers by state', () => {
        expect(
            reviewProgress([
                reviewer('a', 'APPROVED'),
                reviewer('b', 'APPROVED'),
                reviewer('c', 'CHANGES_REQUESTED'),
                reviewer('d', 'PENDING'),
                reviewer('e', 'COMMENTED'),
            ])
        ).toEqual({ approved: 2, changesRequested: 1, pending: 1, commented: 1, total: 5 });
    });
});

describe('reviewProgress with a re-request', () => {
    it('counts a re-requested reviewer under their verdict and as pending', () => {
        expect(reviewProgress([reviewer('a', 'APPROVED', true)])).toMatchObject({
            approved: 1,
            pending: 1,
            total: 1,
        });
    });
});

describe('reviewSummary', () => {
    it('leads with the approvals over all reviewers', () => {
        expect(
            reviewSummary(reviewProgress([reviewer('a', 'APPROVED'), reviewer('b', 'PENDING')]))
        ).toBe('1/2 approved · 1 pending');
    });

    it('adds the change requests', () => {
        expect(
            reviewSummary(
                reviewProgress([reviewer('a', 'CHANGES_REQUESTED'), reviewer('b', 'COMMENTED')])
            )
        ).toBe('0/2 approved · 1 requested changes');
    });

    it('is empty without reviewers', () => {
        expect(reviewSummary(reviewProgress([]))).toBe('');
    });
});
