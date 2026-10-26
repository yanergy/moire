import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type {
    ActivityEntry,
    DashboardPr,
    DashboardSnapshot,
    DashboardState,
    PrStatus,
} from '@/shared/types';

// The overview cards, in display order. Each card counts a set of PRs and opens a
// list of them. `dotClass` colors the card's status dot with the app's PR tones.
export type DashboardCategoryKey =
    | 'review'
    | 'changes'
    | 'ready'
    | 'failing'
    | 'mine'
    | 'stale'
    | 'drafts';

export interface DashboardCategory {
    key: DashboardCategoryKey;
    label: string;
    caption: string;
    dotClass: string;
    prs: DashboardPr[];
}

// An open PR with no activity for this long counts as stale.
export const STALE_DAYS = 7;

// Approved, checks passing (or none configured), no conflicts, not a draft.
// Restated from isReadyToMerge in electron/github/notifications.ts (the process
// split forbids importing it); keep the two in sync.
export function isReadyToMerge(pr: DashboardPr): boolean {
    return (
        pr.state === 'OPEN' &&
        !pr.isDraft &&
        pr.reviewDecision === 'APPROVED' &&
        (pr.ci === 'passing' || pr.ci === 'none') &&
        pr.mergeable === 'MERGEABLE'
    );
}

// Open a PR in Moiré's PR view by selecting its base and head as the range.
// A PR from a fork, or one whose branches are not available locally or as
// remote tracking branches, opens on GitHub instead.
function openPr(pr: DashboardPr) {
    const comparison = useComparisonStore();
    if (
        !pr.isCrossRepository &&
        comparison.selectPullRequestRange(pr.baseRefName, pr.headRefName)
    ) {
        useUiStore().setMainView('pr');
        return;
    }

    void window.api?.openExternal(pr.url);
}

// The GitHub dashboard for the repository open in Moiré. The data is owned by the
// notifier in the main process; this store mirrors the last state it sent and
// derives the overview cards from it. "Show drafts" filters every card.
export const useDashboardStore = defineStore('dashboard', () => {
    const status = ref<PrStatus>('ok');
    const message = ref<string | undefined>();
    const snapshot = ref<DashboardSnapshot | null>(null);
    const activity = ref<ActivityEntry[]>([]);
    const showDrafts = ref(true);
    const loading = ref(false);

    function applyState(state: DashboardState) {
        status.value = state.status;
        message.value = state.message;
        snapshot.value = state.snapshot;
        activity.value = state.activity;
        showDrafts.value = state.showDrafts;
    }

    // Run one dashboard call with the loading flag set. A rejection (no repository
    // open) is swallowed: the dashboard is simply not shown then.
    async function run(call: () => Promise<DashboardState>) {
        loading.value = true;
        try {
            applyState(await call());
        } catch {
            // No repository is open; nothing to show.
        } finally {
            loading.value = false;
        }
    }

    function load() {
        const api = window.api;
        return api ? run(() => api.getDashboard()) : Promise.resolve();
    }

    function refresh() {
        const api = window.api;
        return api ? run(() => api.refreshDashboard()) : Promise.resolve();
    }

    // Flip the toggle right away so the lists update without waiting on main.
    function setShowDrafts(show: boolean) {
        showDrafts.value = show;
        const api = window.api;
        return api ? run(() => api.setDashboardShowDrafts(show)) : Promise.resolve();
    }

    function visible(prs: DashboardPr[]): DashboardPr[] {
        return showDrafts.value ? prs : prs.filter((pr) => !pr.isDraft);
    }

    const toReview = computed(() => visible(snapshot.value?.toReview ?? []));

    // The viewer's open PRs, and every open PR in the repository (by any author).
    const mineOpen = computed(() =>
        visible((snapshot.value?.mine ?? []).filter((pr) => pr.state === 'OPEN'))
    );
    const allOpen = computed(() => visible(snapshot.value?.open ?? []));

    // Stale is measured against the fetch time, so it does not drift while the
    // dashboard sits open on old data.
    const staleBefore = computed(() => {
        const fetched = Date.parse(snapshot.value?.fetchedAt ?? '');
        return Number.isNaN(fetched) ? 0 : fetched - STALE_DAYS * 24 * 60 * 60 * 1000;
    });

    const categories = computed<DashboardCategory[]>(() => {
        const list: DashboardCategory[] = [
            {
                key: 'review',
                label: 'Needs your review',
                caption: 'Requested from you',
                dotClass: 'bg-moire-accent',
                prs: toReview.value,
            },
            {
                key: 'changes',
                label: 'Changes requested',
                caption: 'On your PRs',
                dotClass: 'bg-moire-changes-fg',
                prs: mineOpen.value.filter((pr) => pr.reviewDecision === 'CHANGES_REQUESTED'),
            },
            {
                key: 'ready',
                label: 'Ready to merge',
                caption: 'Approved, checks green',
                dotClass: 'bg-moire-pr-open',
                prs: mineOpen.value.filter(isReadyToMerge),
            },
            {
                key: 'failing',
                label: 'Failing checks',
                caption: 'Any author',
                dotClass: 'bg-moire-pr-closed',
                prs: allOpen.value.filter((pr) => pr.ci === 'failing'),
            },
            {
                key: 'mine',
                label: 'Your open PRs',
                caption: 'Authored by you',
                dotClass: 'bg-moire-pr-merged',
                prs: mineOpen.value,
            },
            {
                key: 'stale',
                label: 'Stale',
                caption: `No activity in ${STALE_DAYS}+ days`,
                dotClass: 'bg-moire-pr-draft',
                prs: allOpen.value.filter((pr) => Date.parse(pr.updatedAt) < staleBefore.value),
            },
        ];

        // Drafts are the viewer's own; the card goes away with "Show drafts".
        if (showDrafts.value) {
            list.push({
                key: 'drafts',
                label: 'Drafts',
                caption: 'Not ready for review',
                dotClass: 'bg-moire-pr-draft',
                prs: mineOpen.value.filter((pr) => pr.isDraft),
            });
        }

        return list;
    });

    // The header's "9 open in owner/name".
    const openCount = computed(() => allOpen.value.length);

    return {
        status,
        message,
        snapshot,
        activity,
        showDrafts,
        loading,
        toReview,
        categories,
        openCount,
        applyState,
        load,
        refresh,
        setShowDrafts,
        openPr,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDashboardStore, import.meta.hot));
}
