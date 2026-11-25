// Where each open PR sits in its stack, for the dashboard's stack badges. A PR is
// stacked when its base branch is another open PR's head branch; the PRs linked
// that way form one stack, numbered from the trunk up (1 is the PR on the trunk,
// dependents follow depth first, so a branching stack still reads as one
// sequence). The main process works out the PR view's own stack the same way
// (buildStack in electron/github/gh.ts), with merged base PRs too.

export interface StackPosition {
    index: number; // 1-based
    total: number;
}

interface StackablePr {
    number: number;
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

        order.forEach((pr, i) => positions.set(pr.number, { index: i + 1, total: order.length }));
    }

    return positions;
}
