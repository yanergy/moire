import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { ThemeName, ViewMode } from '@/shared/types';

// View-level preferences: theme (dark default, matching the design) and the
// split/unified diff layout. Persistence via electron-store lands with the
// backend; for now these are in-memory.
export const useUiStore = defineStore('ui', () => {
    const theme = ref<ThemeName>('dark');
    const viewMode = ref<ViewMode>('split');

    const isDark = computed(() => theme.value === 'dark');

    function toggleTheme() {
        theme.value = isDark.value ? 'light' : 'dark';
    }

    function setViewMode(mode: ViewMode) {
        viewMode.value = mode;
    }

    // The `.dark` class on <html> drives both the Tailwind dark variant and the
    // --dv-* token overrides.
    watch(
        isDark,
        (dark) => {
            document.documentElement.classList.toggle('dark', dark);
        },
        { immediate: true }
    );

    return { theme, viewMode, isDark, toggleTheme, setViewMode };
});
