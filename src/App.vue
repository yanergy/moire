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

let stopThemeSync: (() => void) | undefined;
let stopMenuRefresh: (() => void) | undefined;
let stopMenuOpenRepo: (() => void) | undefined;
let stopMenuOpenRecent: (() => void) | undefined;
let stopRepoChanged: (() => void) | undefined;

// Electron mirrors document.title into the native window title bar, so the open
// repo shows there. This replaces the in-app title the removed fake title bar
// used to render.
watchEffect(() => {
    document.title = windowTitle(comparison.repoName);
});

onMounted(async () => {
    // Reopen the most recently opened repo on launch.
    comparison.restoreLastRepo();
    // Theme is owned by the main process (nativeTheme). Pull the current resolved
    // state, then stay in sync as the View → Theme selection or the OS theme
    // changes. Guard for jsdom/tests where window.api is absent.
    const api = window.api;
    if (!api) {
        return;
    }

    ui.applyThemeState(await api.getTheme());
    stopThemeSync = api.onThemeChanged((state) => ui.applyThemeState(state));

    // The native View → Refresh item re-reads the repo through the store.
    stopMenuRefresh = api.onMenuRefresh(() => void comparison.refresh());

    // The native File menu opens repos through the same store flow the toolbar
    // repo-picker uses: a folder dialog, or a chosen recent path.
    stopMenuOpenRepo = api.onMenuOpenRepo(() => void comparison.openRepository());
    stopMenuOpenRecent = api.onMenuOpenRecent((path) => void comparison.openRecent(path));

    // The RepoWatcher pushes a coalesced event when the open repo's refs or
    // working tree change on disk, so the diff refreshes without a manual poke.
    stopRepoChanged = api.onRepoChanged(() => void comparison.refresh());
});

onUnmounted(() => {
    stopThemeSync?.();
    stopMenuRefresh?.();
    stopMenuOpenRepo?.();
    stopMenuOpenRecent?.();
    stopRepoChanged?.();
});
</script>

<template>
    <moire-page />
</template>
