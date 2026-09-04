import { ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { CodeStyle, MainView, ThemePreference, ThemeState, ViewMode } from '@/shared/types';

// View-level preferences. The theme and diff-color palette are owned by the
// Electron main process: `preference` is what the user picked in the View → Theme
// menu ('system' follows the OS), `isDark` is the resolved value main pushes over
// IPC, and `codeStyle` is the View → Code Style selection. This store only mirrors
// and applies those; it never decides them itself. The split/unified diff layout
// is local renderer state.
export const useUiStore = defineStore('ui', () => {
    const preference = ref<ThemePreference>('system');
    const isDark = ref(true);
    const codeStyle = ref<CodeStyle>('github');
    const viewMode = ref<ViewMode>('split');
    // Which pane the main area shows: the diff (default) or the pull-request view.
    // Local renderer state, like viewMode; the PR view is only reachable when a PR
    // is detected for the selected branches (see the comparison store).
    const mainView = ref<MainView>('diff');

    function applyThemeState(state: ThemeState) {
        preference.value = state.preference;
        isDark.value = state.isDark;
    }

    function setCodeStyle(style: CodeStyle) {
        codeStyle.value = style;
    }

    function setViewMode(mode: ViewMode) {
        viewMode.value = mode;
    }

    function setMainView(view: MainView) {
        mainView.value = view;
    }

    // The `.dark` class on <html> drives both the Tailwind dark variant and the
    // --moire-* token overrides.
    watch(
        isDark,
        (dark) => {
            document.documentElement.classList.toggle('dark', dark);
        },
        { immediate: true }
    );

    return {
        preference,
        isDark,
        codeStyle,
        viewMode,
        mainView,
        applyThemeState,
        setCodeStyle,
        setViewMode,
        setMainView,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
