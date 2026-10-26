// The data layer behind GitHub notifications and the PR dashboard. Both are scoped
// to the repository open in Moiré and the active gh account: one GraphQL query
// fetches the PRs that request the viewer's review and the viewer's own PRs, and
// the result is normalized into a snapshot. A pure diff of two snapshots yields
// the events the notifier turns into native notifications. Nothing here touches
// Electron, so all of it is unit-testable with a fake gh runner.
//
// See documentation/github-notifications-plan.md for the event rules.

import {
    classifyFailure,
    defaultRunner,
    toCheck,
    type GhCheckNode,
    type GhRunner,
    type PrStatus,
} from './gh';

// How far back the viewer's closed PRs are fetched, for the dashboard's "recently
// closed without merge" section and the closed/merged events.
const CLOSED_WINDOW_DAYS = 7;

// The overall CI state of a PR's head commit. 'none' means no checks ran.
export type CiState = 'passing' | 'failing' | 'pending' | 'none';

// One reviewer's current stance on a PR (their latest review).
export interface DashboardReview {
    id: string;
    author: string;
    state: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING
}

export interface DashboardPr {
    id: string;
    number: number;
    title: string;
    url: string;
    author: string;
    isDraft: boolean;
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    mergedBy: string;
    baseRefName: string;
    headRefName: string;
    // A PR from a fork: its head branch is not on this repository's remote, so it
    // cannot be opened in Moiré's PR view.
    isCrossRepository: boolean;
    createdAt: string;
    updatedAt: string;
    closedAt: string;
    additions: number;
    deletions: number;
    // MERGEABLE | CONFLICTING | UNKNOWN. GitHub computes this lazily, so a
    // snapshot carries the last known value forward instead of UNKNOWN (see
    // diffSnapshots).
    mergeable: string;
    // '' | APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED
    reviewDecision: string;
    ci: CiState;
    failedChecks: string[];
    reviews: DashboardReview[];
}

export interface DashboardSnapshot {
    login: string;
    repo: string; // owner/name
    fetchedAt: string;
    // Open PRs that request the viewer's review personally.
    toReview: DashboardPr[];
    // The viewer's open PRs plus those closed within CLOSED_WINDOW_DAYS.
    mine: DashboardPr[];
    // Ids of the viewer's PRs that already got a "checks failed" notification and
    // have not passed since. CI is notified once per PR, not per commit.
    failureNotified: string[];
}

export type DashboardEventKind =
    | 'review-requested'
    | 'changes-requested'
    | 'closed-unmerged'
    | 'checks-failed'
    | 'approved'
    | 'merge-conflict'
    | 'ready-to-merge'
    | 'merged-by-other';

export interface DashboardEvent {
    kind: DashboardEventKind;
    pr: DashboardPr;
    // Who caused it (the reviewer or merger), when known.
    actor?: string;
    // The failed check names for 'checks-failed'.
    checks?: string[];
}

export interface RepoIdentityResult {
    status: PrStatus;
    repo: string | null; // owner/name
    message?: string;
}

export interface SnapshotResult {
    status: PrStatus;
    snapshot: DashboardSnapshot | null;
    message?: string;
}

export interface SnapshotDiff {
    events: DashboardEvent[];
    // The new snapshot with the state carried over from the previous one (the
    // last known mergeable value and the per PR failure flags). This is what the
    // caller stores and diffs against next time.
    snapshot: DashboardSnapshot;
}

// --- Fetching ---

const PR_FRAGMENT = `
fragment Pr on PullRequest {
  id number title url isDraft state merged closedAt createdAt updatedAt
  isCrossRepository additions deletions mergeable reviewDecision
  author { login } mergedBy { login } baseRefName headRefName
  latestReviews(first: 50) { nodes { id state author { login } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes {
    __typename
    ... on CheckRun { name status conclusion }
    ... on StatusContext { context state }
  } } } } } }
}`;

