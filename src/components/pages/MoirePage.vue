<script setup lang="ts">
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';
</script>

<template>
    <div
        class="flex h-screen min-h-[640px] flex-col overflow-hidden bg-moire-app text-[13px] text-moire-fg"
    >
        <toolbar-header />
        <missing-branch-notice />
        <div class="flex min-h-0 flex-1">
            <file-tree-sidebar />
            <diff-pane />
        </div>
    </div>
</template>
