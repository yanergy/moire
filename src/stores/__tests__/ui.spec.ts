import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
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

    it('sets and persists the view mode', async () => {
        const setViewModePreference = vi.fn<(mode: string) => Promise<void>>().mockResolvedValue();
        window.api = { setViewModePreference } as unknown as Window['api'];
        const store = useUiStore();
        expect(store.viewMode).toBe('split');

        expect(await store.setViewMode('unified')).toBe(true);
        expect(store.viewMode).toBe('unified');
        expect(setViewModePreference).toHaveBeenCalledWith('unified');
        delete window.api;
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

    it('opens the Settings page at a section, as a page in the history', () => {
        const store = useUiStore();
        store.openDashboard();
        store.openSettings('dashboard');

        expect([store.mainView, store.settingsSection]).toEqual(['settings', 'dashboard']);
        store.goBack();
        expect(store.mainView).toBe('dashboard');

        store.openSettings();
        expect(store.settingsSection).toBeNull();
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

    describe('rendered Markdown', () => {
        it('toggles a file between source and rendered', () => {
            const ui = useUiStore();
            expect(ui.isMarkdownRendered('README.md')).toBe(false);

            ui.toggleMarkdownRendered('README.md');
            expect(ui.isMarkdownRendered('README.md')).toBe(true);
            expect(ui.isMarkdownRendered('docs/a.md')).toBe(false);

            ui.toggleMarkdownRendered('README.md');
            expect(ui.isMarkdownRendered('README.md')).toBe(false);
        });

        it('forgets the choices when another repository opens', () => {
            const ui = useUiStore();
            ui.toggleMarkdownRendered('README.md');
            ui.resetNavigation();
            expect(ui.isMarkdownRendered('README.md')).toBe(false);
        });
    });
});
