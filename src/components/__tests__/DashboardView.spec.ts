import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DashboardView from '@/components/dashboard/DashboardView.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import DashboardCard from '@/components/dashboard/DashboardCard.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useDashboardStore } from '@/stores/dashboard';
import type { DashboardState } from '@/shared/types';
import { dashboardPr, dashboardSnapshot, dashboardState } from './fixtures';

function stubApi(state: DashboardState) {
    const api = {
        getDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        refreshDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        setDashboardShowDrafts: vi
            .fn<(show: boolean) => Promise<DashboardState>>()
            .mockResolvedValue({ ...state, showDrafts: false }),
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
        // Attached so the Display menu, which teleports to the body, can open.
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
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(7);
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
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(7);
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
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(7);
    });

    it('refreshes through the store', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        await wrapper.get('[aria-label="Refresh"]').trigger('click');
        expect(api.refreshDashboard).toHaveBeenCalledTimes(1);
    });

    it('offers Show drafts and a Users submenu in the Display menu', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        await wrapper.get('[aria-label="Display options"]').trigger('click');
        await flushPromises();
        await nextTick();

        const items = [
            ...document.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
        ] as HTMLElement[];
        const subTrigger = document.querySelector('[data-slot="dropdown-menu-sub-trigger"]');
        expect(items.map((el) => el.textContent?.trim())).toEqual(['Show drafts']);
        expect(subTrigger?.textContent).toContain('Users');
        expect(subTrigger?.textContent).toContain('You');

        items[0]!.click();
        await flushPromises();
        expect(api.setDashboardShowDrafts).toHaveBeenCalledWith(false);
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

    it('reloads, back on the overview, when another repository opens', async () => {
        const { api, wrapper } = await mountView(dashboardState());
        await wrapper.getComponent(DashboardCard).trigger('click');

        useComparisonStore().repoPath = '/repos/other';
        await flushPromises();

        expect(api.getDashboard).toHaveBeenCalledTimes(2);
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(7);
    });
});
