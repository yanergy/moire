<script setup lang="ts">
import TitleBarHeader from '@/components/headers/TitleBarHeader.vue';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';
</script>

<template>
    <div
        class="flex h-screen min-h-[640px] flex-col overflow-hidden bg-dv-app text-[13px] text-dv-fg"
    >
        <title-bar-header />
        <toolbar-header />
        <div class="flex min-h-0 flex-1">
            <file-tree-sidebar />
            <diff-pane />
        </div>
    </div>
</template>
