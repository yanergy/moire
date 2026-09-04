import { describe, it, expect, vi } from 'vitest';
import { getPullRequest, type GhRunner } from '../electron/github/gh';

// A gh PR record as `gh pr list --json` emits it (author is an object).
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
        });

        // Runs in the repo directory and filters by the head branch.
        expect(calls[0]!.cwd).toBe('/repo');
        expect(calls[0]!.args).toContain('--head');
        expect(calls[0]!.args).toContain('feature');
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
