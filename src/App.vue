<script setup lang="ts">
import { onMounted } from 'vue';
import { setupMonacoEnv } from '@/lib/monaco-env';
import { defineMonacoThemes } from '@/lib/monaco-theme';
import { useComparisonStore } from '@/stores/comparison';
import DiffViewerPage from '@/components/pages/DiffViewerPage.vue';

setupMonacoEnv();
defineMonacoThemes();

const comparison = useComparisonStore();

// Reopen the most recently opened repo on launch.
onMounted(() => comparison.restoreLastRepo());
</script>

<template>
    <diff-viewer-page />
</template>
