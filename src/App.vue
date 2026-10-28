<script setup lang="ts">
import { onMounted, onUnmounted, watchEffect } from 'vue';
import { setupMonacoEnv } from '@/lib/monaco-env';
import { defineMonacoThemes } from '@/lib/monaco-themes';
import { windowTitle } from '@/lib/window-title';
import { setFlourishesEnabled } from '@/lib/celebrate';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { useDashboardStore } from '@/stores/dashboard';
import MoirePage from '@/components/pages/MoirePage.vue';

setupMonacoEnv();
defineMonacoThemes();

const comparison = useComparisonStore();
const ui = useUiStore();
const dashboard = useDashboardStore();

let stopThemeSync: (() => void) | undefined;
let stopMenuRefresh: (() => void) | undefined;
let stopMenuOpenRepo: (() => void) | undefined;
let stopMenuOpenRecent: (() => void) | undefined;
let stopRepoChanged: (() => void) | undefined;
let stopFlourishes: (() => void) | undefined;
let stopCodeStyle: (() => void) | undefined;
let stopDiffLayout: (() => void) | undefined;
let stopDashboard: (() => void) | undefined;
let stopShowDashboard: (() => void) | undefined;
let stopOpenPr: (() => void) | undefined;

// Electron mirrors document.title into the native window title bar, so the open
// repo shows there. This replaces the in-app title the removed fake title bar
// used to render.
watchEffect(() => {
    document.title = windowTitle(comparison.repoName);
});

// The mouse back and forward buttons (buttons 4 and 5, reported as 3 and 4) step
// through the page history, as in a browser. Captured on the window, so a pane
// that stops the event (the Monaco editor) cannot swallow it.
function onMouseUp(event: MouseEvent) {
    if (event.button === 3) {
        event.preventDefault();
        ui.goBack();
        return;
    }
    if (event.button === 4) {
        event.preventDefault();
        ui.goForward();
    }
}

onMounted(async () => {
    window.addEventListener('mouseup', onMouseUp, true);
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

    // The diff-color palette, owned by main and set from the View → Code Style
    // menu. Pull the stored value, then stay in sync as the selection changes.
    ui.setCodeStyle(await api.getCodeStyle());
    stopCodeStyle = api.onCodeStyleChanged((style) => ui.setCodeStyle(style));

    // The diff layout (single-file vs the stacked all-files list), owned by main
    // and set from the View → Diff Layout menu. Pull the stored value, then stay in
    // sync as the selection changes.
    ui.setDiffLayout(await api.getDiffLayout());
    stopDiffLayout = api.onDiffLayoutChanged((layout) => ui.setDiffLayout(layout));

    // The review-complete flourishes, gated by the View menu toggle (persisted).
    setFlourishesEnabled(await api.getFlourishes());
    stopFlourishes = api.onFlourishesChanged((enabled) => setFlourishesEnabled(enabled));

    // The native View → Refresh item re-reads the repo through the store.
    stopMenuRefresh = api.onMenuRefresh(() => void comparison.refresh());

    // The native File menu opens repos through the same store flow the toolbar
    // repo-picker uses: a folder dialog, or a chosen recent path.
    stopMenuOpenRepo = api.onMenuOpenRepo(() => void comparison.openRepository());
    stopMenuOpenRecent = api.onMenuOpenRecent((path) => void comparison.openRecent(path));

    // The RepoWatcher pushes a coalesced event when the open repo's refs or
    // working tree change on disk, so the diff refreshes without a manual poke.
    stopRepoChanged = api.onRepoChanged(() => void comparison.refresh());

    // The GitHub notifier in main pushes the dashboard state after every poll.
    stopDashboard = api.onDashboardChanged((state) => dashboard.applyState(state));
    stopShowDashboard = api.onShowDashboard(() => ui.openDashboard());
    stopOpenPr = api.onOpenPr((pr) => dashboard.openPr(pr));
});

onUnmounted(() => {
    window.removeEventListener('mouseup', onMouseUp, true);
    stopThemeSync?.();
    stopMenuRefresh?.();
    stopMenuOpenRepo?.();
    stopMenuOpenRecent?.();
    stopRepoChanged?.();
    stopFlourishes?.();
    stopCodeStyle?.();
    stopDiffLayout?.();
    stopDashboard?.();
    stopShowDashboard?.();
    stopOpenPr?.();
});
</script>

<template>
    <moire-page />
</template>
