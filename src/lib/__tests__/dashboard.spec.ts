import { describe, it, expect } from 'vitest';
import { CircleCheck, CircleDot, CircleX } from '@lucide/vue';
import { ciVisual, dashboardNotice, prDotClass } from '@/lib/dashboard';
import type { DashboardPr } from '@/shared/types';

function pr(overrides: Partial<DashboardPr> = {}): DashboardPr {
    return {
        id: 'PR_1',
        number: 1,
        title: 'Add notifications',
        url: 'https://github.com/o/r/pull/1',
        author: 'me',
        isDraft: false,
        state: 'OPEN',
        mergedBy: '',
        baseRefName: 'main',
        headRefName: 'feat/x',
        isCrossRepository: false,
        createdAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-21T00:00:00Z',
        closedAt: '',
        additions: 10,
        deletions: 2,
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        ci: 'pending',
        failedChecks: [],
        reviews: [],
        ...overrides,
    };
}

describe('prDotClass', () => {
    it('colors a PR by its state, changes requested over open', () => {
        expect(prDotClass(pr())).toBe('bg-moire-pr-open');
        expect(prDotClass(pr({ isDraft: true }))).toBe('bg-moire-pr-draft');
        expect(prDotClass(pr({ reviewDecision: 'CHANGES_REQUESTED' }))).toBe('bg-moire-changes-fg');
        expect(prDotClass(pr({ state: 'MERGED' }))).toBe('bg-moire-pr-merged');
        expect(prDotClass(pr({ state: 'CLOSED', isDraft: true }))).toBe('bg-moire-pr-closed');
    });
});

describe('ciVisual', () => {
    it('maps the CI state to an icon, naming failed checks', () => {
        expect(ciVisual(pr({ ci: 'passing' }))?.icon).toBe(CircleCheck);
        expect(ciVisual(pr({ ci: 'pending' }))?.icon).toBe(CircleDot);
        expect(ciVisual(pr({ ci: 'failing', failedChecks: ['lint', 'test'] }))).toMatchObject({
            icon: CircleX,
            label: 'Failed: lint, test',
        });
        expect(ciVisual(pr({ ci: 'failing' }))?.label).toBe('Checks failed');
        expect(ciVisual(pr({ ci: 'none' }))).toBeNull();
    });
});

describe('dashboardNotice', () => {
    it('explains each failure, and nothing when the load succeeded', () => {
        expect(dashboardNotice('ok')).toBeNull();
        expect(dashboardNotice('not-installed')?.title).toContain('gh');
        expect(dashboardNotice('not-authenticated')?.detail).toContain('gh auth login');
        expect(dashboardNotice('not-a-github-repo')?.title).toContain('no GitHub remote');
        expect(dashboardNotice('error', 'rate limited')?.detail).toBe('rate limited');
        expect(dashboardNotice('error')?.detail).toContain('Try refreshing');
    });
});
