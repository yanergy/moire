import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { useUiStore } from '@/stores/ui';

describe('ui store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        document.documentElement.classList.remove('dark');
    });

    it('defaults to dark and reflects it on the root element', () => {
        const store = useUiStore();
        expect(store.theme).toBe('dark');
        expect(store.isDark).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('toggles between dark and light, updating the root class', async () => {
        const store = useUiStore();

        store.toggleTheme();
        expect(store.theme).toBe('light');
        expect(store.isDark).toBe(false);
        await nextTick();
        expect(document.documentElement.classList.contains('dark')).toBe(false);

        store.toggleTheme();
        await nextTick();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('sets the view mode', () => {
        const store = useUiStore();
        expect(store.viewMode).toBe('split');
        store.setViewMode('unified');
        expect(store.viewMode).toBe('unified');
    });
});
