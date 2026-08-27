<script setup lang="ts">
import { setupMonacoEnv } from '@/lib/monaco-env';
import { defineMonacoThemes } from '@/lib/monaco-theme';
import DiffViewerPage from '@/components/pages/DiffViewerPage.vue';

setupMonacoEnv();
defineMonacoThemes();
</script>

<template>
    <diff-viewer-page />
</template>
