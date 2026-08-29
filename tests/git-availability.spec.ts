import { describe, it, expect, vi } from 'vitest';
import { isGitAvailable } from '../electron/ipc/handlers';

// isGitAvailable wraps `git.raw(['--version'])`. The runner is injected here so
// both outcomes are deterministic and no real git is spawned. handlers.cjs is
// CommonJS loaded natively under vitest, so its inner requires can't be mocked;
// injection is what keeps the probe testable.
describe('isGitAvailable', () => {
    it('is true when `git --version` succeeds', async () => {
        const raw = vi
            .fn<(args: string[]) => Promise<string>>()
            .mockResolvedValue('git version 2.39.5');
        expect(await isGitAvailable({ raw })).toBe(true);
        expect(raw).toHaveBeenCalledWith(['--version']);
    });

    it('is false when the git binary is missing or fails', async () => {
        const raw = vi
            .fn<(args: string[]) => Promise<string>>()
            .mockRejectedValue(new Error('spawn git ENOENT'));
        expect(await isGitAvailable({ raw })).toBe(false);
    });
});
