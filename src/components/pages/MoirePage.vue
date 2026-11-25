<script setup lang="ts">
import { computed, watch } from 'vue';
import { LoaderCircle } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import ReviewLinesNotice from '@/components/headers/ReviewLinesNotice.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';
import StackedDiffPane from '@/components/diff/StackedDiffPane.vue';
import PrView from '@/components/pr/PrView.vue';
import DashboardView from '@/components/dashboard/DashboardView.vue';
import NotificationsView from '@/components/notifications/NotificationsView.vue';
import SettingsView from '@/components/settings/SettingsView.vue';
import { TooltipProvider } from '@/components/ui/tooltip';

const comparison = useComparisonStore();
const ui = useUiStore();

// While a new range's PR is being looked up (opening a PR from the dashboard, or
// switching branches on the PR view), the PR page shows a spinner instead of the
// previous PR, so it is clear the new one is on its way.
const showPrLoading = computed(() => ui.mainView === 'pr' && comparison.prLoading);

// The PR view is only reachable while a PR is detected for the range; any other
// time the diff fills the pane.
const showPrView = computed(() => ui.mainView === 'pr' && comparison.hasPullRequest);

// The dashboard and the notifications are always about the open repository, so
// they need one.
const showDashboard = computed(() => ui.mainView === 'dashboard' && !!comparison.repoPath);
const showNotifications = computed(() => ui.mainView === 'notifications' && !!comparison.repoPath);

// Another repository opened: the back/forward history and the open dashboard
// card belonged to the old one.
watch(
    () => comparison.repoPath,
    () => ui.resetNavigation()
);

// If the PR disappears while it is being viewed (a range change to a branch with
// no PR), or a lookup started from the PR page finds none, fall back to the diff
// so the toggle and the pane stay in step.
watch(
    () => comparison.hasPullRequest || comparison.prLoading,
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
            <!-- The dashboard, the notifications and the settings are repository
                 wide, and the PR view is a page of its own, so they take the full
                 width; the file tree only belongs to the diff. (A thread's file link
                 in the PR view selects the file through the store, so it needs no
                 tree mounted.) -->
            <div
                v-if="showPrLoading"
                data-slot="pr-loading"
                class="flex min-h-0 flex-1 items-center justify-center gap-2 text-moire-muted"
            >
                <LoaderCircle :size="16" class="animate-spin" aria-hidden="true" />
                Loading pull request…
            </div>
            <pr-view v-else-if="showPrView" />
            <dashboard-view v-else-if="showDashboard" />
            <notifications-view v-else-if="showNotifications" />
            <!-- Opens without a repository too, to say it needs one. -->
            <settings-view v-else-if="ui.mainView === 'settings'" />
            <div v-else class="flex min-h-0 flex-1">
                <file-tree-sidebar />
                <!-- The diff area follows the View → Diff Layout setting: the single-file
                     pane, or the GitHub-style stacked all-files list. -->
                <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                    <review-lines-notice />
                    <diff-pane v-if="ui.diffLayout === 'single'" />
                    <stacked-diff-pane v-else />
                </div>
            </div>
        </TooltipProvider>
    </div>
</template>
