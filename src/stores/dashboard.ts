import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type {
    ActivityEntry,
    DashboardPr,
    DashboardSnapshot,
    DashboardState,
    PrStatus,
} from '@/shared/types';

// Where one of the viewer's open PRs lands on the dashboard, by what it needs
// most. A PR appears in exactly one group; the order here is the display order.
export type DashboardGroupKey =
    | 'changes-requested'
    | 'merge-conflict'
    | 'checks-failing'
    | 'ready'
    | 'approved'
    | 'waiting'
    | 'drafts';

export interface DashboardGroup {
    key: DashboardGroupKey;
    label: string;
    prs: DashboardPr[];
}

const GROUP_LABELS: Record<DashboardGroupKey, string> = {
    'changes-requested': 'Changes requested',
    'merge-conflict': 'Merge conflict',
    'checks-failing': 'Checks failing',
    ready: 'Ready to merge',
    approved: 'Approved',
    waiting: 'Waiting for review',
    drafts: 'Drafts',
};

const GROUP_ORDER = Object.keys(GROUP_LABELS) as DashboardGroupKey[];

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

export function groupOf(pr: DashboardPr): DashboardGroupKey {
    if (pr.isDraft) return 'drafts';
    if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes-requested';
    if (pr.mergeable === 'CONFLICTING') return 'merge-conflict';
    if (pr.ci === 'failing') return 'checks-failing';
    if (isReadyToMerge(pr)) return 'ready';
    if (pr.reviewDecision === 'APPROVED') return 'approved';
    return 'waiting';
}

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

// The GitHub dashboard for the repository open in Moiré. The data is owned by the
// notifier in the main process; this store mirrors the last state it sent and
// derives the dashboard's sections from it. "Show drafts" filters every list.
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

    const groups = computed<DashboardGroup[]>(() => {
        const open = visible((snapshot.value?.mine ?? []).filter((pr) => pr.state === 'OPEN'));
        return GROUP_ORDER.map((key) => ({
            key,
            label: GROUP_LABELS[key],
            prs: open.filter((pr) => groupOf(pr) === key),
        })).filter((group) => group.prs.length > 0);
    });

    // The viewer's PRs closed without merge (the snapshot only holds the last
    // 7 days), most recently closed first.
    const recentlyClosed = computed(() => {
        const closed = visible((snapshot.value?.mine ?? []).filter((pr) => pr.state === 'CLOSED'));
        // filter returns a fresh array, so sorting it in place mutates nothing
        // shared (and toSorted is not in the project's TS lib target).
        // oxlint-disable-next-line unicorn/no-array-sort
        return closed.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    });

    // The header line: "3 PRs to review, 1 needs changes".
    const summary = computed(() => {
        const count = (key: DashboardGroupKey) =>
            groups.value.find((group) => group.key === key)?.prs.length ?? 0;

        const parts: string[] = [];
        if (toReview.value.length) {
            parts.push(`${plural(toReview.value.length, 'PR', 'PRs')} to review`);
        }
        const changes = count('changes-requested');
        if (changes) parts.push(plural(changes, 'needs changes', 'need changes'));
        const conflicts = count('merge-conflict');
        if (conflicts)
            parts.push(plural(conflicts, 'has a merge conflict', 'have merge conflicts'));
        const failing = count('checks-failing');
        if (failing) parts.push(plural(failing, 'has failing checks', 'have failing checks'));
        const ready = count('ready');
        if (ready) parts.push(`${ready} ready to merge`);

        return parts.length ? parts.join(', ') : 'Nothing needs your attention';
    });

    return {
        status,
        message,
        snapshot,
        activity,
        showDrafts,
        loading,
        toReview,
        groups,
        recentlyClosed,
        summary,
        applyState,
        load,
        refresh,
        setShowDrafts,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDashboardStore, import.meta.hot));
}
