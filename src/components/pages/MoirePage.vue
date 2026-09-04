<script setup lang="ts">
import { computed, watch } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';
import PrView from '@/components/pr/PrView.vue';

const comparison = useComparisonStore();
const ui = useUiStore();

// The PR view is only reachable while a PR is detected for the range; any other
// time the diff fills the pane.
const showPrView = computed(() => ui.mainView === 'pr' && comparison.hasPullRequest);

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
        <toolbar-header />
        <missing-branch-notice />
        <div class="flex min-h-0 flex-1">
            <file-tree-sidebar />
            <pr-view v-if="showPrView" />
            <diff-pane v-else />
        </div>
    </div>
</template>
