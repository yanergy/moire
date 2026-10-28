<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, LoaderCircle, RefreshCw, SlidersHorizontal, TriangleAlert } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { useDashboardStore } from '@/stores/dashboard';
import { dashboardNotice } from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';
import type { DashboardPr } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PrStatusBox from '@/components/pr/PrStatusBox.vue';
import DashboardCard from '@/components/dashboard/DashboardCard.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';

// A quick overview of the open repository's pull requests: a grid of cards, each
// counting one kind of PR (needs your review, changes requested, ...). Clicking a
// card lists its PRs; clicking a PR opens it. The data comes from the notifier in
// the main process (see stores/dashboard.ts).
const comparison = useComparisonStore();
const dashboard = useDashboardStore();
const ui = useUiStore();

// The card whose PR list is showing (null for the overview grid). Kept in the ui
// store, so the back/forward history can step between the overview and a card.
const selected = computed(
    () => dashboard.categories.find((category) => category.key === ui.dashboardCard) ?? null
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

// Another repository opened while the dashboard is showing: reload it (the page
// resets to the overview with the history, see MoirePage).
watch(
    () => comparison.repoPath,
    () => {
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

function openInBrowser(pr: DashboardPr) {
    void window.api?.openExternal(pr.url);
}

const subtitle = computed(() => {
    const snapshot = dashboard.snapshot;
    if (!snapshot) {
        return '';
    }
    return `${dashboard.openCount} ${dashboard.openLabel} in ${snapshot.repo}`;
});

// Keep the display menu open when a checkbox is toggled, so both can be set in
// one go (as the file tree's filter menu does).
function keepOpen(event: Event) {
    event.preventDefault();
}

// The file filter menu's popover surface and row styling.
const menuSurface = 'min-w-[180px] border-moire-border bg-moire-pop text-moire-fg';
const menuSurfaceStyle = { boxShadow: 'var(--moire-pop-shadow)' };
const menuRow = 'text-xs text-moire-file-fg focus:bg-moire-hover focus:text-moire-fg';

// The Cards submenu trigger's summary: "All", or how many of the cards show.
const cardsLabel = computed(() => {
    const options = dashboard.cardOptions;
    const shown = options.filter((card) => card.shown).length;
    return shown === options.length ? 'All' : `${shown} of ${options.length}`;
});

const updated = computed(() =>
    dashboard.snapshot
        ? `Updated ${timeSince(Date.parse(dashboard.snapshot.fetchedAt), now.value)}`
        : ''
);
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <ScrollArea class="dashboard-scroll-area min-h-0 flex-1">
            <div class="w-full max-w-[1200px] px-6 pt-8 pb-8">
                <!-- Header: the overview title with the open count (or, in a list,
                     the way back and the card's label), then the controls. -->
                <div class="flex min-h-8 items-center gap-3">
                    <template v-if="selected">
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-7 gap-1.5 px-2 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            @click="ui.setDashboardCard(null)"
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
                    <!-- Dashboard settings: drafts, whose PRs the cards count, which cards show,
                         and the merged period. Notifications have their own, on the notifications page. -->
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <Button
                                variant="outline"
                                size="sm"
                                class="h-7 shrink-0 gap-1.5 border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                                aria-label="Dashboard settings"
                            >
                                <SlidersHorizontal :size="16" />
                                Dashboard settings
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            :side-offset="6"
                            :class="menuSurface"
                            :style="menuSurfaceStyle"
                        >
                            <DropdownMenuCheckboxItem
                                :model-value="dashboard.showDrafts"
                                :class="menuRow"
                                title="Include draft PRs in the dashboard"
                                @select="keepOpen"
                                @update:model-value="dashboard.setShowDrafts($event)"
                            >
                                Show drafts
                            </DropdownMenuCheckboxItem>
                            <!-- Whose PRs the cards count: the signed in account by
                                 default, any mix of authors, or everyone. -->
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger :class="menuRow">
                                    Users
                                    <span class="flex-1 pl-3 text-right text-moire-faint">
                                        {{ dashboard.authorsLabel }}
                                    </span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    :class="menuSurface"
                                    :style="menuSurfaceStyle"
                                >
                                    <DropdownMenuCheckboxItem
                                        :model-value="dashboard.authors === 'all'"
                                        :class="menuRow"
                                        @select="keepOpen"
                                        @update:model-value="dashboard.toggleAllAuthors()"
                                    >
                                        All
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator class="bg-moire-border" />
                                    <DropdownMenuCheckboxItem
                                        v-for="login in dashboard.knownAuthors"
                                        :key="login"
                                        :model-value="dashboard.isAuthorSelected(login)"
                                        :class="menuRow"
                                        @select="keepOpen"
                                        @update:model-value="dashboard.toggleAuthorSelected(login)"
                                    >
                                        {{ login }}
                                        <span
                                            v-if="login === dashboard.snapshot?.login"
                                            class="text-moire-faint"
                                        >
                                            (you)
                                        </span>
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <!-- Which overview cards show. -->
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger :class="menuRow">
                                    Cards
                                    <span class="flex-1 pl-3 text-right text-moire-faint">
                                        {{ cardsLabel }}
                                    </span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    :class="menuSurface"
                                    :style="menuSurfaceStyle"
                                >
                                    <DropdownMenuCheckboxItem
                                        v-for="card in dashboard.cardOptions"
                                        :key="card.key"
                                        :model-value="card.shown"
                                        :class="menuRow"
                                        @select="keepOpen"
                                        @update:model-value="dashboard.toggleCard(card.key)"
                                    >
                                        {{ card.label }}
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <!-- The period the Merged card counts. -->
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger :class="menuRow">
                                    Merged
                                    <span class="flex-1 pl-3 text-right text-moire-faint">
                                        {{ dashboard.mergedPeriod === 'week' ? 'Week' : 'Month' }}
                                    </span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    :class="menuSurface"
                                    :style="menuSurfaceStyle"
                                >
                                    <DropdownMenuRadioGroup v-model="dashboard.mergedPeriod">
                                        <DropdownMenuRadioItem
                                            value="week"
                                            :class="menuRow"
                                            @select="keepOpen"
                                        >
                                            This week
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem
                                            value="month"
                                            :class="menuRow"
                                            @select="keepOpen"
                                        >
                                            This month
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                class="size-7 shrink-0 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                                aria-label="Refresh"
                                :disabled="dashboard.loading"
                                @click="dashboard.refresh()"
                            >
                                <RefreshCw
                                    :size="16"
                                    :class="{ 'animate-spin': dashboard.loading }"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
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
                            @open-in-browser="openInBrowser"
                        />
                    </div>
                    <div v-else class="py-10 text-[13px] text-moire-muted">
                        No pull requests here.
                    </div>
                </div>

                <!-- The overview: the card grid (as many columns as fit, four at
                     full width). -->
                <template v-else-if="dashboard.snapshot">
                    <p
                        v-if="!dashboard.categories.length"
                        class="py-10 text-[13px] text-moire-muted"
                    >
                        Every card is hidden. Turn them back on under Dashboard settings, Cards.
                    </p>
                    <div
                        v-else
                        class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 pt-6"
                    >
                        <dashboard-card
                            v-for="category in dashboard.categories"
                            :key="category.key"
                            :category="category"
                            @open="ui.setDashboardCard(category.key)"
                        />
                    </div>
                </template>
            </div>
        </ScrollArea>
    </div>
</template>

<!-- Unscoped for the same reason as the PR view's (see PrView.vue): reka's scroll
     viewport wraps the slot in a width-less block, so force it full width and
     center the content column. Keyed to this view's scroll area. -->
<style>
/* An opaque viewport, so Chromium paints the scroll layer in one color. Left
   transparent, the area below short content showed the parent through it and,
   on macOS, rendered a shade apart from the content, a seam across the view. */
.dashboard-scroll-area [data-reka-scroll-area-viewport] {
    background-color: var(--moire-app);
}

.dashboard-scroll-area [data-reka-scroll-area-viewport] > div {
    display: flex;
    width: 100%;
    justify-content: center;
}
</style>
