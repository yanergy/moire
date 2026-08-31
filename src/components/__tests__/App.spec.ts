import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { ThemeState } from '@/shared/types';

// monaco-env pulls Vite `?worker` modules that can't resolve under vitest (the
// monaco-editor alias mangles their paths), so stub the worker wiring. The theme
// helpers reach Monaco through the aliased stub and need no mocking.
vi.mock('@/lib/monaco-env', () => ({ setupMonacoEnv: vi.fn<() => void>() }));

import App from '@/App.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';

type Unsub = () => void;

// A bridge stub whose subscription methods hand back distinct unsubscribers, so
// the onUnmounted cleanup can be verified per channel.
function stubApi() {
    const unsub = {
        theme: vi.fn<Unsub>(),
        refresh: vi.fn<Unsub>(),
        openRepo: vi.fn<Unsub>(),
        openRecent: vi.fn<Unsub>(),
        repoChanged: vi.fn<Unsub>(),
        flourishes: vi.fn<Unsub>(),
    };
    const api = {
        getTheme: vi.fn<() => Promise<ThemeState>>().mockResolvedValue({
            preference: 'system',
            isDark: true,
        }),
        onThemeChanged: vi.fn<(cb: (state: ThemeState) => void) => Unsub>(() => unsub.theme),
        onMenuRefresh: vi.fn<(cb: () => void) => Unsub>(() => unsub.refresh),
        onMenuOpenRepo: vi.fn<(cb: () => void) => Unsub>(() => unsub.openRepo),
        onMenuOpenRecent: vi.fn<(cb: (path: string) => void) => Unsub>(() => unsub.openRecent),
        onRepoChanged: vi.fn<(cb: () => void) => Unsub>(() => unsub.repoChanged),
        getFlourishes: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
        onFlourishesChanged: vi.fn<(cb: (enabled: boolean) => void) => Unsub>(
            () => unsub.flourishes
        ),
    };
    window.api = api as unknown as Window['api'];
    return { api, unsub };
}

describe('App', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        delete window.api;
        vi.restoreAllMocks();
    });

    function mountApp() {
        return mount(App, { global: { plugins: [pinia], stubs: { MoirePage: true } } });
    }

    it('restores the last repo and pulls the theme on mount', async () => {
        const { api } = stubApi();
        const comparison = useComparisonStore();
        const ui = useUiStore();
        const restore = vi.spyOn(comparison, 'restoreLastRepo').mockResolvedValue(undefined);
        const applyTheme = vi.spyOn(ui, 'applyThemeState');

        mountApp();
        await flushPromises();

        expect(restore).toHaveBeenCalledTimes(1);
        expect(api.getTheme).toHaveBeenCalledTimes(1);
        expect(applyTheme).toHaveBeenCalledWith({ preference: 'system', isDark: true });
    });

    it('keeps document.title in sync with the open repo name', async () => {
        stubApi();
        const comparison = useComparisonStore();
        vi.spyOn(comparison, 'restoreLastRepo').mockResolvedValue(undefined);

        mountApp();
        await flushPromises();
        expect(document.title).toBe('Moiré');

        comparison.repoName = 'moire-demo';
        await nextTick();
        expect(document.title).toBe('Moiré — moire-demo');
    });

    it('wires the native menu and repo-change events to store actions', async () => {
        const { api } = stubApi();
        const comparison = useComparisonStore();
        vi.spyOn(comparison, 'restoreLastRepo').mockResolvedValue(undefined);
        const refresh = vi.spyOn(comparison, 'refresh').mockResolvedValue(undefined);
        const openRepository = vi.spyOn(comparison, 'openRepository').mockResolvedValue(undefined);
        const openRecent = vi.spyOn(comparison, 'openRecent').mockResolvedValue(true);

        mountApp();
        await flushPromises();

        api.onMenuRefresh.mock.calls[0]![0]();
        api.onMenuOpenRepo.mock.calls[0]![0]();
        api.onMenuOpenRecent.mock.calls[0]![0]('/repos/demo');
        api.onRepoChanged.mock.calls[0]![0]();

        expect(refresh).toHaveBeenCalledTimes(2); // menu refresh + repo change
        expect(openRepository).toHaveBeenCalledTimes(1);
        expect(openRecent).toHaveBeenCalledWith('/repos/demo');
    });

    it('unsubscribes every bridge listener on unmount', async () => {
        const { unsub } = stubApi();
        const comparison = useComparisonStore();
        vi.spyOn(comparison, 'restoreLastRepo').mockResolvedValue(undefined);

        const wrapper = mountApp();
        await flushPromises();
        wrapper.unmount();

        expect(unsub.theme).toHaveBeenCalledTimes(1);
        expect(unsub.refresh).toHaveBeenCalledTimes(1);
        expect(unsub.openRepo).toHaveBeenCalledTimes(1);
        expect(unsub.openRecent).toHaveBeenCalledTimes(1);
        expect(unsub.repoChanged).toHaveBeenCalledTimes(1);
        expect(unsub.flourishes).toHaveBeenCalledTimes(1);
    });

    it('does not touch the bridge when window.api is absent', async () => {
        const comparison = useComparisonStore();
        const restore = vi.spyOn(comparison, 'restoreLastRepo').mockResolvedValue(undefined);

        expect(() => mountApp()).not.toThrow();
        await flushPromises();
        expect(restore).toHaveBeenCalledTimes(1);
        expect(document.title).toBe('Moiré');
    });
});
