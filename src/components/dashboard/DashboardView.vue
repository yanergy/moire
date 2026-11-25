<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRefreshCooldown } from '@/composables/useRefreshCooldown';
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Layers,
    LoaderCircle,
    RefreshCw,
    Settings,
    TriangleAlert,
    Users,
} from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { useDashboardStore } from '@/stores/dashboard';
import { dashboardNotice, stackProgress } from '@/lib/dashboard';
import { groupByStack } from '@/lib/pr-stacks';
import { timeSince } from '@/lib/status-bar';
import type { DashboardPr } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuSeparator,
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

// The card's PRs with each stack gathered into one foldable group, in stack order
// (see lib/pr-stacks), so PRs that build on each other read together.
const selectedItems = computed(() =>
    groupByStack(selected.value?.prs ?? [], dashboard.prStackPositions, dashboard.openPrsByNumber)
);

// The stack progress ring's radius: a circumference of 100, so arc lengths are
// percentages (as in PrReviewers' ring).
const RING_RADIUS = 100 / (2 * Math.PI);

// A stack group's progress: how many are ready, and the ring's arcs (one per part,
// laid end to end, lengths as percentages), which the tooltip lists too.
function stackProgressOf(item: { members: { pr: DashboardPr }[] }) {
    const parts = stackProgress(item.members.map((m) => m.pr));
    const total = item.members.length;
    let offset = 0;
    const arcs = parts.map((part) => {
        const length = (part.count / total) * 100;
        const arc = { ...part, length, offset };
        offset += length;
        return arc;
    });
    return {
        ready: parts.find((part) => part.key === 'ready')?.count ?? 0,
        arcs,
    };
}

// The rows show their author's avatar only when the author filter can list
// several people (everyone, or two or more chosen); with one author it repeats.
const showAvatars = computed(() => {
    const authors = dashboard.authors;
    return authors === 'all' || (Array.isArray(authors) && authors.length > 1);
});

// Stack groups start open; a click on a group's header folds it.
const foldedStacks = ref<Set<number>>(new Set());
function toggleStack(stackId: number) {
    const next = new Set(foldedStacks.value);
    if (next.has(stackId)) {
        next.delete(stackId);
    } else {
        next.add(stackId);
    }
    foldedStacks.value = next;
}

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

// Keep the Users menu open when a checkbox is toggled, so several authors can be
// picked in one go (as the file tree's filter menu does).
function keepOpen(event: Event) {
    event.preventDefault();
}

// The file filter menu's popover surface and row styling.
const menuSurface = 'min-w-[180px] border-moire-border bg-moire-pop text-moire-fg';
const menuSurfaceStyle = { boxShadow: 'var(--moire-pop-shadow)' };
const menuRow = 'text-xs text-moire-file-fg focus:bg-moire-hover focus:text-moire-fg';

const updated = computed(() =>
    dashboard.snapshot
        ? `Updated ${timeSince(Date.parse(dashboard.snapshot.fetchedAt), now.value)}`
        : ''
);

