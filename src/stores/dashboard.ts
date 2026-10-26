import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type {
    ActivityEntry,
    AuthorFilter,
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
    | 'open'
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

// The logins an author filter selects, or null for every author. `me` is the
// signed in login.
export function selectedAuthors(filter: AuthorFilter, me: string): Set<string> | null {
    if (filter === 'all') return null;
    return new Set(filter === 'me' ? [me] : filter);
}

// The filter after ticking or unticking one login in the Users submenu. Unticking
// someone while "All" is on keeps everyone else in `known`. A selection of just
// the signed in login collapses back to 'me', so it follows an account switch.
export function toggleAuthor(
    filter: AuthorFilter,
    login: string,
    me: string,
    known: string[]
): AuthorFilter {
    const selected = selectedAuthors(filter, me) ?? new Set(known);
    if (selected.has(login)) {
        selected.delete(login);
    } else {
        selected.add(login);
    }

    const list = known.filter((name) => selected.has(name));
    // Keep logins that are selected but no longer have an open PR.
    for (const name of selected) {
        if (!list.includes(name)) list.push(name);
    }
    return list.length === 1 && list[0] === me ? 'me' : list;
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
// derives the overview cards from it. "Show drafts" filters every card, and the
// author filter picks whose PRs they count (the viewer's own by default).
export const useDashboardStore = defineStore('dashboard', () => {
    const status = ref<PrStatus>('ok');
    const message = ref<string | undefined>();
    const snapshot = ref<DashboardSnapshot | null>(null);
    const activity = ref<ActivityEntry[]>([]);
    const showDrafts = ref(true);
    const authors = ref<AuthorFilter>('me');
    const loading = ref(false);

    function applyState(state: DashboardState) {
        status.value = state.status;
        message.value = state.message;
        snapshot.value = state.snapshot;
        activity.value = state.activity;
        showDrafts.value = state.showDrafts;
        authors.value = state.authors ?? 'me';
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

    function setAuthors(filter: AuthorFilter) {
        authors.value = filter;
        const api = window.api;
        return api ? run(() => api.setDashboardAuthors(filter)) : Promise.resolve();
    }

    const me = computed(() => snapshot.value?.login ?? '');

    // Everyone with an open PR in the repository, the viewer first, for the Users
    // submenu. The viewer is listed even without an open PR.
    const knownAuthors = computed(() => {
        const others = new Set<string>();
        for (const pr of snapshot.value?.open ?? []) {
            if (pr.author && pr.author !== me.value) others.add(pr.author);
        }
        // oxlint-disable-next-line unicorn/no-array-sort
        const sorted = [...others].sort((a, b) => a.localeCompare(b));
        return me.value ? [me.value, ...sorted] : sorted;
    });

    function isAuthorSelected(login: string): boolean {
        return selectedAuthors(authors.value, me.value)?.has(login) ?? true;
    }

    function toggleAuthorSelected(login: string) {
        return setAuthors(toggleAuthor(authors.value, login, me.value, knownAuthors.value));
    }

    // "All" toggles between every author and back to the viewer alone.
    function toggleAllAuthors() {
        return setAuthors(authors.value === 'all' ? 'me' : 'all');
    }

    // How the selection reads in the header and captions.
    const authorScope = computed(() => {
        const filter = authors.value;
        if (filter === 'me') return { open: 'open by you', caption: 'On your PRs' };
        if (filter === 'all') return { open: 'open', caption: 'Any author' };
        if (filter.length === 1) {
            return { open: `open by ${filter[0]}`, caption: `By ${filter[0]}` };
        }
        return {
            open: `open by ${filter.length} authors`,
            caption: `${filter.length} authors`,
        };
    });

    // The Users submenu trigger's summary of the selection.
    const authorsLabel = computed(() => {
        const filter = authors.value;
        if (filter === 'me') return 'You';
        if (filter === 'all') return 'All';
        return filter.length === 1 ? filter[0]! : `${filter.length} users`;
    });

    // A notification only carries its PR's number; open the full PR when the
    // snapshot still has it, otherwise its GitHub page.
    function openActivity(entry: ActivityEntry) {
        const snap = snapshot.value;
        const pr = [...(snap?.toReview ?? []), ...(snap?.mine ?? []), ...(snap?.open ?? [])].find(
            (candidate) => candidate.number === entry.number
        );
        if (pr) {
            openPr(pr);
        } else {
            void window.api?.openExternal(entry.url);
        }
    }

    function visible(prs: DashboardPr[]): DashboardPr[] {
        return showDrafts.value ? prs : prs.filter((pr) => !pr.isDraft);
    }

    const toReview = computed(() => visible(snapshot.value?.toReview ?? []));

    // The open PRs the cards count, by the author filter. The viewer's own come from
    // their own search, which covers more of them than the repository wide list
    // (capped at 100) and exists in snapshots saved before that list did.
    const scoped = computed(() => {
        const filter = authors.value;
        if (filter === 'me') {
            return visible((snapshot.value?.mine ?? []).filter((pr) => pr.state === 'OPEN'));
        }
        const selected = selectedAuthors(filter, me.value);
        const open = snapshot.value?.open ?? [];
        return visible(selected ? open.filter((pr) => selected.has(pr.author)) : open);
    });

    // Stale is measured against the fetch time, so it does not drift while the
    // dashboard sits open on old data.
    const staleBefore = computed(() => {
        const fetched = Date.parse(snapshot.value?.fetchedAt ?? '');
        return Number.isNaN(fetched) ? 0 : fetched - STALE_DAYS * 24 * 60 * 60 * 1000;
    });

    const categories = computed<DashboardCategory[]>(() => {
        const mine = authors.value === 'me';
        const author = authorScope.value.caption;
        const list: DashboardCategory[] = [
            // Review requests are addressed to the viewer whatever the scope.
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
                caption: author,
                dotClass: 'bg-moire-changes-fg',
                prs: scoped.value.filter((pr) => pr.reviewDecision === 'CHANGES_REQUESTED'),
            },
            {
                key: 'ready',
                label: 'Ready to merge',
                caption: 'Approved, checks green',
                dotClass: 'bg-moire-pr-open',
                prs: scoped.value.filter(isReadyToMerge),
            },
            {
                key: 'failing',
                label: 'Failing checks',
                caption: author,
                dotClass: 'bg-moire-pr-closed',
                prs: scoped.value.filter((pr) => pr.ci === 'failing'),
            },
            {
                key: 'open',
                label: mine ? 'Your open PRs' : 'Open PRs',
                caption: mine ? 'Authored by you' : author,
                dotClass: 'bg-moire-pr-merged',
                prs: scoped.value,
            },
            {
                key: 'stale',
                label: 'Stale',
                caption: `No activity in ${STALE_DAYS}+ days`,
                dotClass: 'bg-moire-pr-draft',
                prs: scoped.value.filter((pr) => Date.parse(pr.updatedAt) < staleBefore.value),
            },
        ];

        // The card goes away with "Show drafts" off.
        if (showDrafts.value) {
            list.push({
                key: 'drafts',
                label: 'Drafts',
                caption: 'Not ready for review',
                dotClass: 'bg-moire-pr-draft',
                prs: scoped.value.filter((pr) => pr.isDraft),
            });
        }

        return list;
    });

    // The header's "3 open by you in owner/name".
    const openCount = computed(() => scoped.value.length);
    const openLabel = computed(() => authorScope.value.open);

    return {
        status,
        message,
        snapshot,
        activity,
        showDrafts,
        authors,
        knownAuthors,
        authorsLabel,
        loading,
        toReview,
        categories,
        openCount,
        openLabel,
        applyState,
        load,
        refresh,
        setShowDrafts,
        setAuthors,
        isAuthorSelected,
        toggleAuthorSelected,
        toggleAllAuthors,
        openPr,
        openActivity,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDashboardStore, import.meta.hot));
}
