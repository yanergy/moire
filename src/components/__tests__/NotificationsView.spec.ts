import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import NotificationsView from '@/components/notifications/NotificationsView.vue';
import NotificationRow from '@/components/notifications/NotificationRow.vue';
import NotificationSettings from '@/components/notifications/NotificationSettings.vue';
import { useDashboardStore } from '@/stores/dashboard';
import type { ActivityEntry } from '@/shared/types';
import { dashboardState, stubTooltips } from './fixtures';

stubTooltips();

const ACTIVITY: ActivityEntry[] = [
    {
        kind: 'checks-failed',
        checks: ['lint'],
        at: '2026-10-26T12:00:00Z',
        number: 2,
        title: 'Second',
        url: 'https://github.com/o/r/pull/2',
    },
    {
        kind: 'review-requested',
        at: '2026-10-26T11:00:00Z',
        number: 1,
        title: 'First',
        url: 'https://github.com/o/r/pull/1',
        read: true,
    },
];

describe('NotificationsView', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function mountView(activity: ActivityEntry[]) {
        useDashboardStore().applyState(dashboardState({ activity }));
        return mount(NotificationsView, { global: { plugins: [pinia] } });
    }

    it('lists the notifications newest first, with the settings beside them', () => {
        const wrapper = mountView(ACTIVITY);

        const rows = wrapper.findAllComponents(NotificationRow);
        expect(rows.map((row) => row.props('entry').number)).toEqual([2, 1]);
        expect(wrapper.text()).toContain('1 unread of 2');
        expect(wrapper.findComponent(NotificationSettings).exists()).toBe(true);
    });

    it('marks all read, offered only while something is unread', async () => {
        const markAllRead = vi
            .spyOn(useDashboardStore(), 'markAllRead')
            .mockResolvedValue(undefined);
        const wrapper = mountView(ACTIVITY);

        const button = wrapper.findAll('button').find((b) => b.text() === 'Mark all as read');
        await button!.trigger('click');
        expect(markAllRead).toHaveBeenCalledTimes(1);

        const allRead = mountView([{ ...ACTIVITY[0]!, read: true }]);
        expect(allRead.text()).not.toContain('Mark all as read');
    });

    it('opens a notification', () => {
        const openActivity = vi
            .spyOn(useDashboardStore(), 'openActivity')
            .mockImplementation(() => {});
        const wrapper = mountView(ACTIVITY);

        wrapper.findAllComponents(NotificationRow)[0]!.vm.$emit('open', ACTIVITY[0]);
        expect(openActivity).toHaveBeenCalledWith(ACTIVITY[0]);
    });

    it('loads the dashboard state for the settings when nothing loaded it yet', async () => {
        const dashboard = useDashboardStore();
        const load = vi.spyOn(dashboard, 'load').mockResolvedValue(undefined);
        mount(NotificationsView, { global: { plugins: [pinia] } });
        await flushPromises();
        expect(load).toHaveBeenCalledTimes(1);

        load.mockClear();
        mountView(ACTIVITY);
        expect(load).not.toHaveBeenCalled();
    });

    it('says when no notifications were sent yet', () => {
        const wrapper = mountView([]);
        expect(wrapper.text()).toContain('No notifications for this repository yet.');
    });
});
