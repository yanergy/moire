<script setup lang="ts">
import { ArrowRightLeft, GitPullRequest, GitPullRequestDraft, TriangleAlert } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { CompareMode, ViewMode } from '@/shared/types';
import RefSelector from '@/components/controls/RefSelector.vue';
import RepoPicker from '@/components/controls/RepoPicker.vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';
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
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <div
            class="flex h-13 flex-none items-center gap-2 border-b border-moire-border bg-moire-app px-3"
        >
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

            <Tooltip v-if="comparison.hasPullRequest">
                <TooltipTrigger as-child>
                    <!-- The tooltip trigger wraps a span, not the Toggle: the trigger
                         stamps its own data-state, which would otherwise clobber the
                         toggle's data-state=on and drop the pressed styling. -->
                    <span class="inline-flex">
                        <Toggle
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
                            <GitPullRequestDraft
                                v-if="comparison.pullRequest?.isDraft"
                                :size="16"
                            />
                            <GitPullRequest v-else :size="16" />
                            PR #{{ comparison.pullRequest?.number }}
                        </Toggle>
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    {{ ui.mainView === 'pr' ? 'Back to the diff' : 'View the pull request' }}
                </TooltipContent>
            </Tooltip>

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

            <div class="flex-1" />

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
    </TooltipProvider>
</template>
