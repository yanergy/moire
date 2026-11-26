// Where each open PR sits in its GitHub stack, for the dashboard's stack groups. The
// positions come from the stack GitHub reports on each PR (its `stack` on
// DashboardPr), so no branch names are read: a PR whose base is another PR's head
// is only grouped when GitHub has them in one stack.

import type { PrStackMembership } from '@/shared/types';

export interface StackPosition {
    index: number; // 1-based, from the trunk up
    total: number;
    // The stack it is in: GitHub's stack number, the title of its bottom PR (when that
    // PR is among the given ones), and the trunk branch the stack targets.
    stackId: number;
    stackTitle: string;
    trunk: string;
}

interface StackablePr {
    number: number;
    title?: string;
    stack?: PrStackMembership | null;
}

// Positions by PR number, for the PRs GitHub has in a stack.
export function gitHubStackPositions(prs: StackablePr[]): Map<number, StackPosition> {
    const bottomTitles = new Map<number, string>();
    for (const pr of prs) {
        if (pr.stack?.position === 1) {
            bottomTitles.set(pr.stack.number, pr.title ?? '');
        }
    }

    const positions = new Map<number, StackPosition>();
    for (const pr of prs) {
        const stack = pr.stack;
        if (!stack) {
            continue;
        }

        positions.set(pr.number, {
            index: stack.position,
            total: stack.size,
            stackId: stack.number,
            stackTitle: bottomTitles.get(stack.number) ?? '',
            trunk: stack.baseRefName,
        });
    }

    return positions;
}

// A list of PRs as the dashboard shows it: each stack gathered into one group, in
// stack order, at the place of its first PR in the list; every other PR as is. A
// group holds its whole stack: the PRs missing from the list (filtered out of a
// card) are filled in from `all` and marked `inList: false`, for showing dimmed.
export interface StackMember<T> {
    pr: T;
    inList: boolean;
}

export type StackListItem<T> =
    | { kind: 'pr'; pr: T }
    | {
          kind: 'stack';
          stackId: number;
          title: string;
          trunk: string;
          total: number;
          members: StackMember<T>[];
      };

export function groupByStack<T extends { number: number }>(
    prs: T[],
    positions: Map<number, StackPosition>,
    all: Map<number, T> = new Map()
): StackListItem<T>[] {
    const items: StackListItem<T>[] = [];
    const groups = new Map<number, Extract<StackListItem<T>, { kind: 'stack' }>>();
    for (const pr of prs) {
        const position = positions.get(pr.number);
        if (!position) {
            items.push({ kind: 'pr', pr });
            continue;
        }

        let group = groups.get(position.stackId);
        if (!group) {
            group = {
                kind: 'stack',
                stackId: position.stackId,
                title: position.stackTitle,
                trunk: position.trunk,
                total: position.total,
                members: [],
            };
            groups.set(position.stackId, group);
            items.push(group);
        }
        group.members.push({ pr, inList: true });
    }

    for (const [number, position] of positions) {
        const group = groups.get(position.stackId);
        const pr = all.get(number);
        if (group && pr && !group.members.some((m) => m.pr.number === number)) {
            group.members.push({ pr, inList: false });
        }
    }

    const indexOf = (member: StackMember<T>) => positions.get(member.pr.number)!.index;
    for (const group of groups.values()) {
        group.members.sort((a, b) => indexOf(a) - indexOf(b));
    }

    return items;
}
