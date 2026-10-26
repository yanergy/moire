<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, LayoutDashboard, LoaderCircle, RefreshCw, TriangleAlert } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useDashboardStore } from '@/stores/dashboard';
import { activityLabel, dashboardNotice } from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';
import type { ActivityEntry, DashboardPr } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import PrStatusBox from '@/components/pr/PrStatusBox.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import DashboardSection from '@/components/dashboard/DashboardSection.vue';

// A quick overview of the open repository's pull requests that need the signed in
// account's attention: review requests, its own open PRs grouped by what they
// need, PRs recently closed without merge, and the notifications it was sent. The
// data comes from the notifier in the main process (see stores/dashboard.ts).
const comparison = useComparisonStore();
const dashboard = useDashboardStore();

// One clock for every "3h ago", ticking so the ages stay current while open.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
    void dashboard.load();
    clock = setInterval(() => {
        now.value = Date.now();
    }, 30_000);
});

onBeforeUnmount(() => clearInterval(clock));

// Another repository opened while the dashboard is showing: load its data.
watch(
    () => comparison.repoPath,
    () => void dashboard.load()
);

const notice = computed(() => {
    const base = dashboardNotice(dashboard.status, dashboard.message);
    if (!base) {
        return null;
    }
    // Stale data stays on screen below a failed refresh; say how old it is.
    const detail = dashboard.snapshot
        ? `${base.detail} Showing data from ${timeSince(Date.parse(dashboard.snapshot.fetchedAt), now.value)}.`
        : base.detail;
    return {
        icon: TriangleAlert,
        iconCls: 'text-moire-warn',
        title: base.title,
        detail,
        cls: 'border-moire-changes-edge bg-moire-changes-bg',
    };
});

const openCount = computed(() =>
    dashboard.groups.reduce((total, group) => total + group.prs.length, 0)
);

const isEmpty = computed(
    () =>
        dashboard.snapshot !== null &&
        dashboard.toReview.length === 0 &&
        openCount.value === 0 &&
        dashboard.recentlyClosed.length === 0
);

const updated = computed(() =>
    dashboard.snapshot
        ? `Updated ${timeSince(Date.parse(dashboard.snapshot.fetchedAt), now.value)}`
        : ''
);

function openPr(pr: DashboardPr) {
    dashboard.openPr(pr);
}

