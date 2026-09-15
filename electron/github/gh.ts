// Pull-request lookup via the GitHub CLI (`gh`), kept deliberately separate from
// GitService: `gh` is an optional external dependency (not everyone has it
// installed or authenticated), whereas the git binary is required. Nothing here
// touches simple-git, and a missing or unauthenticated `gh` is reported as a
// status the renderer can explain rather than a hard failure.
//
// PRs are a GitHub concept, absent from the local repository, so this is the only
// path in the app that reaches out to GitHub. `gh` auto-detects the repository
// from the working directory's git remote, so no remote parsing is needed here.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Must match WORKING_TREE in src/shared/types.ts. The strict process split
// (electron never imports from src/) means the sentinel is restated rather than
// imported. The working tree is not a branch, so it can never have a PR.
const WORKING_TREE = 'WORKING TREE';

// The gh JSON fields requested; the shape below mirrors them. `body` is the PR
// description in Markdown. The stats (additions/deletions/changedFiles), commit
// list, and the comments/reviews feed the PR view's header and conversation.
const PR_FIELDS =
    'id,number,title,body,state,url,isDraft,author,baseRefName,headRefName,headRefOid,createdAt,' +
    'additions,deletions,changedFiles,commits,comments,reviews,labels,mergeable,mergeStateStatus,' +
    'reviewDecision,statusCheckRollup';

// Why a PR view is empty, so the renderer can show the right hint instead of a
// bare "nothing here". Mirrors PrStatus in src/shared/types.ts.
export type PrStatus =
    | 'ok'
    | 'no-pr'
    | 'not-installed'
    | 'not-authenticated'
    | 'not-a-github-repo'
    | 'error';

// One entry in the PR conversation: a general PR comment, or a submitted review.
// A review carries its `state` (APPROVED, CHANGES_REQUESTED, COMMENTED) so the
// view can label it; `body` is Markdown and may be empty for a bare approval.
export interface PrComment {
    author: string;
    body: string;
    createdAt: string;
    kind: 'comment' | 'review';
    state?: string;
    // The GraphQL node id, used to edit the comment (empty for reviews, which this
    // path does not edit). `canEdit` is gh's viewerDidAuthor: the signed-in account
    // wrote it, so it may edit it.
    id: string;
    canEdit: boolean;
}

// A PR label; `color` is a 6-digit hex without the leading '#', as GitHub returns.
export interface PrLabel {
    name: string;
    color: string;
    description: string;
}

// One CI check on the PR's head commit. `state` collapses GitHub's many
// status/conclusion values into the buckets the view needs (the design colors
// only success and failure, the rest faint, but the finer state drives the row's
// icon). `detail` is a short human summary (a duration, "Running", "Skipped", ...)
// and `url` opens the run on GitHub.
export type PrCheckState = 'success' | 'failure' | 'pending' | 'skipped' | 'neutral';

export interface PrCheck {
    name: string;
    state: PrCheckState;
    detail: string;
    url: string;
}

export interface PullRequest {
    // The PR's GraphQL node id, used to fetch its inline review threads. Optional
    // because older fetches (and test fixtures) may omit it.
    id?: string;
    number: number;
    title: string;
    body: string;
    state: string; // OPEN | CLOSED | MERGED
    isDraft: boolean;
    author: string; // GitHub login
    url: string;
    baseRefName: string;
    headRefName: string;
    // The head commit SHA, used to fetch the commit's check-run annotations.
    // Optional because older fetches and test fixtures may omit it.
    headRefOid?: string;
    createdAt: string;
    additions: number;
    deletions: number;
    changedFiles: number;
    commitCount: number;
    comments: PrComment[];
    labels: PrLabel[];
    // Mergeability, for the merge-status box. `mergeable` is MERGEABLE, CONFLICTING,
    // or UNKNOWN; `mergeStateStatus` refines it (CLEAN, BLOCKED, BEHIND, ...).
    mergeable: string;
    mergeStateStatus: string;
    // The effective code-review decision: '' | CHANGES_REQUESTED | APPROVED |
    // REVIEW_REQUIRED. Drives the "changes requested" status.
    reviewDecision: string;
    // The CI checks on the head commit, for the Checks tab. Empty when none ran.
    checks: PrCheck[];
}

export interface PullRequestResult {
    status: PrStatus;
    pr: PullRequest | null;
    message?: string; // human-readable detail for the 'error' status
}

