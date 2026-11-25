import { describe, it, expect } from 'vitest';
import { stackPositions } from '@/lib/pr-stacks';

const pr = (number: number, head: string, base: string, isCrossRepository = false) => ({
    number,
    headRefName: head,
    baseRefName: base,
    isCrossRepository,
});

describe('stackPositions', () => {
    it('numbers a stack from the trunk up, and leaves unstacked PRs out', () => {
        const positions = stackPositions([
            pr(3, 'c', 'b'),
            pr(1, 'a', 'development'),
            pr(2, 'b', 'a'),
            pr(9, 'x', 'development'),
        ]);

        expect(positions.get(1)).toEqual({ index: 1, total: 3 });
        expect(positions.get(2)).toEqual({ index: 2, total: 3 });
        expect(positions.get(3)).toEqual({ index: 3, total: 3 });
        expect(positions.has(9)).toBe(false);
    });

    it('lists a branching stack as one sequence', () => {
        const positions = stackPositions([pr(1, 'a', 'main'), pr(2, 'b', 'a'), pr(3, 'c', 'a')]);
        expect([1, 2, 3].map((n) => positions.get(n))).toEqual([
            { index: 1, total: 3 },
            { index: 2, total: 3 },
            { index: 3, total: 3 },
        ]);
    });

    it('does not stack PRs on an open PR from a trunk branch', () => {
        // An open "development into master" release PR: PRs on development are not
        // stacked on it.
        const positions = stackPositions([
            pr(10, 'development', 'master'),
            pr(11, 'feat', 'development'),
        ]);
        expect(positions.size).toBe(0);
    });

    it("ignores a fork's PR, whose branch is not on this repository", () => {
        expect(stackPositions([pr(1, 'a', 'main', true), pr(2, 'b', 'a')]).size).toBe(0);
    });
});
