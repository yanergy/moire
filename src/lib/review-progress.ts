import type { PrReviewer } from '@/shared/types';

// Where a PR's review stands, counted over its reviewers. Without branch protection
// data the number of required approvals is unknown, so `total` is everyone asked
// to review or who reviewed, matching the reviewers list.
export interface ReviewProgress {
    approved: number;
    changesRequested: number;
    pending: number;
    commented: number;
    total: number;
}

// A re-requested reviewer counts under their earlier verdict and as pending too,
// since a new response is still owed.
export function reviewProgress(reviewers: PrReviewer[]): ReviewProgress {
    const count = (state: PrReviewer['state']) => reviewers.filter((r) => r.state === state).length;
    return {
        approved: count('APPROVED'),
        changesRequested: count('CHANGES_REQUESTED'),
        pending: reviewers.filter((r) => r.state === 'PENDING' || r.rerequested).length,
        commented: count('COMMENTED'),
        total: reviewers.length,
    };
}

// The one-line summary under the Reviewers tab: "1/2 approved", then the change
// requests and the reviewers still to respond, e.g. "1/3 approved · 1 requested
// changes · 1 pending". Empty when there are no reviewers.
export function reviewSummary(progress: ReviewProgress): string {
    if (!progress.total) {
        return '';
    }

    const parts = [`${progress.approved}/${progress.total} approved`];
    if (progress.changesRequested) {
        parts.push(`${progress.changesRequested} requested changes`);
    }
    if (progress.pending) {
        parts.push(`${progress.pending} pending`);
    }

    return parts.join(' · ');
}
