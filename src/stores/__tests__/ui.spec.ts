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

    it('defaults the main view to the diff and switches it to the PR view', () => {
        const store = useUiStore();
        expect(store.mainView).toBe('diff');
        store.setMainView('pr');
        expect(store.mainView).toBe('pr');
        store.setMainView('diff');
        expect(store.mainView).toBe('diff');
    });

    it('defaults the code style to github and applies a pushed value', () => {
        const store = useUiStore();
        expect(store.codeStyle).toBe('github');

        store.setCodeStyle('vscode');
        expect(store.codeStyle).toBe('vscode');
    });

    describe('back/forward history', () => {
        it('steps back and forward through view changes, as in a browser', () => {
            const store = useUiStore();
            store.openDashboard();
            store.setDashboardCard('changes');
            store.setMainView('pr');

            store.goBack();
            expect([store.mainView, store.dashboardCard]).toEqual(['dashboard', 'changes']);
            store.goBack();
            expect([store.mainView, store.dashboardCard]).toEqual(['dashboard', null]);
            store.goBack();
            expect(store.mainView).toBe('diff');
            store.goBack();
            expect(store.mainView).toBe('diff');

            store.goForward();
            store.goForward();
            expect([store.mainView, store.dashboardCard]).toEqual(['dashboard', 'changes']);
        });

        it('drops the forward pages once a new page is visited', () => {
            const store = useUiStore();
            store.setMainView('pr');
            store.goBack();
            store.openDashboard();

            store.goForward();
            expect(store.mainView).toBe('dashboard');
        });

        it('opens the dashboard on its overview, not the last card left open', () => {
            const store = useUiStore();
            store.openDashboard();
            store.setDashboardCard('changes');
            store.setMainView('diff');

            store.openDashboard();
            expect(store.dashboardCard).toBeNull();
        });

        it('records nothing when the page does not change', () => {
            const store = useUiStore();
            store.setMainView('diff');

            store.setMainView('pr');
            store.goBack();
            store.goBack();
            expect(store.mainView).toBe('diff');
        });

        it('forgets the history and the open card on reset', () => {
            const store = useUiStore();
            store.openDashboard();
            store.setDashboardCard('changes');

            store.resetNavigation();
            expect(store.dashboardCard).toBeNull();
            store.goBack();
            expect(store.mainView).toBe('dashboard');
        });
    });
});
