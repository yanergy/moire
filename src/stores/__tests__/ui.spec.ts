import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { useUiStore } from '@/stores/ui';

describe('ui store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        document.documentElement.classList.remove('dark');
    });

    it('defaults to the system preference, resolving dark on the root element', () => {
        const store = useUiStore();
        expect(store.preference).toBe('system');
        expect(store.isDark).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('applies pushed theme state, updating the preference and the root class', async () => {
        const store = useUiStore();

        store.applyThemeState({ preference: 'light', isDark: false });
        expect(store.preference).toBe('light');
        expect(store.isDark).toBe(false);
        await nextTick();
        expect(document.documentElement.classList.contains('dark')).toBe(false);

        store.applyThemeState({ preference: 'dark', isDark: true });
        expect(store.preference).toBe('dark');
        await nextTick();
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        // 'system' keeps the preference distinct from the resolved dark/light.
        store.applyThemeState({ preference: 'system', isDark: false });
        expect(store.preference).toBe('system');
        expect(store.isDark).toBe(false);
        await nextTick();
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('sets the view mode', () => {
        const store = useUiStore();
        expect(store.viewMode).toBe('split');
        store.setViewMode('unified');
        expect(store.viewMode).toBe('unified');
    });

    it('defaults the code style to github and applies a pushed value', () => {
        const store = useUiStore();
        expect(store.codeStyle).toBe('github');

        store.setCodeStyle('vscode');
        expect(store.codeStyle).toBe('vscode');
    });
});