// The raw shape `gh pr list --json` emits for each PR. `author` is an object, and
// the conversation arrives as separate `comments` and `reviews` arrays that
// buildComments merges into one timeline.
interface GhAuthor {
    login?: string;
}

interface GhComment {
    id?: string;
    author: GhAuthor | null;
    body: string;
    createdAt: string;
    viewerDidAuthor?: boolean;
}

interface GhReview {
    author: GhAuthor | null;
    body: string;
    state: string;
    submittedAt: string;
}

interface GhLabel {
    name: string;
    color: string;
    description: string;
}

// One comment inside an inline review thread: an author login, its Markdown body,
// and when it was posted.
export interface PrReviewComment {
    author: string;
    body: string;
    createdAt: string;
}

// An inline (line-anchored) code review thread on the PR, shown as a marker in the
// diff viewer. `path` is the file it is on; `line`/`originalLine` are the anchored
// line on the head (RIGHT) and base (LEFT) side (either can be null when GitHub
// could not map it). `side` says which side the thread hangs on. `isResolved` and
// `isOutdated` drive how the marker reads.
export interface PrReviewThread {
    path: string;
    line: number | null;
    originalLine: number | null;
    side: 'LEFT' | 'RIGHT';
    isResolved: boolean;
    isOutdated: boolean;
    comments: PrReviewComment[];
}

// A CI check annotation (a line-anchored note a GitHub Actions workflow or app posts
// on the head commit, e.g. a linter flagging a line), shown as a marker on its line in
// the diff viewer. `line` is the head-file line it anchors to; `level` is GitHub's
// annotation level (notice/warning/failure); `title` is the short heading and
// `message` the detail; `url` opens the producing check run on GitHub.
export interface CheckAnnotation {
    path: string;
    line: number | null;
    level: string;
    title: string;
    message: string;
    url: string;
}

// A statusCheckRollup entry. gh returns a union: an Actions `CheckRun` (a
// lifecycle `status` plus a `conclusion` once done) or a legacy `StatusContext`
// (a flat `state`). Every field is optional so a node of either shape parses.
interface GhCheckNode {
    __typename?: string;
    // CheckRun
    name?: string;
    status?: string;
    conclusion?: string;
    startedAt?: string;
    completedAt?: string;
    detailsUrl?: string;
    workflowName?: string;
    // StatusContext
    context?: string;
    state?: string;
    targetUrl?: string;
    description?: string;
}

interface GhPr {
    id: string;
    number: number;
    title: string;
    body: string;
    state: string;
    url: string;
    isDraft: boolean;
    author: GhAuthor | null;
    baseRefName: string;
    headRefName: string;
    headRefOid: string;
    createdAt: string;
    additions: number;
    deletions: number;
    changedFiles: number;
    commits: unknown[] | null;
    comments: GhComment[] | null;
    reviews: GhReview[] | null;
    labels: GhLabel[] | null;
    mergeable: string;
    mergeStateStatus: string;
    reviewDecision: string | null;
    statusCheckRollup: GhCheckNode[] | null;
}

