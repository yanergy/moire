import { describe, it, expect } from 'vitest';
import { groupByStack, stackPositions } from '@/lib/pr-stacks';

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

        expect(positions.get(1)).toEqual({
            index: 1,
            total: 3,
            stackId: 1,
            stackTitle: '',
            trunk: 'development',
        });
        expect(positions.get(2)).toMatchObject({ index: 2, total: 3, stackId: 1 });
        expect(positions.get(3)).toMatchObject({ index: 3, total: 3, stackId: 1 });
        expect(positions.has(9)).toBe(false);
    });

    it('lists a branching stack as one sequence', () => {
        const positions = stackPositions([pr(1, 'a', 'main'), pr(2, 'b', 'a'), pr(3, 'c', 'a')]);
        expect([1, 2, 3].map((n) => positions.get(n)?.index)).toEqual([1, 2, 3]);
        expect([1, 2, 3].map((n) => positions.get(n))).toMatchObject([
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

describe('groupByStack', () => {
    it('gathers each stack in stack order where its first PR was, leaving the rest as is', () => {
        const list = [
            pr(5, 'solo', 'main'),
            pr(3, 'c', 'b'),
            pr(20, 'y', 'x'),
            pr(1, 'a', 'main'),
            pr(19, 'x', 'main'),
            pr(2, 'b', 'a'),
        ];
        const items = groupByStack(list, stackPositions(list));

        expect(
            items.map((item) =>
                item.kind === 'pr' ? item.pr.number : item.members.map((m) => m.pr.number)
            )
        ).toEqual([5, [1, 2, 3], [19, 20]]);
        expect(items[1]).toMatchObject({ kind: 'stack', stackId: 1, trunk: 'main', total: 3 });
    });

    it('fills in the PRs of a stack the list leaves out, marked as not in it', () => {
        const all = [pr(1, 'a', 'main'), pr(2, 'b', 'a'), pr(3, 'c', 'b')];
        const byNumber = new Map(all.map((p) => [p.number, p]));
        const items = groupByStack([all[2]!, all[0]!], stackPositions(all), byNumber);
        expect(items).toEqual([
            {
                kind: 'stack',
                stackId: 1,
                title: '',
                trunk: 'main',
                total: 3,
                members: [
                    { pr: all[0], inList: true },
                    { pr: all[1], inList: false },
                    { pr: all[2], inList: true },
                ],
            },
        ]);
    });

    it('names a group after the first PR of its stack', () => {
        const all = [
            { number: 1, title: 'Add the base', headRefName: 'a', baseRefName: 'main' },
            { number: 2, title: 'Build on it', headRefName: 'b', baseRefName: 'a' },
        ];
        // Even when the list holds only a later PR of the stack.
        const items = groupByStack([all[1]!], stackPositions(all));
        expect(items[0]).toMatchObject({ kind: 'stack', title: 'Add the base' });
    });
});