// Three searches in one round trip. Search cannot OR "open" with "closed
// recently", so the viewer's open and recently closed PRs are separate aliases.
const DASHBOARD_QUERY = `
query($review: String!, $mineOpen: String!, $mineClosed: String!) {
  viewer { login }
  review: search(query: $review, type: ISSUE, first: 50) { nodes { ...Pr } }
  mineOpen: search(query: $mineOpen, type: ISSUE, first: 50) { nodes { ...Pr } }
  mineClosed: search(query: $mineClosed, type: ISSUE, first: 50) { nodes { ...Pr } }
}
${PR_FRAGMENT}`;

// The raw GraphQL shape of one PR node; every field optional so a partial node
// still parses. Search results that are not PRs come back as empty objects.
interface GqlPr {
    id?: string;
    number?: number;
    title?: string;
    url?: string;
    isDraft?: boolean;
    state?: string;
    merged?: boolean;
    closedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    isCrossRepository?: boolean;
    additions?: number;
    deletions?: number;
    mergeable?: string;
    reviewDecision?: string | null;
    author?: { login?: string } | null;
    mergedBy?: { login?: string } | null;
    baseRefName?: string;
    headRefName?: string;
    latestReviews?: {
        nodes?: ({ id?: string; state?: string; author?: { login?: string } | null } | null)[];
    } | null;
    commits?: {
        nodes?: ({
            commit?: {
                statusCheckRollup?: {
                    state?: string;
                    contexts?: { nodes?: (GhCheckNode | null)[] | null } | null;
                } | null;
            } | null;
        } | null)[];
    } | null;
}

interface GqlDashboard {
    data?: {
        viewer?: { login?: string } | null;
        review?: { nodes?: (GqlPr | null)[] | null } | null;
        mineOpen?: { nodes?: (GqlPr | null)[] | null } | null;
        mineClosed?: { nodes?: (GqlPr | null)[] | null } | null;
    } | null;
}

// The effective review decision. Like the PR view (see reviewDecisionOf in gh.ts),
// GitHub fills reviewDecision only when branch protection requires reviews, so an
// empty one is derived from each reviewer's latest review: changes requested
// outranks an approval.
function decisionOf(decision: string, reviews: DashboardReview[]): string {
    if (decision) {
        return decision;
    }

    const states = new Set(reviews.map((r) => r.state));
    if (states.has('CHANGES_REQUESTED')) {
        return 'CHANGES_REQUESTED';
    }
    if (states.has('APPROVED')) {
        return 'APPROVED';
    }

    return '';
}

function ciOf(rollupState: string | undefined): CiState {
    switch ((rollupState ?? '').toUpperCase()) {
        case '':
            return 'none';
        case 'SUCCESS':
            return 'passing';
        case 'FAILURE':
        case 'ERROR':
            return 'failing';
        default:
            // PENDING and EXPECTED: still running or waiting to start.
            return 'pending';
    }
}

function toDashboardPr(node: GqlPr): DashboardPr {
    const reviews = (node.latestReviews?.nodes ?? [])
        .filter((r) => r !== null)
        .map((r) => ({ id: r.id ?? '', author: r.author?.login ?? '', state: r.state ?? '' }))
        .filter((r) => r.id && r.author);

    const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup ?? null;
    const failedChecks = (rollup?.contexts?.nodes ?? [])
        .filter((c) => c !== null)
        .map(toCheck)
        .filter((c) => c.name && c.state === 'failure')
        .map((c) => c.name);

    let state: DashboardPr['state'] = 'OPEN';
    if (node.merged || node.state === 'MERGED') {
        state = 'MERGED';
    } else if (node.state === 'CLOSED') {
        state = 'CLOSED';
    }

    return {
        id: node.id ?? '',
        number: node.number ?? 0,
        title: node.title ?? '',
        url: node.url ?? '',
        author: node.author?.login ?? '',
        isDraft: node.isDraft ?? false,
        state,
        mergedBy: node.mergedBy?.login ?? '',
        baseRefName: node.baseRefName ?? '',
        headRefName: node.headRefName ?? '',
        isCrossRepository: node.isCrossRepository ?? false,
        createdAt: node.createdAt ?? '',
        updatedAt: node.updatedAt ?? '',
        closedAt: node.closedAt ?? '',
        additions: node.additions ?? 0,
        deletions: node.deletions ?? 0,
        mergeable: node.mergeable ?? 'UNKNOWN',
        reviewDecision: decisionOf(node.reviewDecision ?? '', reviews),
        ci: ciOf(rollup?.state),
        failedChecks,
        reviews,
    };
}

