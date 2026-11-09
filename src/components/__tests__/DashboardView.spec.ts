import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DashboardView from '@/components/dashboard/DashboardView.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import DashboardCard from '@/components/dashboard/DashboardCard.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { useDashboardStore } from '@/stores/dashboard';
import type { DashboardState } from '@/shared/types';
import { dashboardPr, dashboardSnapshot, dashboardState, stubTooltips } from './fixtures';

stubTooltips();

function stubApi(state: DashboardState) {
    const api = {
        getDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        refreshDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        setDashboardShowDrafts: vi
            .fn<(show: boolean) => Promise<DashboardState>>()
            .mockResolvedValue({ ...state, showDrafts: false }),
        setDashboardAuthors: vi
            .fn<(authors: unknown) => Promise<DashboardState>>()
            .mockResolvedValue(state),
        openExternal: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    };
    window.api = api as unknown as Window['api'];
    return api;
}

describe('DashboardView', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        vi.setSystemTime(new Date('2026-10-26T12:05:00Z'));
    });

    afterEach(() => {
        delete window.api;
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    async function mountView(state: DashboardState) {
        const api = stubApi(state);
        // Attached so the Users menu, which teleports to the body, can open.
        const wrapper = mount(DashboardView, {
            global: { plugins: [pinia] },
            attachTo: document.body,
        });
        await flushPromises();
        return { api, wrapper };
    }

    it('loads on mount and shows the overview with the open count and last update', async () => {
        const { api, wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    mine: [dashboardPr({ id: 'A' }), dashboardPr({ id: 'B', number: 2 })],
                }),
            })
        );

        expect(api.getDashboard).toHaveBeenCalledTimes(1);
        expect(wrapper.text()).toContain('Overview');
        expect(wrapper.text()).toContain('2 open by you in o/r');
        expect(wrapper.text()).toContain('Updated 5m ago');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });

    it('leaves the notifications to the header menu', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                activity: [{ kind: 'approved', at: 'T1', number: 1, title: 'a', url: 'u1' }],
            })
        );
        expect(wrapper.text()).not.toContain('Notifications');
    });

    it("lists a card's PRs when it is clicked, and goes back to the overview", async () => {
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    toReview: [
                        dashboardPr({ id: 'R1', number: 8, author: 'ann' }),
                        dashboardPr({ id: 'R2', number: 9, author: 'ann' }),
                    ],
                }),
            })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);
        expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(2);
        expect(wrapper.text()).toContain('Needs your review');
        expect(wrapper.text()).toContain('2 · Requested from you');

        await wrapper.get('button').trigger('click'); // Overview
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });

    it('says so when a card has no PRs', async () => {
        const { wrapper } = await mountView(dashboardState());

        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.text()).toContain('No pull requests here.');
    });

    it('explains a failed load, keeping stale data on screen', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                status: 'not-authenticated',
                snapshot: dashboardSnapshot({ toReview: [dashboardPr({ author: 'ann' })] }),
            })
        );

        expect(wrapper.text()).toContain('gh is not signed in to GitHub');
        expect(wrapper.text()).toContain('Showing data from 5m ago');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });

    it('says so when every card is hidden', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                hiddenCards: [
                    'review',
                    'changes',
                    'ready',
                    'failing',
                    'conflicts',
                    'open',
                    'stale',
                    'merged',
                    'drafts',
                ],
            })
        );
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);
        expect(wrapper.text()).toContain('Every card is hidden.');
    });

    it('refreshes through the store', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        await wrapper.get('[aria-label="Refresh"]').trigger('click');
        expect(api.refreshDashboard).toHaveBeenCalledTimes(1);
    });

    it('keeps the Users filter on the page and sends the rest to the Settings page', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        await wrapper.get('[aria-label="Users"]').trigger('click');
        await flushPromises();
        await nextTick();

        const items = [
            ...document.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
        ] as HTMLElement[];
        expect(items.map((el) => el.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'All',
            'me (you)',
        ]);
        items[0]!.click();
        await flushPromises();
        expect(api.setDashboardAuthors).toHaveBeenCalledWith('all');

        const settings = wrapper.findAll('button').find((b) => b.text() === 'Dashboard settings');
        await settings!.trigger('click');
        expect(useUiStore().mainView).toBe('settings');
        expect(useUiStore().settingsSection).toBe('dashboard');
        wrapper.unmount();
    });

    it('opens a PR through the store when a row is clicked', async () => {
        const pr = dashboardPr({ author: 'ann' });
        const { wrapper } = await mountView(
            dashboardState({ snapshot: dashboardSnapshot({ toReview: [pr] }) })
        );
        const openPr = vi.spyOn(useDashboardStore(), 'openPr').mockImplementation(() => {});

        await wrapper.getComponent(DashboardCard).trigger('click');
        wrapper.getComponent(DashboardPrRow).vm.$emit('open', pr);
        expect(openPr).toHaveBeenCalledWith(pr);
    });

    it('opens a PR on GitHub from its Open in browser button', async () => {
        const pr = dashboardPr({ author: 'ann' });
        const { api, wrapper } = await mountView(
            dashboardState({ snapshot: dashboardSnapshot({ toReview: [pr] }) })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        await wrapper.get('[aria-label="Open in browser"]').trigger('click');
        expect(api.openExternal).toHaveBeenCalledWith(pr.url);
    });

    // Back to the overview is the page's job (MoirePage resets the navigation).
    it('reloads when another repository opens', async () => {
        const { api } = await mountView(dashboardState());

        useComparisonStore().repoPath = '/repos/other';
        await flushPromises();

        expect(api.getDashboard).toHaveBeenCalledTimes(2);
    });

    it('steps back from a card to the overview through the history', async () => {
        const { wrapper } = await mountView(dashboardState());
        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);

        useUiStore().goBack();
        await flushPromises();
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });
});