// An activity entry only carries the PR's number; open the full PR when it is
// still in the snapshot, otherwise its GitHub page.
function openActivity(entry: ActivityEntry) {
    const snapshot = dashboard.snapshot;
    const pr = [...(snapshot?.toReview ?? []), ...(snapshot?.mine ?? [])].find(
        (candidate) => candidate.number === entry.number
    );
    if (pr) {
        openPr(pr);
    } else {
        void window.api?.openExternal(entry.url);
    }
}
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <ScrollArea class="dashboard-scroll-area min-h-0 flex-1">
            <div class="w-full max-w-[1040px] px-4 pt-4 pb-8">
                <!-- Header: title and repository, the summary line, and the
                     refresh and Show drafts controls. -->
                <div class="flex items-start gap-3 border-b border-moire-border pb-4">
                    <LayoutDashboard :size="20" class="mt-0.5 shrink-0 text-moire-muted" />
                    <div class="min-w-0 flex-1">
                        <div class="text-[18px] leading-[1.35] font-bold text-moire-fg">
                            Dashboard
                            <span v-if="dashboard.snapshot" class="font-normal text-moire-faint">
                                {{ dashboard.snapshot.repo }}
                            </span>
                        </div>
                        <div v-if="dashboard.snapshot" class="mt-1 text-[13px] text-moire-muted">
                            {{ dashboard.summary }}
                            <span class="text-moire-faint"> · {{ updated }}</span>
                        </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                        <Toggle
                            variant="outline"
                            size="sm"
                            :model-value="dashboard.showDrafts"
                            class="h-7 gap-1.5 border border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=on]:bg-moire-hover data-[state=on]:text-moire-fg"
                            aria-label="Show drafts"
                            title="Include draft PRs in the dashboard and in notifications"
                            @update:model-value="dashboard.setShowDrafts($event)"
                        >
                            <!-- The checkbox look of the PR view's Edit mode toggle,
                                 for the same reason: a real Checkbox renders a button,
                                 which would be invalid inside this Toggle. -->
                            <span
                                class="flex size-[15px] shrink-0 items-center justify-center rounded-sm border"
                                :class="
                                    dashboard.showDrafts
                                        ? 'border-moire-fg bg-moire-fg text-moire-check-fg'
                                        : 'border-current'
                                "
                            >
                                <Check v-if="dashboard.showDrafts" class="size-[11px]" />
                            </span>
                            Show drafts
                        </Toggle>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            class="size-7 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            aria-label="Refresh"
                            title="Refresh"
                            :disabled="dashboard.loading"
                            @click="dashboard.refresh()"
                        >
                            <RefreshCw :size="16" :class="{ 'animate-spin': dashboard.loading }" />
                        </Button>
                    </div>
                </div>

                <div v-if="notice" class="pt-4">
                    <pr-status-box :status="notice" />
                </div>

                <div
                    v-if="!dashboard.snapshot && dashboard.loading"
                    class="flex items-center gap-2 py-10 text-[13px] text-moire-muted"
                >
                    <LoaderCircle :size="16" class="animate-spin" />
                    Loading pull requests…
                </div>

                <div v-if="isEmpty" class="py-10 text-[13px] text-moire-muted">
                    Nothing needs your attention right now.
                </div>

                <dashboard-section
                    v-if="dashboard.toReview.length"
                    title="To review"
                    :count="dashboard.toReview.length"
                >
                    <dashboard-pr-row
                        v-for="pr in dashboard.toReview"
                        :key="pr.id"
                        :pr="pr"
                        :now="now"
                        @open="openPr"
                    />
                </dashboard-section>

                <dashboard-section v-if="openCount" title="Your open PRs" :count="openCount">
                    <template v-for="group in dashboard.groups" :key="group.key">
                        <div
                            class="flex items-center gap-2 bg-moire-chrome px-3 py-1.5 text-[12px] font-medium text-moire-muted"
                        >
                            {{ group.label }}
                            <span class="text-moire-faint">{{ group.prs.length }}</span>
                        </div>
                        <dashboard-pr-row
                            v-for="pr in group.prs"
                            :key="pr.id"
                            :pr="pr"
                            :now="now"
                            @open="openPr"
                        />
                    </template>
                </dashboard-section>

                <dashboard-section
                    v-if="dashboard.recentlyClosed.length"
                    title="Recently closed without merge"
                    :count="dashboard.recentlyClosed.length"
                >
                    <dashboard-pr-row
                        v-for="pr in dashboard.recentlyClosed"
                        :key="pr.id"
                        :pr="pr"
                        :now="now"
                        @open="openPr"
                    />
                </dashboard-section>

                <dashboard-section
                    v-if="dashboard.activity.length"
                    title="Recent activity"
                    :count="dashboard.activity.length"
                >
                    <button
                        v-for="(entry, i) in dashboard.activity"
                        :key="`${entry.at}-${entry.kind}-${entry.number}-${i}`"
                        type="button"
                        class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-moire-hover"
                        @click="openActivity(entry)"
                    >
                        <span class="min-w-0 flex-1 truncate text-[13px]">
                            <span class="text-moire-fg">{{ activityLabel(entry) }}</span>
                            <span class="text-moire-muted">
                                · #{{ entry.number }} {{ entry.title }}</span
                            >
                        </span>
                        <span class="shrink-0 text-[12px] text-moire-faint">
                            {{ timeSince(Date.parse(entry.at), now) }}
                        </span>
                    </button>
                </dashboard-section>
            </div>
        </ScrollArea>
    </div>
</template>

<!-- Unscoped for the same reason as the PR view's (see PrView.vue): reka's scroll
     viewport wraps the slot in a width-less block, so force it full width and
     center the content column. Keyed to this view's scroll area. -->
<style>
.dashboard-scroll-area [data-reka-scroll-area-viewport] > div {
    display: flex;
    width: 100%;
    justify-content: center;
}
</style>