function toPrList(nodes: (GqlPr | null)[] | null | undefined): DashboardPr[] {
    return (nodes ?? [])
        .filter((n) => n !== null)
        .map(toDashboardPr)
        .filter((pr) => pr.id && pr.number);
}

// Resolve the open repository's GitHub identity (owner/name). gh picks the
// repository from the git remotes, as it does for the PR view. Never throws.
export async function getRepoIdentity(
    repoPath: string,
    run: GhRunner = defaultRunner
): Promise<RepoIdentityResult> {
    if (!repoPath) {
        return { status: 'not-a-github-repo', repo: null };
    }

    let stdout: string;
    try {
        ({ stdout } = await run(['repo', 'view', '--json', 'nameWithOwner'], repoPath));
    } catch (error) {
        const { status, message } = classifyFailure(error);
        return { status, repo: null, message };
    }

    try {
        const repo = (JSON.parse(stdout) as { nameWithOwner?: string }).nameWithOwner ?? '';
        return repo ? { status: 'ok', repo } : { status: 'not-a-github-repo', repo: null };
    } catch {
        return { status: 'error', repo: null, message: 'Could not read the repository from gh.' };
    }
}

// Fetch the dashboard snapshot for one repository. `now` is injectable so the
// closed window is deterministic in tests. The returned snapshot carries no
// failure flags yet; diffSnapshots carries them over. Never throws.
export async function fetchSnapshot(
    repoPath: string,
    repo: string,
    now: Date = new Date(),
    run: GhRunner = defaultRunner
): Promise<SnapshotResult> {
    if (!repoPath || !repo) {
        return { status: 'not-a-github-repo', snapshot: null };
    }

    const since = new Date(now.getTime() - CLOSED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const scope = `repo:${repo} is:pr`;

    let stdout: string;
    try {
        ({ stdout } = await run(
            [
                'api',
                'graphql',
                '-f',
                `query=${DASHBOARD_QUERY}`,
                '-f',
                `review=${scope} is:open archived:false user-review-requested:@me`,
                '-f',
                `mineOpen=${scope} is:open author:@me`,
                '-f',
                `mineClosed=${scope} is:closed author:@me closed:>=${since}`,
            ],
            repoPath
        ));
    } catch (error) {
        const { status, message } = classifyFailure(error);
        return { status, snapshot: null, message };
    }

    let data: NonNullable<GqlDashboard['data']>;
    try {
        const parsed = JSON.parse(stdout) as GqlDashboard;
        if (!parsed.data?.viewer?.login) {
            return { status: 'error', snapshot: null, message: 'gh returned no dashboard data.' };
        }
        data = parsed.data;
    } catch {
        return { status: 'error', snapshot: null, message: 'Could not read the dashboard data.' };
    }

    const login = data.viewer!.login!;

    // A PR can show up in both of the viewer's searches while it is being closed;
    // keep the first (open) copy.
    const mine: DashboardPr[] = [];
    const seen = new Set<string>();
    for (const pr of [...toPrList(data.mineOpen?.nodes), ...toPrList(data.mineClosed?.nodes)]) {
        if (!seen.has(pr.id)) {
            seen.add(pr.id);
            mine.push(pr);
        }
    }

    return {
        status: 'ok',
        snapshot: {
            login,
            repo,
            fetchedAt: now.toISOString(),
            // GitHub does not let an author review their own PR, but guard anyway.
            toReview: toPrList(data.review?.nodes).filter((pr) => pr.author !== login),
            mine,
            failureNotified: [],
        },
    };
}

// --- Diffing ---

// Approved, checks passing (or none configured), no conflicts, not a draft.
export function isReadyToMerge(pr: DashboardPr): boolean {
    return (
        pr.state === 'OPEN' &&
        !pr.isDraft &&
        pr.reviewDecision === 'APPROVED' &&
        (pr.ci === 'passing' || pr.ci === 'none') &&
        pr.mergeable === 'MERGEABLE'
    );
}

// Compare the previous snapshot with a freshly fetched one and return the events
// plus the snapshot to store. The caller treats a missing previous snapshot as a
// baseline (no events), so `prev` is always a real earlier snapshot of the same
// login and repository here.
//
// A PR of the viewer's that is new to the snapshot is compared against an empty
// previous state, so e.g. a PR opened and approved while the repository was not
// open still reports the approval.
export function diffSnapshots(prev: DashboardSnapshot, next: DashboardSnapshot): SnapshotDiff {
    const events: DashboardEvent[] = [];

    const prevReview = new Set(prev.toReview.map((pr) => pr.id));
    for (const pr of next.toReview) {
        if (!prevReview.has(pr.id)) {
            events.push({ kind: 'review-requested', pr });
        }
    }

    const prevMine = new Map(prev.mine.map((pr) => [pr.id, pr]));
    const prevFailureNotified = new Set(prev.failureNotified);
    const failureNotified: string[] = [];

    const mine = next.mine.map((fetched) => {
        const before = prevMine.get(fetched.id);

        // GitHub reports UNKNOWN while it recomputes mergeability; keep the last
        // known value so UNKNOWN never reads as a change.
        const pr =
            fetched.mergeable === 'UNKNOWN' && before
                ? { ...fetched, mergeable: before.mergeable }
                : fetched;

        const wasOpen = before?.state === 'OPEN';
        if (wasOpen && pr.state === 'CLOSED') {
            events.push({ kind: 'closed-unmerged', pr });
        }
        if (wasOpen && pr.state === 'MERGED' && pr.mergedBy && pr.mergedBy !== next.login) {
            events.push({ kind: 'merged-by-other', pr, actor: pr.mergedBy });
        }

        // The rest only applies while the PR is open.
        if (pr.state !== 'OPEN') {
            return pr;
        }

        const seenReviews = new Set(before?.reviews.map((r) => r.id) ?? []);
        for (const review of pr.reviews) {
            if (review.state === 'CHANGES_REQUESTED' && !seenReviews.has(review.id)) {
                events.push({ kind: 'changes-requested', pr, actor: review.author });
            }
        }

        if (pr.reviewDecision === 'APPROVED' && before?.reviewDecision !== 'APPROVED') {
            events.push({ kind: 'approved', pr });
        }

        if (pr.mergeable === 'CONFLICTING' && before?.mergeable !== 'CONFLICTING') {
            events.push({ kind: 'merge-conflict', pr });
        }

        if (isReadyToMerge(pr) && !(before && isReadyToMerge(before))) {
            events.push({ kind: 'ready-to-merge', pr });
        }

        // CI is notified once per PR: when it fails, and not again until it has
        // passed. Pending keeps the flag, so a failing re-run stays quiet.
        const notified = prevFailureNotified.has(pr.id);
        if (pr.ci === 'failing') {
            if (!notified) {
                events.push({ kind: 'checks-failed', pr, checks: pr.failedChecks });
            }
            failureNotified.push(pr.id);
        } else if (notified && pr.ci !== 'passing') {
            failureNotified.push(pr.id);
        }

        return pr;
    });

    return { events, snapshot: { ...next, mine, failureNotified } };
}

// One delivered event in a repository's recent activity list, so a notification
// that was missed can still be found on the dashboard. `at` is when it was seen.
export interface ActivityEntry {
    kind: DashboardEventKind;
    at: string;
    number: number;
    title: string;
    url: string;
    actor?: string;
    checks?: string[];
}
