<script setup lang="ts">
import { setupMonacoEnv } from '@/lib/monaco-env';
import { defineMonacoThemes } from '@/lib/monaco-theme';
import WindowChrome from '@/components/WindowChrome.vue';
import AppToolbar from '@/components/AppToolbar.vue';
import FileTreeSidebar from '@/components/FileTreeSidebar.vue';
import DiffPane from '@/components/DiffPane.vue';

setupMonacoEnv();
defineMonacoThemes();
</script>

<template>
    <div
        class="flex h-screen min-h-[640px] flex-col overflow-hidden bg-dv-app text-[13px] text-dv-fg"
    >
        <window-chrome />
        <app-toolbar />
        <div class="flex min-h-0 flex-1">
            <file-tree-sidebar />
            <diff-pane />
        </div>
    </div>
</template>
