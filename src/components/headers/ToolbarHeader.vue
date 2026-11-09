<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRightLeft, FileDiff, LayoutDashboard, Settings } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { CompareMode, ViewMode } from '@/shared/types';
import RefSelector from '@/components/controls/RefSelector.vue';
import RepoPicker from '@/components/controls/RepoPicker.vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';
import NotificationsButton from '@/components/headers/NotificationsButton.vue';
import PrTab from '@/components/headers/PrTab.vue';
import ReviewButton from '@/components/headers/ReviewButton.vue';
import ToolbarNavButton from '@/components/headers/ToolbarNavButton.vue';
import { Button } from '@/components/ui/button';
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

// The page the main area shows, whose toolbar button is the selected one. It
// follows MoirePage: the PR page needs a detected PR and the dashboard and
// notifications pages an open repository, and the diff stands in otherwise, so
// exactly one button is selected.
const currentPage = computed(() => {
    const view = ui.mainView;
    if (view === 'pr' && !comparison.hasPullRequest) {
        return 'diff';
    }
    if ((view === 'dashboard' || view === 'notifications') && !comparison.repoPath) {
        return 'diff';
    }
    return view;
});

// The page tabs all navigate through the ui store, so back and forward keep
// working. The Diff and Settings tabs show always (without a repository the diff
// area offers to open one, and Settings says it needs one); the PR, Dashboard and
// Notifications tabs while a repository is open (the PR tab disabled until a PR
// is detected).
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <!-- Three columns: the repository and range on the left, the page
             buttons in the middle and the diff options on the right. The equal
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

                <!-- Once a review is pending, finishing it is a click away from the diff. -->
                <review-button v-if="!comparison.prLoading" finish-only />
            </div>

            <!-- The page navigation, side by side: the compared range's two views
                 (its diff and its pull request), then the repository wide pages. -->
            <nav aria-label="Pages" class="flex items-stretch justify-center gap-4 self-stretch">
                <toolbar-nav-button
                    :selected="currentPage === 'diff'"
                    @navigate="ui.setMainView('diff')"
                >
                    <FileDiff :size="18" />
                    Diff
                </toolbar-nav-button>
                <pr-tab v-if="comparison.repoPath" :selected="currentPage === 'pr'" />
                <toolbar-nav-button
                    v-if="comparison.repoPath"
                    :selected="currentPage === 'dashboard'"
                    @navigate="ui.openDashboard()"
                >
                    <LayoutDashboard :size="18" />
                    Dashboard
                </toolbar-nav-button>
                <notifications-button
                    v-if="comparison.repoPath"
                    :selected="currentPage === 'notifications'"
                />
                <toolbar-nav-button
                    :selected="currentPage === 'settings'"
                    @navigate="ui.openSettings()"
                >
                    <Settings :size="18" />
                    Settings
                </toolbar-nav-button>
            </nav>

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
