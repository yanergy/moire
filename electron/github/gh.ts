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
// description in Markdown, which is the whole point of the feature.
const PR_FIELDS = 'number,title,body,state,url,isDraft,author,baseRefName,headRefName,createdAt';

// Why a PR view is empty, so the renderer can show the right hint instead of a
// bare "nothing here". Mirrors PrStatus in src/shared/types.ts.
export type PrStatus =
    | 'ok'
    | 'no-pr'
    | 'not-installed'
    | 'not-authenticated'
    | 'not-a-github-repo'
    | 'error';

export interface PullRequest {
    number: number;
    title: string;
    body: string;
    state: string; // OPEN | CLOSED | MERGED
    isDraft: boolean;
    author: string; // GitHub login
    url: string;
    baseRefName: string;
    headRefName: string;
    createdAt: string;
}

export interface PullRequestResult {
    status: PrStatus;
    pr: PullRequest | null;
    message?: string; // human-readable detail for the 'error' status
}

// The raw shape `gh pr list --json` emits for each PR. `author` is an object; the
// rest map straight through.
interface GhPr {
    number: number;
    title: string;
    body: string;
    state: string;
    url: string;
    isDraft: boolean;
    author: { login?: string } | null;
    baseRefName: string;
    headRefName: string;
    createdAt: string;
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

function toPullRequest(pr: GhPr): PullRequest {
    return {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        state: pr.state,
        isDraft: pr.isDraft,
        author: pr.author?.login ?? '',
        url: pr.url,
        baseRefName: pr.baseRefName,
        headRefName: pr.headRefName,
        createdAt: pr.createdAt,
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