// Runs `gh` with the given args in the repo directory and resolves its stdout.
// Injectable so the lookup is unit-testable without spawning a real gh.
export type GhRunner = (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;

// KNOWN LIMITATION (packaging): `gh` is resolved off PATH. A `npm run dev` app
// inherits the shell's PATH so this finds a Homebrew/npm-installed gh, but a
// packaged app launched from Finder/Explorer often has a minimal PATH that omits
// /opt/homebrew/bin, /usr/local/bin, etc. There gh can read as 'not-installed'
// even when it is installed. Before relying on packaged builds, resolve gh's
// absolute path first (a login shell, `which`/`where`, or a configured path).
const defaultRunner: GhRunner = async (args, cwd) => {
    const { stdout, stderr } = await execFileAsync('gh', args, {
        cwd,
        // PR bodies can be long; default 1 MB is usually fine but cheap to raise.
        maxBuffer: 10 * 1024 * 1024,
        // Never hang the lookup on a stuck network call.
        timeout: 20_000,
        windowsHide: true,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
};

// Merge the separate comment and review arrays into one chronological timeline.
// A review with no body and a COMMENTED (or missing) state is just a container
// for inline code comments, which are not fetched here, so it is dropped; an
// approval or change request is kept even with an empty body so its state shows.
function buildComments(pr: GhPr): PrComment[] {
    const out: PrComment[] = [];
    for (const c of pr.comments ?? []) {
        out.push({
            author: c.author?.login ?? '',
            body: c.body ?? '',
            createdAt: c.createdAt,
            kind: 'comment',
            id: c.id ?? '',
            canEdit: !!c.viewerDidAuthor,
        });
    }

    for (const r of pr.reviews ?? []) {
        const body = r.body ?? '';
        if (!body && (r.state === 'COMMENTED' || !r.state)) {
            continue;
        }

        out.push({
            author: r.author?.login ?? '',
            body,
            createdAt: r.submittedAt,
            kind: 'review',
            state: r.state,
            // Reviews are not editable through this path (a different mutation), so
            // they carry no id and are never marked editable.
            id: '',
            canEdit: false,
        });
    }

    // ISO 8601 timestamps sort chronologically as plain strings.
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
}

// The effective review decision. gh fills `reviewDecision` only when the repo
// requires reviews (branch protection); otherwise it is empty even after a
// "changes requested" review. So when it is empty, derive the decision from the
// latest review per author: changes requested outranks an approval, as on GitHub,
// and COMMENTED/DISMISSED/PENDING states carry no decision.
function reviewDecisionOf(pr: GhPr): string {
    if (pr.reviewDecision) {
        return pr.reviewDecision;
    }

    // Sort by time so the last entry per author is their current stance.
    const reviews = (pr.reviews ?? []).toSorted((a, b) =>
        (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')
    );
    const latest = new Map<string, string>();
    for (const r of reviews) {
        const login = r.author?.login ?? '';
        if (login && r.state) {
            latest.set(login, r.state);
        }
    }

    const states = new Set(latest.values());
    if (states.has('CHANGES_REQUESTED')) {
        return 'CHANGES_REQUESTED';
    }
    if (states.has('APPROVED')) {
        return 'APPROVED';
    }

    return '';
}

// Format an elapsed run time the way GitHub's check summaries do: "48s", "1m 12s".
// Returns '' when either timestamp is missing or unparseable.
function formatDuration(startIso?: string, endIso?: string): string {
    const start = Date.parse(startIso ?? '');
    const end = Date.parse(endIso ?? '');
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
        return '';
    }

    const secs = Math.round((end - start) / 1000);
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return mins ? `${mins}m ${rem.toString().padStart(2, '0')}s` : `${secs}s`;
}

// Map one rollup node onto the view's shape. A legacy StatusContext carries a flat
// `state`; a CheckRun carries a `status` (lifecycle) and, once COMPLETED, a
// `conclusion` (result). GitHub's many values collapse into five buckets.
function toCheck(node: GhCheckNode): PrCheck {
    if (node.__typename === 'StatusContext') {
        const st = (node.state ?? '').toUpperCase();
        let state: PrCheckState = 'pending';
        if (st === 'SUCCESS') {
            state = 'success';
        } else if (st === 'FAILURE' || st === 'ERROR') {
            state = 'failure';
        }
        return {
            name: node.context ?? '',
            state,
            detail: node.description ?? '',
            url: node.targetUrl ?? '',
        };
    }

    // A CheckRun that has not finished: still queued or in progress.
    const status = (node.status ?? '').toUpperCase();
    if (status !== 'COMPLETED') {
        let detail = 'Pending';
        if (status === 'IN_PROGRESS') {
            detail = 'Running';
        } else if (status === 'QUEUED') {
            detail = 'Queued';
        }
        return { name: node.name ?? '', state: 'pending', detail, url: node.detailsUrl ?? '' };
    }

    // A finished CheckRun: bucket by conclusion. Anything unrecognised (FAILURE,
    // TIMED_OUT, STARTUP_FAILURE, ACTION_REQUIRED, ...) reads as a failure.
    const duration = formatDuration(node.startedAt, node.completedAt);
    let state: PrCheckState = 'failure';
    let detail = duration ? `Failed in ${duration}` : 'Failed';
    switch ((node.conclusion ?? '').toUpperCase()) {
        case 'SUCCESS':
            state = 'success';
            detail = duration;
            break;
        case 'SKIPPED':
            state = 'skipped';
            detail = 'Skipped';
            break;
        case 'NEUTRAL':
            state = 'neutral';
            detail = 'Neutral';
            break;
        case 'CANCELLED':
            state = 'neutral';
            detail = 'Cancelled';
            break;
        case 'STALE':
            state = 'neutral';
            detail = 'Stale';
            break;
        default:
            break;
    }
    return { name: node.name ?? '', state, detail, url: node.detailsUrl ?? '' };
}

// The head commit's checks for the Checks tab, dropping any nameless node.
function buildChecks(pr: GhPr): PrCheck[] {
    return (pr.statusCheckRollup ?? []).map(toCheck).filter((c) => c.name);
}

function toPullRequest(pr: GhPr): PullRequest {
    return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        state: pr.state,
        isDraft: pr.isDraft,
        author: pr.author?.login ?? '',
        url: pr.url,
        baseRefName: pr.baseRefName,
        headRefName: pr.headRefName,
        headRefOid: pr.headRefOid,
        createdAt: pr.createdAt,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changedFiles ?? 0,
        commitCount: pr.commits?.length ?? 0,
        comments: buildComments(pr),
        labels: (pr.labels ?? []).map((l) => ({
            name: l.name,
            color: l.color,
            description: l.description,
        })),
        mergeable: pr.mergeable ?? 'UNKNOWN',
        mergeStateStatus: pr.mergeStateStatus ?? '',
        reviewDecision: reviewDecisionOf(pr),
        checks: buildChecks(pr),
    };
}

// Map a gh failure onto a status the renderer can act on. A spawn ENOENT means gh
// is not on PATH; otherwise the reason is in stderr (auth, no GitHub remote, ...).
function classifyFailure(error: unknown): PullRequestResult {
    const err = error as { code?: string | number; stderr?: string | Buffer };
    if (err.code === 'ENOENT') {
        return { status: 'not-installed', pr: null };
    }

    const stderr = String(err.stderr ?? '');
    if (/auth login|not logged in|authentication|requires authentication/i.test(stderr)) {
        return { status: 'not-authenticated', pr: null };
    }

    if (
        /none of the git remotes|no git remote|not a git repository|no GitHub|could not determine/i.test(
            stderr
        )
    ) {
        return { status: 'not-a-github-repo', pr: null };
    }

    return {
        status: 'error',
        pr: null,
        message: stderr.trim() || 'gh failed to fetch the pull request.',
    };
}

// Look up the pull request for the compared head branch. gh filters by head
// branch name (a branch has at most one active PR); the PR's own base is returned
// in baseRefName so the view can show what it targets even if it differs from the
// selected base. Any absence (no gh, no auth, no GitHub remote, no PR) comes back
// as a status rather than a throw.
export async function getPullRequest(
    repoPath: string,
    _base: string,
    head: string,
    run: GhRunner = defaultRunner
): Promise<PullRequestResult> {
    if (!repoPath || !head || head === WORKING_TREE) {
        return { status: 'no-pr', pr: null };
    }

    const args = [
        'pr',
        'list',
        '--head',
        head,
        '--state',
        'all',
        '--limit',
        '1',
        '--json',
        PR_FIELDS,
    ];

    let stdout: string;
    try {
        ({ stdout } = await run(args, repoPath));
    } catch (error) {
        return classifyFailure(error);
    }

    let list: GhPr[];
    try {
        list = JSON.parse(stdout) as GhPr[];
    } catch {
        return { status: 'error', pr: null, message: 'Could not parse gh output.' };
    }

    const raw = list[0];
    if (!raw) {
        return { status: 'no-pr', pr: null };
    }

    return { status: 'ok', pr: toPullRequest(raw) };
}

// --- Inline review threads (GraphQL) ---
//
// `gh pr view --json` exposes the conversation but not the line-anchored review
// threads (a reviewer's comments on specific diff lines). Those need the GraphQL
// API, reached by the PR's node id (from PR_FIELDS above) so no owner/name parsing
// is required. They are supplementary: any failure yields an empty list rather than
// an error, so the diff viewer simply shows no markers.

// The GraphQL shape a review thread comes back as; only the fields the viewer reads.
interface GhReviewThread {
    path: string | null;
    line: number | null;
    originalLine: number | null;
    diffSide: string | null;
    isResolved: boolean | null;
    isOutdated: boolean | null;
    comments: { nodes: GhReviewComment[] | null } | null;
}
interface GhReviewComment {
    author: GhAuthor | null;
    body: string | null;
    createdAt: string | null;
}

const REVIEW_THREADS_QUERY =
    'query($id:ID!){node(id:$id){... on PullRequest{reviewThreads(first:100){nodes{' +
    'path line originalLine diffSide isResolved isOutdated ' +
    'comments(first:100){nodes{author{login} body createdAt}}}}}}}';

function toReviewThread(node: GhReviewThread): PrReviewThread {
    return {
        path: node.path ?? '',
        line: node.line ?? null,
        originalLine: node.originalLine ?? null,
        side: node.diffSide === 'LEFT' ? 'LEFT' : 'RIGHT',
        isResolved: node.isResolved ?? false,
        isOutdated: node.isOutdated ?? false,
        comments: (node.comments?.nodes ?? []).map((c) => ({
            author: c.author?.login ?? '',
            body: c.body ?? '',
            createdAt: c.createdAt ?? '',
        })),
    };
}

// Fetch the PR's inline review threads by its node id. Returns an empty list when
// there is no id, or when gh is missing, unauthenticated, or otherwise fails, so a
// caller can treat "no threads" and "could not load" the same (markers absent).
export async function getReviewThreads(
    repoPath: string,
    prId: string,
    run: GhRunner = defaultRunner
): Promise<PrReviewThread[]> {
    if (!repoPath || !prId) {
        return [];
    }

    let stdout: string;
    try {
        ({ stdout } = await run(
            ['api', 'graphql', '-f', `query=${REVIEW_THREADS_QUERY}`, '-f', `id=${prId}`],
            repoPath
        ));
    } catch {
        return [];
    }

    let nodes: GhReviewThread[];
    try {
        const parsed = JSON.parse(stdout) as {
            data?: { node?: { reviewThreads?: { nodes?: GhReviewThread[] | null } | null } | null };
        };
        nodes = parsed.data?.node?.reviewThreads?.nodes ?? [];
    } catch {
        return [];
    }

    // Keep only threads that anchor to a file and carry at least one comment.
    return nodes.map(toReviewThread).filter((t) => t.path && t.comments.length > 0);
}

// --- Check run annotations (REST) ---
//
// A CI check (a GitHub Actions workflow or an app) can attach line-anchored
// annotations to the head commit, e.g. a linter flagging a specific line, which
// GitHub renders inline in the PR diff. They come from the Checks REST API in two
// steps: list the head commit's check runs, then read the annotations of each run
// that reports any. Like review threads they are supplementary: any failure yields an
// empty list and the diff viewer simply shows no markers. Annotations are matched to
// the open file by path, so all are fetched and filtered in the renderer.
//
// Query params go in the URL, not as `-f` fields: `gh api` switches to POST the moment
// a field is added, which these GET endpoints reject. gh still fills {owner}/{repo}.

// A check run as the commit check-runs endpoint returns it; only the read fields.
// `annotations_count` gates the (paid) second call, so runs with none are skipped.
interface GhCheckRun {
    id: number | null;
    html_url: string | null;
    details_url: string | null;
    output: { annotations_count: number | null } | null;
}

// The REST shape of a single check annotation; only the fields the viewer reads.
interface GhAnnotation {
    path: string | null;
    start_line: number | null;
    annotation_level: string | null;
    title: string | null;
    message: string | null;
}

function toAnnotation(a: GhAnnotation, url: string): CheckAnnotation {
    return {
        path: a.path ?? '',
        line: a.start_line ?? null,
        level: a.annotation_level ?? '',
        title: a.title ?? '',
        // Fall back to the title when an annotation carries no message (|| so an empty
        // string falls back too, not only null/undefined).
        message: a.message || a.title || '',
        url,
    };
}

// Fetch the head commit's check annotations. Lists the commit's check runs, then reads
// the annotations of each run that reports any (in parallel), tagging each with its
// run's URL so "view on GitHub" opens the producing check. Returns an empty list on any
// failure, so a repo whose checks post no annotations just shows no markers.
export async function getCheckAnnotations(
    repoPath: string,
    headSha: string,
    run: GhRunner = defaultRunner
): Promise<CheckAnnotation[]> {
    if (!repoPath || !headSha) {
        return [];
    }

    let runs: GhCheckRun[];
    try {
        const { stdout } = await run(
            ['api', `repos/{owner}/{repo}/commits/${headSha}/check-runs?per_page=100`],
            repoPath
        );
        const parsed = JSON.parse(stdout) as { check_runs?: GhCheckRun[] | null };
        runs = parsed.check_runs ?? [];
    } catch {
        return [];
    }

    // Only runs that actually carry annotations need the (rate-limited) second call.
    const annotated = runs.filter((r) => r.id !== null && (r.output?.annotations_count ?? 0) > 0);

    const lists = await Promise.all(
        annotated.map(async (r) => {
            const url = r.html_url ?? r.details_url ?? '';
            try {
                const { stdout } = await run(
                    ['api', `repos/{owner}/{repo}/check-runs/${r.id}/annotations?per_page=100`],
                    repoPath
                );
                const parsed = JSON.parse(stdout) as unknown;
                const list = Array.isArray(parsed) ? (parsed as GhAnnotation[]) : [];
                return list.map((a) => toAnnotation(a, url));
            } catch {
                return [];
            }
        })
    );

    return lists.flat().filter((a) => a.path && a.line && a.message);
}

// --- Writing to the conversation (gh pr comment / GraphQL) ---
//
// The PR view is read-only until the user turns on edit mode; these back the two
// writes it then allows. Both return a plain ok/message result rather than
// throwing, so the renderer can show an inline error instead of a crash.

export interface CommentMutationResult {
    ok: boolean;
    message?: string;
}

// Turn a gh failure into a short message for the inline error. A missing gh or an
// auth problem is named; otherwise the gh stderr (often a clear GitHub error like
// a permission denial) is surfaced as-is.
function mutationError(error: unknown): string {
    const err = error as { code?: string | number; stderr?: string | Buffer };
    if (err.code === 'ENOENT') {
        return 'The GitHub CLI (gh) was not found.';
    }

    const stderr = String(err.stderr ?? '').trim();
    if (/auth login|not logged in|authentication|requires authentication/i.test(stderr)) {
        return 'gh is not signed in to GitHub.';
    }

    return stderr || 'gh could not complete the request.';
}

// Post a new comment on the PR via `gh pr comment`, addressing it by number (the
// renderer holds it from the fetched PR). A blank body is rejected before gh runs.
// The body is passed as a single argv value, so no shell quoting is involved.
export async function postComment(
    repoPath: string,
    prNumber: number,
    body: string,
    run: GhRunner = defaultRunner
): Promise<CommentMutationResult> {
    if (!repoPath || !prNumber || !body.trim()) {
        return { ok: false, message: 'Nothing to post.' };
    }

    try {
        await run(['pr', 'comment', String(prNumber), '--body', body], repoPath);
        return { ok: true };
    } catch (error) {
        return { ok: false, message: mutationError(error) };
    }
}

// Edit an existing PR comment via the GraphQL updateIssueComment mutation, keyed on
// the comment's node id (the fetched comment's `id`). GitHub allows only the
// comment's author to edit it; a forbidden or failed edit comes back as a message.
export async function editComment(
    repoPath: string,
    commentId: string,
    body: string,
    run: GhRunner = defaultRunner
): Promise<CommentMutationResult> {
    if (!repoPath || !commentId || !body.trim()) {
        return { ok: false, message: 'Nothing to save.' };
    }

    const query =
        'mutation($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){issueComment{id}}}';
    try {
        await run(
            [
                'api',
                'graphql',
                '-f',
                `query=${query}`,
                '-f',
                `id=${commentId}`,
                '-f',
                `body=${body}`,
            ],
            repoPath
        );
        return { ok: true };
    } catch (error) {
        return { ok: false, message: mutationError(error) };
    }
}

// Delete an existing PR comment via the GraphQL deleteIssueComment mutation, keyed
// on the comment's node id. As with editing, GitHub permits only the comment's
// author (or a maintainer); a forbidden or failed delete comes back as a message.
export async function deleteComment(
    repoPath: string,
    commentId: string,
    run: GhRunner = defaultRunner
): Promise<CommentMutationResult> {
    if (!repoPath || !commentId) {
        return { ok: false, message: 'Nothing to delete.' };
    }

    const query = 'mutation($id:ID!){deleteIssueComment(input:{id:$id}){clientMutationId}}';
    try {
        await run(['api', 'graphql', '-f', `query=${query}`, '-f', `id=${commentId}`], repoPath);
        return { ok: true };
    } catch (error) {
        return { ok: false, message: mutationError(error) };
    }
}

// Edit the PR's own description (body) via `gh pr edit`, addressed by number. An
// empty body is allowed (a PR can have no description); GitHub permits only the
// PR's author or a maintainer, and a forbidden or failed edit comes back as a
// message. The body is a single argv value, so no shell quoting is involved.
export async function editDescription(
    repoPath: string,
    prNumber: number,
    body: string,
    run: GhRunner = defaultRunner
): Promise<CommentMutationResult> {
    if (!repoPath || !prNumber) {
        return { ok: false, message: 'Nothing to save.' };
    }

    try {
        await run(['pr', 'edit', String(prNumber), '--body', body], repoPath);
        return { ok: true };
    } catch (error) {
        return { ok: false, message: mutationError(error) };
    }
}

// --- GitHub account switching (gh auth) ---
//
// gh can hold several authenticated accounts per host and keeps one active. The
// app surfaces them in the Git menu so the active account is visible and can be
// switched without leaving the app. These are host-level, not repo-level, so they
// run without an open repository (the cwd is immaterial to `gh auth`).

export type GhAccountStatus = 'ok' | 'not-installed' | 'not-authenticated' | 'error';

// One authenticated gh account on a host. `active` marks the one gh currently
// uses for that host.
export interface GhAccount {
    host: string;
    login: string;
    active: boolean;
}

export interface AccountsResult {
    status: GhAccountStatus;
    accounts: GhAccount[];
    message?: string;
}

export interface SwitchAccountResult {
    status: GhAccountStatus;
    message?: string;
}

// Parse the human-readable `gh auth status` output into accounts. gh has no JSON
// mode for this command, but the "Logged in to <host> account <login>" line and
// the "Active account: true/false" line beneath each are stable, and this stays
// robust to the detail lines (token, protocol, scopes) in between.
function parseAuthStatus(text: string): GhAccount[] {
    const accounts: GhAccount[] = [];
    for (const line of text.split('\n')) {
        const loggedIn = /Logged in to (\S+) account (\S+)/.exec(line);
        if (loggedIn) {
            accounts.push({ host: loggedIn[1]!, login: loggedIn[2]!, active: false });
            continue;
        }

        const active = /Active account:\s*(true|false)/i.exec(line);
        if (active && accounts.length > 0) {
            accounts[accounts.length - 1]!.active = active[1]!.toLowerCase() === 'true';
        }
    }

    return accounts;
}

// List the authenticated gh accounts and which is active. Never throws: a missing
// gh, no authentication, or an unexpected failure comes back as a status the menu
// acts on (it shows the Git menu only when this is 'ok').
export async function getAccounts(run: GhRunner = defaultRunner): Promise<AccountsResult> {
    try {
        const { stdout, stderr } = await run(['auth', 'status'], process.cwd());
        // gh has printed this status to stderr in some versions and stdout in
        // others, so parse both streams to find the accounts regardless.
        const accounts = parseAuthStatus(`${stdout}\n${stderr}`);
        if (accounts.length === 0) {
            return { status: 'not-authenticated', accounts: [] };
        }

        return { status: 'ok', accounts };
    } catch (error) {
        const err = error as {
            code?: string | number;
            stdout?: string | Buffer;
            stderr?: string | Buffer;
        };
        if (err.code === 'ENOENT') {
            return { status: 'not-installed', accounts: [] };
        }

        // gh exits non-zero when no account is logged in, yet may still print the
        // section it does know about; parse it before falling back to a status.
        const text = `${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}`;
        const accounts = parseAuthStatus(text);
        if (accounts.length > 0) {
            return { status: 'ok', accounts };
        }

        if (/not logged in|no accounts|not logged into/i.test(text)) {
            return { status: 'not-authenticated', accounts: [] };
        }

        return {
            status: 'error',
            accounts: [],
            message: String(err.stderr ?? '').trim() || 'gh auth status failed.',
        };
    }
}

// Switch the active gh account for a host. Returns a status rather than throwing
// so the caller can show a native error box on failure.
export async function switchAccount(
    login: string,
    host = 'github.com',
    run: GhRunner = defaultRunner
): Promise<SwitchAccountResult> {
    if (!login) {
        return { status: 'error', message: 'No account was specified.' };
    }

    try {
        await run(['auth', 'switch', '--hostname', host, '--user', login], process.cwd());
        return { status: 'ok' };
    } catch (error) {
        const err = error as { code?: string | number; stderr?: string | Buffer };
        if (err.code === 'ENOENT') {
            return { status: 'not-installed' };
        }

        const stderr = String(err.stderr ?? '');
        if (/not logged in|no accounts/i.test(stderr)) {
            return { status: 'not-authenticated' };
        }

        return { status: 'error', message: stderr.trim() || 'gh auth switch failed.' };
    }
}
