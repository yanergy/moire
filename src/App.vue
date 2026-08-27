<script setup lang="ts">
import { onMounted, watchEffect } from 'vue';
import { setupMonacoEnv } from '@/lib/monaco-env';
import { defineMonacoThemes } from '@/lib/monaco-theme';
import { windowTitle } from '@/lib/window-title';
import { useComparisonStore } from '@/stores/comparison';
import DiffViewerPage from '@/components/pages/DiffViewerPage.vue';

setupMonacoEnv();
defineMonacoThemes();

const comparison = useComparisonStore();

// Electron mirrors document.title into the native window title bar, so the open
// repo shows there. This replaces the in-app title the removed fake title bar
// used to render.
watchEffect(() => {
    document.title = windowTitle(comparison.repoName);
});

// Reopen the most recently opened repo on launch.
onMounted(() => comparison.restoreLastRepo());
</script>

<template>
    <diff-viewer-page />
</template>
