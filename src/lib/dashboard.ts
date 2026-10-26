// Presentation helpers for the GitHub dashboard: the status dot and CI icon of a
// PR row, and the notice shown when the dashboard cannot load. Kept out of the components so they stay unit-testable.

import type { Component } from 'vue';
import { CircleCheck, CircleDot, CircleX } from '@lucide/vue';
import type { DashboardPr, PrStatus } from '@/shared/types';

// The status dot before a PR row, in the toolbar PR button's colors: gray draft,
// purple merged, red closed, yellow changes requested, green open.
export function prDotClass(pr: DashboardPr): string {
    if (pr.isDraft && pr.state === 'OPEN') return 'bg-moire-pr-draft';
    if (pr.state === 'MERGED') return 'bg-moire-pr-merged';
    if (pr.state === 'CLOSED') return 'bg-moire-pr-closed';
    if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'bg-moire-changes-fg';
    return 'bg-moire-pr-open';
}

// The CI icon at the end of a PR row, colored like the PR view's Checks tab (only
// passing and failing get a color). Null when no checks ran.
export function ciVisual(pr: DashboardPr): { icon: Component; cls: string; label: string } | null {
    switch (pr.ci) {
        case 'passing':
            return { icon: CircleCheck, cls: 'text-moire-status-a', label: 'Checks passed' };
        case 'failing':
            return {
                icon: CircleX,
                cls: 'text-moire-status-d',
                label: pr.failedChecks.length
                    ? `Failed: ${pr.failedChecks.join(', ')}`
                    : 'Checks failed',
            };
        case 'pending':
            return { icon: CircleDot, cls: 'text-moire-faint', label: 'Checks running' };
        default:
            return null;
    }
}

// Why the dashboard has no (fresh) data, as a title and a hint. Null when the
// last load succeeded.
export function dashboardNotice(
    status: PrStatus,
    message?: string
): { title: string; detail: string } | null {
    switch (status) {
        case 'not-installed':
            return {
                title: 'The GitHub CLI (gh) was not found',
                detail: 'Install gh to see pull requests here.',
            };
        case 'not-authenticated':
            return {
                title: 'gh is not signed in to GitHub',
                detail: 'Run gh auth login, or switch accounts from the Git menu.',
            };
        case 'not-a-github-repo':
            return {
                title: 'This repository has no GitHub remote',
                detail: 'The dashboard only works for repositories hosted on GitHub.',
            };
        case 'error':
            return {
                title: 'Could not load pull requests from GitHub',
                detail: message || 'gh could not reach GitHub. Try refreshing.',
            };
        default:
            return null;
    }
}
