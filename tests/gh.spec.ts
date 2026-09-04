import { describe, it, expect, vi } from 'vitest';
import { getPullRequest, getAccounts, switchAccount, type GhRunner } from '../electron/github/gh';

// A gh PR record as `gh pr list --json` emits it (author is an object, and the
// conversation arrives as separate comments and reviews arrays).
const ghPr = {
    number: 42,
    title: 'Add cross-file navigation',
    body: '## Summary\nDoes the thing.',
    state: 'OPEN',
    url: 'https://github.com/o/r/pull/42',
    isDraft: false,
    author: { login: 'yanergy' },
    baseRefName: 'main',
    headRefName: 'feature',
    createdAt: '2026-09-01T00:00:00Z',
    additions: 10,
    deletions: 3,
    changedFiles: 2,
    commits: [{}, {}, {}],
    comments: [{ author: { login: 'bob' }, body: 'nice', createdAt: '2026-09-02T00:00:00Z' }],
    reviews: [
        {
            author: { login: 'ann' },
            body: 'looks good',
            state: 'APPROVED',
            submittedAt: '2026-09-03T00:00:00Z',
        },
        {
            author: { login: 'x' },
            body: '',
            state: 'COMMENTED',
            submittedAt: '2026-09-01T00:00:00Z',
        },
    ],
    labels: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature or request' }],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
};

// A runner that resolves the given stdout, capturing the args/cwd it was called with.
function okRunner(stdout: string) {
    const calls: { args: string[]; cwd: string }[] = [];
    const run: GhRunner = (args, cwd) => {
        calls.push({ args, cwd });
        return Promise.resolve({ stdout, stderr: '' });
    };
    return { run, calls };
}

// A runner that rejects with an error carrying the given fields, like execFile does.
function failRunner(error: { code?: string | number; stderr?: string }): GhRunner {
    return () => Promise.reject(Object.assign(new Error('gh failed'), error));
}

describe('getPullRequest', () => {
    it('maps a found PR, flattening the author to its login', async () => {
        const { run, calls } = okRunner(JSON.stringify([ghPr]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);

        expect(result.status).toBe('ok');
        expect(result.pr).toMatchObject({
            number: 42,
            title: 'Add cross-file navigation',
            body: '## Summary\nDoes the thing.',
            state: 'OPEN',
            author: 'yanergy',
            url: 'https://github.com/o/r/pull/42',
            baseRefName: 'main',
            headRefName: 'feature',
            additions: 10,
            deletions: 3,
            changedFiles: 2,
            commitCount: 3,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
        });
        expect(result.pr!.labels).toEqual([
            { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
        ]);

        // Runs in the repo directory and filters by the head branch.
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args).toContain('--head');
        expect(calls[0]!.args).toContain('feature');
    });

    it('merges comments and reviews into one chronological conversation, dropping empty reviews', async () => {
        const { run } = okRunner(JSON.stringify([ghPr]));
        const result = await getPullRequest('/repo', 'main', 'feature', run);

        // The bare COMMENTED review (empty body) is dropped; the comment and the
        // approval remain, ordered by time.
        expect(result.pr!.comments).toEqual([
            { author: 'bob', body: 'nice', createdAt: '2026-09-02T00:00:00Z', kind: 'comment' },
            {
                author: 'ann',
                body: 'looks good',
                createdAt: '2026-09-03T00:00:00Z',
                kind: 'review',
                state: 'APPROVED',
            },
        ]);
    });

    it('reports no-pr for an empty gh result', async () => {
        const { run } = okRunner('[]');
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        expect(result).toEqual({ status: 'no-pr', pr: null });
    });

    it('short-circuits to no-pr for the working-tree head without calling gh', async () => {
        const run = vi.fn<GhRunner>();
        const result = await getPullRequest('/repo', 'main', 'WORKING TREE', run);

        expect(result).toEqual({ status: 'no-pr', pr: null });
        expect(run).not.toHaveBeenCalled();
    });

    it('reports not-installed when gh is not on PATH (ENOENT)', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({ code: 'ENOENT' })
        );
        expect(result.status).toBe('not-installed');
    });

    it('reports not-authenticated from the auth error on stderr', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({
                code: 1,
                stderr: 'To get started with GitHub CLI, please run: gh auth login',
            })
        );
        expect(result.status).toBe('not-authenticated');
    });

    it('reports not-a-github-repo when no remote points at GitHub', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({
                code: 1,
                stderr: 'none of the git remotes configured for this repository point to a known GitHub host',
            })
        );
        expect(result.status).toBe('not-a-github-repo');
    });

    it('reports a generic error with the stderr message for anything else', async () => {
        const result = await getPullRequest(
            '/repo',
            'main',
            'feature',
            failRunner({ code: 1, stderr: 'the server is on fire' })
        );
        expect(result.status).toBe('error');
        expect(result.message).toBe('the server is on fire');
    });

    it('reports an error when gh output is not valid JSON', async () => {
        const { run } = okRunner('not json at all');
        const result = await getPullRequest('/repo', 'main', 'feature', run);
        expect(result.status).toBe('error');
        expect(result.pr).toBeNull();
    });
});

// `gh auth status` output as gh prints it, with a token and detail lines between
// the account lines the parser cares about.
const authStatus = [
    'github.com',
    '  ✓ Logged in to github.com account yanergy (keyring)',
    '  - Active account: true',
    '  - Git operations protocol: ssh',
    '  - Token scopes: gist, read:org, repo',
    '  ✓ Logged in to github.com account octocat (keyring)',
    '  - Active account: false',
    '  - Git operations protocol: https',
].join('\n');

describe('getAccounts', () => {
    it('lists the accounts and marks the active one', async () => {
        const { run, calls } = okRunner(authStatus);
        const result = await getAccounts(run);

        expect(result.status).toBe('ok');
        expect(result.accounts).toEqual([
            { host: 'github.com', login: 'yanergy', active: true },
            { host: 'github.com', login: 'octocat', active: false },
        ]);
        expect(calls[0]!.args).toEqual(['auth', 'status']);
    });

    it('reports not-installed when gh is not on PATH (ENOENT)', async () => {
        const result = await getAccounts(failRunner({ code: 'ENOENT' }));
        expect(result.status).toBe('not-installed');
        expect(result.accounts).toEqual([]);
    });

    it('reports not-authenticated when no account is signed in', async () => {
        const result = await getAccounts(
            failRunner({ code: 1, stderr: 'You are not logged into any GitHub hosts.' })
        );
        expect(result.status).toBe('not-authenticated');
        expect(result.accounts).toEqual([]);
    });
});

describe('switchAccount', () => {
    it('switches to the given account on the host', async () => {
        const { run, calls } = okRunner('');
        const result = await switchAccount('octocat', 'github.com', run);

        expect(result.status).toBe('ok');
        expect(calls[0]!.args).toEqual([
            'auth',
            'switch',
            '--hostname',
            'github.com',
            '--user',
            'octocat',
        ]);
    });

    it('reports not-installed when gh is not on PATH (ENOENT)', async () => {
        const result = await switchAccount('octocat', 'github.com', failRunner({ code: 'ENOENT' }));
        expect(result.status).toBe('not-installed');
    });

    it('surfaces the stderr message on any other failure', async () => {
        const result = await switchAccount(
            'octocat',
            'github.com',
            failRunner({ code: 1, stderr: 'no such account' })
        );
        expect(result.status).toBe('error');
        expect(result.message).toBe('no such account');
    });
});
