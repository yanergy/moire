<script setup lang="ts">
import { computed } from 'vue';
import {
    ArrowRightLeft,
    GitPullRequest,
    GitPullRequestDraft,
    LayoutDashboard,
    LoaderCircle,
    TriangleAlert,
} from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { CompareMode, ViewMode } from '@/shared/types';
import RefSelector from '@/components/controls/RefSelector.vue';
import RepoPicker from '@/components/controls/RepoPicker.vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';
import NotificationsButton from '@/components/headers/NotificationsButton.vue';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const comparison = useComparisonStore();
const ui = useUiStore();

const compareOptions: { value: CompareMode; label: string; tooltip: string }[] = [
    {
        value: 'merge-base',
        label: 'merge-base',
        tooltip:
            'Compare head to where it branched from base (the merge base), showing only the changes head introduces. Matches what a GitHub pull request shows.',
    },
    {
        value: 'direct',
        label: 'direct',
        tooltip:
            'Compare the base and head tips directly. Commits added to base after head branched off also appear as changes.',
    },
];

const viewOptions: { value: ViewMode; label: string }[] = [
    { value: 'split', label: 'split' },
    { value: 'unified', label: 'unified' },
];

// The PR toggle sits by the branches and only appears once a PR is detected for
// the range. Its pressed state maps straight to which pane fills the main area.
function setPrView(on: boolean) {
    ui.setMainView(on ? 'pr' : 'diff');
}

// The dashboard toggle and the notifications bell show while a repository is open.
function setDashboardView(on: boolean) {
    if (on) {
        ui.openDashboard();
        return;
    }

    ui.setMainView('diff');
}

// A status dot before the PR button label: vibrant green open, red closed,
// purple merged, gray draft, and yellow when a PR has changes requested. Changes
// requested overrides the draft dot; the dashed toggle border (driven by isDraft
// below) still marks it as a draft. Uses the dedicated --moire-pr-* /
// --moire-changes-* tones so it stays bright.
const statusDotClass = computed(() => {
    const pr = comparison.pullRequest;
    if (!pr) {
        return '';
    }
    if (pr.isDraft && pr.reviewDecision !== 'CHANGES_REQUESTED') {
        return 'bg-moire-pr-draft';
    }
    if (pr.state === 'MERGED') {
        return 'bg-moire-pr-merged';
    }
    if (pr.state === 'CLOSED') {
        return 'bg-moire-pr-closed';
    }
    if (pr.reviewDecision === 'CHANGES_REQUESTED') {
        return 'bg-moire-changes-fg';
    }
    return 'bg-moire-pr-open';
});
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <!-- Three columns: the repository and range on the left, the dashboard
             and notifications buttons in the middle and the diff options on the
             right. The equal
             side columns keep the middle centered on the header; a side that
             does not fit pushes it over rather than overlapping it. -->
        <div
            class="grid h-13 flex-none grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-moire-border bg-moire-app px-3"
        >
            <div class="flex items-center gap-2">
                <repo-picker />

                <div class="mx-1 h-5 w-px bg-moire-border" />

                <div class="flex items-center gap-1.5">
                    <ref-selector side="base" />
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                class="size-7 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                                @click="comparison.swap()"
                            >
                                <ArrowRightLeft :size="16" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Swap base and head</TooltipContent>
                    </Tooltip>
                    <ref-selector side="head" />
                </div>

                <!-- While a lookup for a newly selected range is in flight, a spinner
                 stands in for the PR button so the previous branch's
                 open/merged/closed status isn't misread as the new one's before gh
                 returns (it can take a moment). -->
                <Tooltip v-if="comparison.prLoading">
                    <TooltipTrigger as-child>
                        <span
                            class="inline-flex size-7 items-center justify-center text-moire-muted"
                        >
                            <LoaderCircle :size="16" class="animate-spin" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Checking for a pull request…</TooltipContent>
                </Tooltip>

                <Toggle
                    v-else-if="comparison.hasPullRequest"
                    variant="outline"
                    size="sm"
                    :model-value="ui.mainView === 'pr'"
                    :class="[
                        'h-7 gap-1.5 px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg',
                        // A draft PR reads as provisional: a dashed border, as
                        // GitHub renders draft state.
                        { 'border-dashed': comparison.pullRequest?.isDraft },
                    ]"
                    @update:model-value="setPrView"
                >
                    <span class="size-2.5 shrink-0 rounded-full" :class="statusDotClass" />
                    <GitPullRequestDraft v-if="comparison.pullRequest?.isDraft" :size="16" />
                    <GitPullRequest v-else :size="16" />
                    PR #{{ comparison.pullRequest?.number }}
                </Toggle>

                <!-- Shown in the PR button's place when the gh lookup failed (gh
                 missing, signed out, or an access error), so a missing PR panel is
                 explained rather than silently absent. The reason, and how to fix
                 it, live in the tooltip. -->
                <Tooltip v-else-if="comparison.prWarning">
                    <TooltipTrigger as-child>
                        <span
                            class="inline-flex size-7 cursor-pointer items-center justify-center text-moire-warn"
                        >
                            <TriangleAlert :size="18" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent class="flex max-w-xs flex-col gap-2">
                        <span v-for="(line, i) in comparison.prWarning" :key="i">{{ line }}</span>
                    </TooltipContent>
                </Tooltip>
            </div>

            <!-- The two repository wide pages, side by side. -->
            <div class="flex justify-center gap-2">
                <Toggle
                    v-if="comparison.repoPath"
                    variant="outline"
                    size="sm"
                    :model-value="ui.mainView === 'dashboard'"
                    class="h-8 gap-2 px-3.5 text-[13px] font-medium text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                    @update:model-value="setDashboardView"
                >
                    <LayoutDashboard :size="18" />
                    Dashboard
                </Toggle>
                <notifications-button v-if="comparison.repoPath" />
            </div>

            <div class="flex items-center justify-end gap-2">
                <segmented-toggle
                    :options="compareOptions"
                    :model-value="comparison.compareMode"
                    @update:model-value="comparison.setCompareMode"
                />

                <segmented-toggle
                    :options="viewOptions"
                    :model-value="ui.viewMode"
                    @update:model-value="ui.setViewMode"
                />
            </div>
        </div>
    </TooltipProvider>
</template>
