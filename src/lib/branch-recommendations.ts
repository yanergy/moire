// The refs suggested at the top of each ref picker, most likely first. Kept as
// pure functions so the order and fallbacks are unit-tested without mounting
// the picker.
import type { BranchInfo, RepoBranchSettings } from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';

export interface RefRecommendation {
    name: string;
    meta: string; // the short note shown beside the row, explaining the pick
}

// The repo's main and development branch, as the Settings page shows them and
// the ref pickers recommend them. Undefined when there is none.
export interface BranchRoles {
    main?: string;
    development?: string;
}

const MAIN_BRANCH_CANDIDATES = ['origin/main', 'origin/master', 'main', 'master'];

// Restated as DEVELOPMENT_BRANCH_CANDIDATES in electron/menu.ts for the Git menu's
// presets (the process split forbids sharing it); keep the two in sync.
export const DEVELOPMENT_BRANCH_CANDIDATES = [
    'origin/development',
    'origin/develop',
    'origin/dev',
    'development',
    'develop',
    'dev',
];

function firstPresent(list: BranchInfo[], names: string[]): string | undefined {
    return names.find((name) => list.some((b) => b.name === name));
}

// The remote's default branch is the origin/HEAD target. When origin/HEAD was
// never set (a repo created locally and pushed later) the conventional default
// names stand in for it.
export function detectMainBranch(list: BranchInfo[]): string | undefined {
    const flagged = list.find((b) => b.kind === 'remote' && b.isDefault);
    return flagged?.name ?? firstPresent(list, MAIN_BRANCH_CANDIDATES);
}

export function detectDevelopmentBranch(list: BranchInfo[]): string | undefined {
    return firstPresent(list, DEVELOPMENT_BRANCH_CANDIDATES);
}

// The main and development branch: the ones picked on the Settings page while
// they still exist, otherwise detected. A development branch set to None (null)
// stays absent.
export function resolveBranchRoles(
    list: BranchInfo[],
    settings: RepoBranchSettings = {}
): BranchRoles {
    const exists = (name: string | null | undefined): name is string =>
        !!name && list.some((b) => b.name === name);

    const main = exists(settings.main) ? settings.main : detectMainBranch(list);
    if (settings.development === null) {
        return { main };
    }

    const development = exists(settings.development)
        ? settings.development
        : detectDevelopmentBranch(list);
    return { main, development };
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

// The development branch is where feature branches are usually merged, so it is
// the most likely base, then the main branch a release or hotfix targets. The
// checked-out branch closes the list: against the working tree it shows the
// uncommitted work.
export function recommendedBase(
    list: BranchInfo[],
    roles: BranchRoles = resolveBranchRoles(list)
): RefRecommendation[] {
    return collect([
        [roles.development, ''],
        [roles.main, 'default'],
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
