import { ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { ThemePreference, ThemeState, ViewMode } from '@/shared/types';

// View-level preferences. The theme is owned by the Electron main process
// (nativeTheme): `preference` is what the user picked in the View → Theme menu
// ('system' follows the OS) and `isDark` is the resolved value main pushes over
// IPC. This store only mirrors and applies that; it never decides the theme
// itself. The split/unified diff layout is local renderer state.
export const useUiStore = defineStore('ui', () => {
    const preference = ref<ThemePreference>('system');
    const isDark = ref(true);
    const viewMode = ref<ViewMode>('split');

    function applyThemeState(state: ThemeState) {
        preference.value = state.preference;
        isDark.value = state.isDark;
    }

    function setViewMode(mode: ViewMode) {
        viewMode.value = mode;
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

    return { preference, isDark, viewMode, applyThemeState, setViewMode };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
