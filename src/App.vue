<script setup lang="ts">
import { onMounted, onUnmounted, watchEffect } from 'vue';
import { setupMonacoEnv } from '@/lib/monaco-env';
import { defineMonacoThemes } from '@/lib/monaco-theme';
import { windowTitle } from '@/lib/window-title';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import MoirePage from '@/components/pages/MoirePage.vue';

setupMonacoEnv();
defineMonacoThemes();

const comparison = useComparisonStore();
const ui = useUiStore();

let stopThemeMenu: (() => void) | undefined;

// Electron mirrors document.title into the native window title bar, so the open
// repo shows there. This replaces the in-app title the removed fake title bar
// used to render.
watchEffect(() => {
    document.title = windowTitle(comparison.repoName);
});

onMounted(() => {
    // Reopen the most recently opened repo on launch.
    comparison.restoreLastRepo();
    // The theme toggle lives in the native View menu; its command arrives here
    // through the preload bridge. Guard for jsdom/tests where window.api is absent.
    stopThemeMenu = window.api?.onToggleTheme(() => ui.toggleTheme());
});

onUnmounted(() => stopThemeMenu?.());
</script>

<template>
    <moire-page />
</template>