// The refresh button rests for a few seconds after the dashboard was last fetched
// (by it or by the background poll), so clicks do not pile up GitHub requests.
const { coolingDown } = useRefreshCooldown(() => {
    const fetched = Date.parse(dashboard.snapshot?.fetchedAt ?? '');
    return Number.isNaN(fetched) ? null : fetched;
});
const refreshTooltip = computed(() => {
    if (dashboard.loading) {
        return 'Refreshing…';
    }

    return coolingDown.value ? 'Refreshed just now' : 'Refresh';
});
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
                    <!-- Whose PRs the cards count: the signed in account by default,
                         any mix of authors, or everyone. The other dashboard
                         settings are on the Settings page. -->
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <Button
                                variant="outline"
                                size="sm"
                                class="h-7 shrink-0 gap-1.5 border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                                aria-label="Users"
                            >
                                <Users :size="16" />
                                {{ dashboard.authorsLabel }}
                                <ChevronDown class="size-3 text-moire-faint" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            :side-offset="6"
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
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="outline"
                        size="sm"
                        class="h-7 shrink-0 gap-1.5 border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                        @click="ui.openSettings('dashboard')"
                    >
                        <Settings :size="16" />
                        Dashboard settings
                    </Button>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                class="size-7 shrink-0 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                                aria-label="Refresh"
                                data-slot="dashboard-refresh"
                                :disabled="dashboard.loading || coolingDown"
                                @click="dashboard.refresh()"
                            >
                                <RefreshCw
                                    :size="16"
                                    :class="{ 'animate-spin': dashboard.loading }"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{{ refreshTooltip }}</TooltipContent>
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
                        <template
                            v-for="item in selectedItems"
                            :key="item.kind === 'pr' ? item.pr.id : `stack-${item.stackId}`"
                        >
                            <dashboard-pr-row
                                v-if="item.kind === 'pr'"
                                :pr="item.pr"
                                :now="now"
                                :show-avatar="showAvatars"
                                @open="dashboard.openPr"
                                @open-in-browser="openInBrowser"
                            />
                            <!-- A stack: a header that folds it, then its PRs in stack
                                 order, indented behind a line. -->
                            <div v-else data-slot="stack-group">
                                <!-- Styled like a PR row: the stack's first PR as its
                                     title (so stacks on the same trunk tell apart), the
                                     trunk and PR count below. -->
                                <button
                                    type="button"
                                    data-slot="stack-group-header"
                                    class="flex w-full cursor-pointer items-center gap-3 px-3.5 py-4 text-left transition-colors hover:bg-moire-hover"
                                    :aria-expanded="!foldedStacks.has(item.stackId)"
                                    @click="toggleStack(item.stackId)"
                                >
                                    <ChevronRight
                                        v-if="foldedStacks.has(item.stackId)"
                                        :size="14"
                                        class="shrink-0 text-moire-faint"
                                    />
                                    <ChevronDown
                                        v-else
                                        :size="14"
                                        class="shrink-0 text-moire-faint"
                                    />
                                    <Layers :size="18" class="shrink-0 text-moire-muted" />
                                    <div class="min-w-0 flex-1">
                                        <div
                                            data-slot="stack-group-title"
                                            class="truncate text-[13px] font-medium text-moire-fg"
                                        >
                                            {{ item.title || `Stack on ${item.trunk}` }}
                                        </div>
                                        <div
                                            class="flex min-w-0 items-center gap-1.5 text-[12px] text-moire-faint"
                                        >
                                            <span class="shrink-0">
                                                Stack on
                                                <span class="font-mono text-[11px]">{{
                                                    item.trunk
                                                }}</span>
                                            </span>
                                            <span class="text-moire-faint">·</span>
                                            <span class="shrink-0">
                                                {{ item.members.length }}
                                                {{ item.members.length === 1 ? 'PR' : 'PRs' }}
                                            </span>
                                        </div>
                                    </div>
                                    <!-- How far the stack is: a ring like the Reviewers tab's,
                                         one arc per state (green ready to merge, yellow
                                         changes requested, red failing checks, grey waiting
                                         on review), the counts in its tooltip. -->
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <span
                                                data-slot="stack-group-progress"
                                                class="flex shrink-0 items-center gap-2 text-[12px] text-moire-muted"
                                            >
                                                {{ stackProgressOf(item).ready }}/{{
                                                    item.members.length
                                                }}
                                                ready to merge
                                                <svg
                                                    viewBox="0 0 36 36"
                                                    class="size-5 -rotate-90"
                                                    aria-hidden="true"
                                                >
                                                    <circle
                                                        v-for="arc in stackProgressOf(item).arcs"
                                                        :key="arc.key"
                                                        :data-part="arc.key"
                                                        cx="18"
                                                        cy="18"
                                                        :r="RING_RADIUS"
                                                        fill="none"
                                                        stroke-width="5"
                                                        pathLength="100"
                                                        :class="arc.cls"
                                                        :stroke-dasharray="`${arc.length} 100`"
                                                        :stroke-dashoffset="-arc.offset"
                                                    />
                                                </svg>
                                            </span>
                                        </TooltipTrigger>
                                        <!-- One line per state, so several read as a list. -->
                                        <TooltipContent data-slot="stack-group-progress-summary">
                                            <div class="flex flex-col gap-0.5">
                                                <span
                                                    v-for="arc in stackProgressOf(item).arcs"
                                                    :key="arc.key"
                                                >
                                                    {{ arc.count }} {{ arc.label }}
                                                </span>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </button>
                                <!-- The stack's PRs as in the PR view's Stack tab, without
                                     the cards: a numbered circle per PR, centered on its
                                     row and joined to the next by a line. -->
                                <ol
                                    v-if="!foldedStacks.has(item.stackId)"
                                    class="border-t border-moire-border"
                                >
                                    <li
                                        v-for="({ pr, inList }, index) in item.members"
                                        :key="pr.id"
                                        data-slot="stack-group-pr"
                                        :data-filtered-out="!inList || undefined"
                                        class="flex"
                                    >
                                        <div
                                            class="relative flex w-12 shrink-0 items-center justify-center"
                                        >
                                            <span
                                                v-if="index > 0"
                                                class="absolute top-0 bottom-[calc(50%+18px)] left-1/2 w-px -translate-x-1/2 bg-moire-border"
                                            />
                                            <span
                                                v-if="index < item.members.length - 1"
                                                class="absolute top-[calc(50%+18px)] bottom-0 left-1/2 w-px -translate-x-1/2 bg-moire-border"
                                            />
                                            <span
                                                data-slot="stack-group-position"
                                                class="relative flex size-6 items-center justify-center rounded-full border border-moire-border bg-moire-app font-mono text-[11px] text-moire-muted"
                                            >
                                                {{
                                                    dashboard.prStackPositions.get(pr.number)?.index
                                                }}
                                            </span>
                                        </div>
                                        <!-- A PR of the stack this card's filter leaves out is
                                             shown dimmed, so the stack reads whole. -->
                                        <div
                                            class="min-w-0 flex-1"
                                            :class="{
                                                'border-t border-moire-border': index > 0,
                                                'opacity-45 grayscale': !inList,
                                            }"
                                        >
                                            <dashboard-pr-row
                                                :pr="pr"
                                                :now="now"
                                                :show-avatar="showAvatars"
                                                in-stack
                                                @open="dashboard.openPr"
                                                @open-in-browser="openInBrowser"
                                            />
                                        </div>
                                    </li>
                                </ol>
                            </div>
                        </template>
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
                        Every card is hidden. Turn them back on under Dashboard settings.
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
