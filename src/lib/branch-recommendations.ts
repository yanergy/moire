// The refs suggested at the top of each ref picker, most likely first. Kept as
// pure functions so the order and fallbacks are unit-tested without mounting
// the picker.
import type { BranchInfo } from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';

export interface RefRecommendation {
    name: string;
    meta: string; // the short note shown beside the row, explaining the pick
}

// The remote's default branch is the origin/HEAD target. When origin/HEAD was
// never set (a repo created locally and pushed later) the conventional default
// names stand in for it.
function defaultBranch(list: BranchInfo[]): string | undefined {
    const flagged = list.find((b) => b.kind === 'remote' && b.isDefault);
    if (flagged) {
        return flagged.name;
    }

    return ['origin/main', 'origin/master', 'main', 'master'].find((name) =>
        list.some((b) => b.name === name)
    );
}

function currentBranch(list: BranchInfo[]): string | undefined {
    return list.find((b) => b.kind === 'local' && b.isCurrent)?.name;
}

// Drops missing candidates and repeats, keeping the first (most likely) note.
function collect(candidates: [string | undefined, string][]): RefRecommendation[] {
    const result: RefRecommendation[] = [];
    for (const [name, meta] of candidates) {
        if (!name || result.some((r) => r.name === name)) {
            continue;
        }

        result.push({ name, meta });
    }

    return result;
}

// `origin/development` is where feature branches are usually merged, so it is
// the most likely base, then the default branch a release or hotfix targets.
// The checked-out branch closes the list: against the working tree it shows
// the uncommitted work.
export function recommendedBase(list: BranchInfo[]): RefRecommendation[] {
    const development = list.some((b) => b.name === 'origin/development')
        ? 'origin/development'
        : undefined;
    return collect([
        [development, ''],
        [defaultBranch(list), 'default'],
        [currentBranch(list), 'current'],
    ]);
}

// The head is usually the work in progress: what is on disk, or the branch that
// is checked out.
export function recommendedHead(list: BranchInfo[]): RefRecommendation[] {
    return collect([
        [WORKING_TREE, 'on disk'],
        [currentBranch(list), 'current'],
    ]);
}
