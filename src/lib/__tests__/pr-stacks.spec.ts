import { describe, it, expect } from 'vitest';
import { gitHubStackPositions, groupByStack } from '@/lib/pr-stacks';

// A PR in GitHub stack 1 at `position`, of `size`, targeting `main`; no stack when
// `position` is omitted.
const pr = (number: number, position?: number, size = 3, title = `PR ${number}`) => ({
    number,
    title,
    stack: position === undefined ? null : { number: 1, size, baseRefName: 'main', position },
});

describe('gitHubStackPositions', () => {
    it('numbers a stack by GitHub position, and leaves PRs outside a stack out', () => {
        const positions = gitHubStackPositions([
            pr(3, 3),
            pr(1, 1, 3, 'Add the base'),
            pr(2, 2),
            pr(9),
        ]);

        expect(positions.get(1)).toEqual({
            index: 1,
            total: 3,
            stackId: 1,
            stackTitle: 'Add the base',
            trunk: 'main',
        });
        expect(positions.get(2)).toMatchObject({ index: 2, total: 3, stackId: 1 });
        expect(positions.get(3)).toMatchObject({ index: 3, total: 3, stackId: 1 });
        expect(positions.has(9)).toBe(false);
    });

    it('does not infer a stack from branch names', () => {
        // Two PRs whose branches chain, but which GitHub has in no stack.
        const positions = gitHubStackPositions([
            { number: 1, title: 'a', stack: null },
            { number: 2, title: 'b', stack: null },
        ]);
        expect(positions.size).toBe(0);
    });

    it('leaves the stack title empty when its bottom PR is not among the given PRs', () => {
        const positions = gitHubStackPositions([pr(2, 2)]);
        expect(positions.get(2)?.stackTitle).toBe('');
    });
});

describe('groupByStack', () => {
    it('gathers each stack in stack order where its first PR was, leaving the rest as is', () => {
        const list = [pr(5), pr(3, 3), pr(20), pr(1, 1), pr(19), pr(2, 2)];
        const items = groupByStack(list, gitHubStackPositions(list));

        expect(
            items.map((item) =>
                item.kind === 'pr' ? item.pr.number : item.members.map((m) => m.pr.number)
            )
        ).toEqual([5, [1, 2, 3], 20, 19]);
        expect(items[1]).toMatchObject({ kind: 'stack', stackId: 1, trunk: 'main', total: 3 });
    });

    it('fills in the PRs of a stack the list leaves out, marked as not in it', () => {
        const all = [pr(1, 1), pr(2, 2), pr(3, 3)];
        const byNumber = new Map(all.map((p) => [p.number, p]));
        const items = groupByStack([all[2]!, all[0]!], gitHubStackPositions(all), byNumber);
        expect(items).toEqual([
            {
                kind: 'stack',
                stackId: 1,
                title: 'PR 1',
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
        const all = [pr(1, 1, 2, 'Add the base'), pr(2, 2, 2, 'Build on it')];
        // Even when the list holds only a later PR of the stack.
        const items = groupByStack([all[1]!], gitHubStackPositions(all));
        expect(items[0]).toMatchObject({ kind: 'stack', title: 'Add the base' });
    });
});
