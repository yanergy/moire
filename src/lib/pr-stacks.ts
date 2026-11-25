// Where each open PR sits in its stack, for the dashboard's stack badges. A PR is
// stacked when its base branch is another open PR's head branch; the PRs linked
// that way form one stack, numbered from the trunk up (1 is the PR on the trunk,
// dependents follow depth first, so a branching stack still reads as one
// sequence). The main process works out the PR view's own stack the same way
// (buildStack in electron/github/gh.ts), with merged base PRs too.

export interface StackPosition {
    index: number; // 1-based
    total: number;
    // The stack it is in: its bottom PR's number and title, and the branch that PR
    // is on.
    stackId: number;
    stackTitle: string;
    trunk: string;
}

interface StackablePr {
    number: number;
    title?: string;
    headRefName: string;
    baseRefName: string;
    isCrossRepository?: boolean;
}

// Trunk branch names. A PR from one of these (a "development into master" release
// PR, say) is not a base PR others stack on, or every PR on that trunk would read
// as stacked. Keep in step with LONG_LIVED_BRANCHES in electron/github/gh.ts.
const LONG_LIVED_BRANCHES = new Set([
    'main',
    'master',
    'develop',
    'development',
    'dev',
    'staging',
    'production',
    'release',
]);

// Positions by PR number, for the PRs in a stack of two or more. A fork's PR is
// left out: its head branch is not on this repository, so nothing stacks on it.
export function stackPositions(prs: StackablePr[]): Map<number, StackPosition> {
    const own = prs.filter((pr) => !pr.isCrossRepository);
    const byHead = new Map(
        own
            .filter((pr) => !LONG_LIVED_BRANCHES.has(pr.headRefName))
            .map((pr) => [pr.headRefName, pr])
    );
    const children = new Map<string, StackablePr[]>();
    for (const pr of own) {
        if (byHead.has(pr.baseRefName) && pr.baseRefName !== pr.headRefName) {
            const list = children.get(pr.baseRefName) ?? [];
            list.push(pr);
            children.set(pr.baseRefName, list);
        }
    }

    const positions = new Map<number, StackPosition>();
    // Roots sit on a branch that is not another open PR's head (the trunk).
    for (const root of byHead.values()) {
        if (byHead.has(root.baseRefName) || !children.has(root.headRefName)) {
            continue;
        }

        const order: StackablePr[] = [];
        const seen = new Set<string>();
        const walk = (pr: StackablePr) => {
            if (seen.has(pr.headRefName)) {
                return;
            }

            seen.add(pr.headRefName);
            order.push(pr);
            for (const child of children.get(pr.headRefName) ?? []) {
                walk(child);
            }
        };
        walk(root);

        order.forEach((pr, i) =>
            positions.set(pr.number, {
                index: i + 1,
                total: order.length,
                stackId: root.number,
                stackTitle: root.title ?? '',
                trunk: root.baseRefName,
            })
        );
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
