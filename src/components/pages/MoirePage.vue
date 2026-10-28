<script setup lang="ts">
import { computed, watch } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';
import StackedDiffPane from '@/components/diff/StackedDiffPane.vue';
import PrView from '@/components/pr/PrView.vue';
import DashboardView from '@/components/dashboard/DashboardView.vue';
import { TooltipProvider } from '@/components/ui/tooltip';

const comparison = useComparisonStore();
const ui = useUiStore();

// The PR view is only reachable while a PR is detected for the range; any other
// time the diff fills the pane.
const showPrView = computed(() => ui.mainView === 'pr' && comparison.hasPullRequest);

// The dashboard is always about the open repository, so it needs one.
const showDashboard = computed(() => ui.mainView === 'dashboard' && !!comparison.repoPath);

// Another repository opened: the back/forward history and the open dashboard
// card belonged to the old one.
watch(
    () => comparison.repoPath,
    () => ui.resetNavigation()
);

// If the PR disappears while it is being viewed (a range change to a branch with
// no PR), fall back to the diff so the toggle and the pane stay in step.
watch(
    () => comparison.hasPullRequest,
    (has) => {
        if (!has && ui.mainView === 'pr') {
            ui.setMainView('diff');
        }
    }
);
</script>

<template>
    <div
        class="flex h-screen min-h-[640px] flex-col overflow-hidden bg-moire-app text-[13px] text-moire-fg"
    >
        <!-- One provider for the views' icon button tooltips. Keyboard focus only:
             a menu that closes hands focus back to its trigger, which would
             otherwise pop that trigger's tooltip open. -->
        <TooltipProvider :delay-duration="300" ignore-non-keyboard-focus>
            <toolbar-header />
            <missing-branch-notice />
            <!-- The dashboard is a repository-wide overview, so it takes the full
                 width; the file tree only belongs to the diff and PR views. -->
            <dashboard-view v-if="showDashboard" />
            <div v-else class="flex min-h-0 flex-1">
                <file-tree-sidebar />
                <pr-view v-if="showPrView" />
                <!-- The diff area follows the View → Diff Layout setting: the single-file
                     pane, or the GitHub-style stacked all-files list. -->
                <diff-pane v-else-if="ui.diffLayout === 'single'" />
                <stacked-diff-pane v-else />
            </div>
        </TooltipProvider>
    </div>
</template>
