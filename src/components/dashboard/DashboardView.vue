<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, Check, LoaderCircle, RefreshCw, TriangleAlert } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useDashboardStore, type DashboardCategoryKey } from '@/stores/dashboard';
import { dashboardNotice } from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import PrStatusBox from '@/components/pr/PrStatusBox.vue';
import DashboardCard from '@/components/dashboard/DashboardCard.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';

// A quick overview of the open repository's pull requests: a grid of cards, each
// counting one kind of PR (needs your review, changes requested, ...). Clicking a
// card lists its PRs; clicking a PR opens it. The data comes from the notifier in
// the main process (see stores/dashboard.ts).
const comparison = useComparisonStore();
const dashboard = useDashboardStore();

// The card whose PR list is showing, or null for the overview grid.
const selectedKey = ref<DashboardCategoryKey | null>(null);
const selected = computed(
    () => dashboard.categories.find((category) => category.key === selectedKey.value) ?? null
);

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

// Another repository opened while the dashboard is showing: back to its overview.
watch(
    () => comparison.repoPath,
    () => {
        selectedKey.value = null;
        void dashboard.load();
    }
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

const subtitle = computed(() =>
    dashboard.snapshot ? `${dashboard.openCount} open in ${dashboard.snapshot.repo}` : ''
);

const updated = computed(() =>
    dashboard.snapshot
        ? `Updated ${timeSince(Date.parse(dashboard.snapshot.fetchedAt), now.value)}`
        : ''
);
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <ScrollArea class="dashboard-scroll-area min-h-0 flex-1">
            <div class="w-full max-w-[1040px] px-6 pt-8 pb-8">
                <!-- Header: the overview title with the open count (or, in a list,
                     the way back and the card's label), then the controls. -->
                <div class="flex min-h-8 items-center gap-3">
                    <template v-if="selected">
                        <Button
                            variant="ghost"
                            size="sm"
                            class="-ml-2 h-7 gap-1.5 px-2 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            @click="selectedKey = null"
                        >
                            <ArrowLeft :size="16" />
                            Overview
                        </Button>
                        <span class="text-moire-faint">/</span>
                        <span class="flex min-w-0 items-center gap-2">
                            <span class="size-2 shrink-0 rounded-full" :class="selected.dotClass" />
                            <span class="truncate text-[18px] font-bold text-moire-fg">
                                {{ selected.label }}
                            </span>
                            <span class="shrink-0 text-[13px] text-moire-muted">
                                {{ selected.prs.length }} · {{ selected.caption }}
                            </span>
                        </span>
                    </template>
                    <template v-else>
                        <span class="text-[18px] font-bold text-moire-fg">Overview</span>
                        <span class="truncate text-[13px] text-moire-muted">{{ subtitle }}</span>
                    </template>

                    <div class="flex-1" />

                    <span class="shrink-0 text-[12px] text-moire-faint">{{ updated }}</span>
                    <Toggle
                        variant="outline"
                        size="sm"
                        :model-value="dashboard.showDrafts"
                        class="h-7 shrink-0 gap-1.5 border border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=on]:bg-moire-hover data-[state=on]:text-moire-fg"
                        aria-label="Show drafts"
                        title="Include draft PRs in the dashboard and in notifications"
                        @update:model-value="dashboard.setShowDrafts($event)"
                    >
                        <!-- The checkbox look of the PR view's Edit mode toggle, for the
                             same reason: a real Checkbox renders a button, which would be
                             invalid inside this Toggle. -->
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
                        class="size-7 shrink-0 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                        aria-label="Refresh"
                        title="Refresh"
                        :disabled="dashboard.loading"
                        @click="dashboard.refresh()"
                    >
                        <RefreshCw :size="16" :class="{ 'animate-spin': dashboard.loading }" />
                    </Button>
                </div>

                <div v-if="notice" class="pt-5">
                    <pr-status-box :status="notice" />
                </div>

                <div
                    v-if="!dashboard.snapshot && dashboard.loading"
                    class="flex items-center gap-2 py-10 text-[13px] text-moire-muted"
                >
                    <LoaderCircle :size="16" class="animate-spin" />
                    Loading pull requests…
                </div>

                <!-- One card's PRs. -->
                <div v-else-if="selected" class="pt-6">
                    <div
                        v-if="selected.prs.length"
                        class="divide-y divide-moire-border overflow-hidden rounded-lg border border-moire-border"
                    >
                        <dashboard-pr-row
                            v-for="pr in selected.prs"
                            :key="pr.id"
                            :pr="pr"
                            :now="now"
                            @open="dashboard.openPr"
                        />
                    </div>
                    <div v-else class="py-10 text-[13px] text-moire-muted">
                        No pull requests here.
                    </div>
                </div>

                <!-- The overview grid. Fills as many columns as fit, four at full
                     width. -->
                <div
                    v-else-if="dashboard.snapshot"
                    class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 pt-6"
                >
                    <dashboard-card
                        v-for="category in dashboard.categories"
                        :key="category.key"
                        :category="category"
                        @open="selectedKey = category.key"
                    />
                </div>
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
