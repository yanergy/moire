import type { ActivityEntry, DashboardPr } from '@/shared/types';

// Debug only (the notifications menu offers it in dev builds): a hardcoded set
// of notifications, with made up PRs for them to point at, to check the menu and
// the dashboard's card dots without waiting on GitHub. Nothing here comes from
// gh or is saved; the PRs open the repository's pull request list on GitHub.

const MINUTE = 60 * 1000;

function testPr(number: number, overrides: Partial<DashboardPr>): DashboardPr {
    return {
        id: `TEST_${number}`,
        number,
        title: 'Test PR',
        url: '',
        author: '',
        isDraft: false,
        state: 'OPEN',
        mergedBy: '',
        baseRefName: 'main',
        headRefName: `test/${number}`,
        // A fork, so opening it goes to its URL rather than the PR view.
        isCrossRepository: true,
        createdAt: '',
        updatedAt: '',
        closedAt: '',
        additions: 42,
        deletions: 7,
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        ci: 'passing',
        failedChecks: [],
        reviews: [],
        ...overrides,
    };
}

export interface TestNotifications {
    toReview: DashboardPr[];
    mine: DashboardPr[];
    merged: DashboardPr[];
    activity: ActivityEntry[];
}

// The test set for the signed in `login`, in `repo` (owner/name), timed against
// `now` (epoch ms): one notification for each card that can show a dot, a merge
// conflict (no card), and one already read.
export function testNotifications(login: string, repo: string, now: number): TestNotifications {
    const url = `https://github.com/${repo}/pulls`;
    const ago = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
    const pr = (number: number, overrides: Partial<DashboardPr>) =>
        testPr(number, {
            url,
            author: login,
            createdAt: ago(600),
            updatedAt: ago(5),
            ...overrides,
        });

    const review = pr(90001, { title: '[Test] Add a settings page', author: 'test-author' });
    const changes = pr(90002, {
        title: '[Test] Rework the sidebar',
        reviewDecision: 'CHANGES_REQUESTED',
    });
    const ready = pr(90003, {
        title: '[Test] Fix the date picker',
        reviewDecision: 'APPROVED',
    });
    const failing = pr(90004, {
        title: '[Test] Upgrade the test runner',
        ci: 'failing',
        failedChecks: ['lint', 'tests'],
    });
    const conflict = pr(90005, { title: '[Test] Rename the API client', mergeable: 'CONFLICTING' });
    const merged = pr(90006, {
        title: '[Test] Drop the old build script',
        state: 'MERGED',
        mergedBy: 'test-merger',
        closedAt: ago(30),
    });

    const entry = (
        kind: ActivityEntry['kind'],
        target: DashboardPr,
        minutes: number,
        extra: Partial<ActivityEntry> = {}
    ): ActivityEntry => ({
        kind,
        at: ago(minutes),
        number: target.number,
        title: target.title,
        url,
        ...extra,
    });

    return {
        toReview: [review],
        mine: [changes, ready, failing, conflict, merged],
        merged: [merged],
        activity: [
            entry('review-requested', review, 1),
            entry('changes-requested', changes, 4, { actor: 'test-reviewer' }),
            entry('ready-to-merge', ready, 9),
            entry('checks-failed', failing, 15, { checks: ['lint', 'tests'] }),
            entry('merged-by-other', merged, 30, { actor: 'test-merger' }),
            entry('merge-conflict', conflict, 45),
            entry('approved', ready, 60, { read: true }),
        ],
    };
}
