import { describe, it, expect } from 'vitest';
import { CircleCheck, CircleDot, CircleX } from '@lucide/vue';
import {
    activityDotClass,
    activityLabel,
    ciVisual,
    dashboardNotice,
    groupActivityByDay,
    prDotClass,
    prIsReady,
    prMatchesQuery,
    stackProgress,
} from '@/lib/dashboard';
import type { ActivityEntry, DashboardPr } from '@/shared/types';

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

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
    return {
        kind: 'approved',
        at: '2026-10-26T12:00:00Z',
        number: 1,
        title: 'Add notifications',
        url: 'https://github.com/o/r/pull/1',
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

describe('activityLabel', () => {
    it('words each kind, with the actor and checks where known', () => {
        expect(activityLabel(entry({ kind: 'review-requested' }))).toBe('Review requested');
        expect(activityLabel(entry({ kind: 'changes-requested', actor: 'ann' }))).toBe(
            'ann requested changes'
        );
        expect(activityLabel(entry({ kind: 'checks-failed', checks: ['lint'] }))).toBe(
            'Checks failed: lint'
        );
        expect(activityLabel(entry({ kind: 'merged-by-other', actor: 'bob' }))).toBe(
            'Merged by bob'
        );
        expect(activityLabel(entry({ kind: 'closed-unmerged' }))).toBe('Closed without merge');
    });

    it('counts the comments, naming the commenter when there is one', () => {
        expect(activityLabel(entry({ kind: 'commented', actor: 'ann', count: 1 }))).toBe(
            'ann commented'
        );
        expect(activityLabel(entry({ kind: 'commented', actor: 'ann', count: 4 }))).toBe(
            'ann left 4 comments'
        );
        expect(activityLabel(entry({ kind: 'commented', count: 4 }))).toBe('4 new comments');
    });
});

describe('activityDotClass', () => {
    it('colors good news green and trouble red', () => {
        expect(activityDotClass(entry({ kind: 'approved' }))).toBe('bg-moire-pr-open');
        expect(activityDotClass(entry({ kind: 'checks-failed' }))).toBe('bg-moire-pr-closed');
        expect(activityDotClass(entry({ kind: 'review-requested' }))).toBe('bg-moire-accent');
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

// A notification sent at a local time.
function sentAt(...date: [number, number, number, number]): ActivityEntry {
    return {
        kind: 'approved',
        at: new Date(...date).toISOString(),
        number: 1,
        title: 'Add notifications',
        url: 'https://github.com/o/r/pull/1',
    };
}

describe('groupActivityByDay', () => {
    // Local times, so the days hold in any time zone. Now is Wednesday afternoon.
    const NOW = new Date(2026, 9, 28, 15, 0).getTime();

    it('groups by local day, newest first, as Today, Yesterday, the weekday and the date', () => {
        const activity = [
            sentAt(2026, 9, 28, 9),
            sentAt(2026, 9, 28, 0),
            sentAt(2026, 9, 27, 23),
            sentAt(2026, 9, 23, 12),
            sentAt(2026, 9, 12, 12),
            sentAt(2025, 11, 31, 12),
        ];

        const groups = groupActivityByDay(activity, NOW);

        expect(groups.map((group) => group.entries.length)).toEqual([2, 1, 1, 1, 1]);
        expect(groups.map((group) => group.label)).toEqual([
            'Today',
            'Yesterday',
            new Date(2026, 9, 23).toLocaleDateString(undefined, { weekday: 'long' }),
            new Date(2026, 9, 12).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            }),
            new Date(2025, 11, 31).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }),
        ]);
    });

    it('returns no groups without notifications', () => {
        expect(groupActivityByDay([], NOW)).toEqual([]);
    });
});

describe('prIsReady', () => {
    it('counts an approved PR with green or no checks, and a merged one', () => {
        expect(prIsReady(pr({ reviewDecision: 'APPROVED', ci: 'passing' }))).toBe(true);
        expect(prIsReady(pr({ reviewDecision: 'APPROVED', ci: 'none' }))).toBe(true);
        expect(prIsReady(pr({ state: 'MERGED' }))).toBe(true);
    });

    it('does not count one still waiting on review or checks', () => {
        expect(prIsReady(pr({ reviewDecision: '', ci: 'passing' }))).toBe(false);
        expect(prIsReady(pr({ reviewDecision: 'APPROVED', ci: 'failing' }))).toBe(false);
        expect(prIsReady(pr({ reviewDecision: 'APPROVED', ci: 'pending' }))).toBe(false);
        expect(prIsReady(pr({ state: 'CLOSED', reviewDecision: 'APPROVED' }))).toBe(false);
    });
});

describe('stackProgress', () => {
    it('counts a stack by where its PRs stand, leaving out empty parts', () => {
        const parts = stackProgress([
            pr({ reviewDecision: 'APPROVED', ci: 'passing' }),
            pr({ state: 'MERGED' }),
            pr({ reviewDecision: 'CHANGES_REQUESTED', ci: 'failing' }),
            pr({ reviewDecision: '', ci: 'pending' }),
        ]);

        expect(parts.map((p) => [p.key, p.count, p.label])).toEqual([
            ['ready', 2, 'ready to merge'],
            ['changes', 1, 'requested changes'],
            ['waiting', 1, 'waiting on review'],
        ]);
    });

    it('counts failing checks apart', () => {
        expect(stackProgress([pr({ ci: 'failing' })]).map((p) => p.key)).toEqual(['failing']);
    });
});

describe('prMatchesQuery', () => {
    const subject = pr({
        number: 42,
        title: 'Add notifications',
        author: 'ann',
        headRefName: 'feat/notify',
        baseRefName: 'develop',
    });

    it('matches everything on an empty query', () => {
        expect(prMatchesQuery(subject, '   ')).toBe(true);
    });

    it('matches the title, author and branches, ignoring case', () => {
        expect(prMatchesQuery(subject, 'NOTIFICATIONS')).toBe(true);
        expect(prMatchesQuery(subject, 'ann')).toBe(true);
        expect(prMatchesQuery(subject, 'feat/not')).toBe(true);
        expect(prMatchesQuery(subject, 'develop')).toBe(true);
        expect(prMatchesQuery(subject, 'billing')).toBe(false);
    });

    it('matches the number with or without a hash', () => {
        expect(prMatchesQuery(subject, '42')).toBe(true);
        expect(prMatchesQuery(subject, '#42')).toBe(true);
        expect(prMatchesQuery(subject, '#4')).toBe(false);
    });

    it('needs every term to match', () => {
        expect(prMatchesQuery(subject, 'ann notify')).toBe(true);
        expect(prMatchesQuery(subject, 'ann billing')).toBe(false);
    });
});
