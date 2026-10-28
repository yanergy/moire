import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NotificationsMenu from '@/components/headers/NotificationsMenu.vue';
import NotificationRow from '@/components/headers/NotificationRow.vue';
import NotificationSettings from '@/components/headers/NotificationSettings.vue';
import { useDashboardStore } from '@/stores/dashboard';
import type { ActivityEntry } from '@/shared/types';
import { dashboardState } from './fixtures';

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

describe('NotificationsMenu', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // Attached so the menu, which teleports to the body, can open.
    function mountMenu(activity: ActivityEntry[]) {
        useDashboardStore().applyState(dashboardState({ activity }));
        return mount(NotificationsMenu, {
            global: { plugins: [pinia] },
            attachTo: document.body,
        });
    }

    async function openMenu(wrapper: ReturnType<typeof mountMenu>) {
        await wrapper.get('[aria-label="Notifications"]').trigger('click');
        await flushPromises();
        await nextTick();
    }

    it('shows the unread count on the bell', async () => {
        const wrapper = mountMenu(ACTIVITY);
        const bell = wrapper.get('[aria-label="Notifications"]');
        expect(bell.text()).toBe('1');
        expect(bell.attributes('title')).toBeUndefined();

        // Hovered, as the menu's tooltips ignore focus that is not from the keyboard.
        await bell.trigger('pointermove', { pointerType: 'mouse' });
        await new Promise((resolve) => setTimeout(resolve, 350));
        await flushPromises();
        expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
            '1 unread notification'
        );
        wrapper.unmount();
    });

    it('shows no count when every notification is read', async () => {
        const wrapper = mountMenu([{ ...ACTIVITY[0]!, read: true }]);
        expect(wrapper.get('[aria-label="Notifications"]').text()).toBe('');
        wrapper.unmount();
    });

    it('lists the notifications newest first and marks all read', async () => {
        const wrapper = mountMenu(ACTIVITY);
        const markAllRead = vi
            .spyOn(useDashboardStore(), 'markAllRead')
            .mockResolvedValue(undefined);
        await openMenu(wrapper);

        const rows = wrapper.findAllComponents(NotificationRow);
        expect(rows.map((row) => row.props('entry').number)).toEqual([2, 1]);
        expect(document.body.textContent).toContain('Checks failed: lint');

        const button = [...document.querySelectorAll('button')].find(
            (b) => b.textContent?.trim() === 'Mark all as read'
        );
        button!.click();
        expect(markAllRead).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('opens a notification and closes the menu', async () => {
        const wrapper = mountMenu(ACTIVITY);
        const openActivity = vi
            .spyOn(useDashboardStore(), 'openActivity')
            .mockImplementation(() => {});
        await openMenu(wrapper);

        wrapper.findAllComponents(NotificationRow)[0]!.vm.$emit('open', ACTIVITY[0]);
        await flushPromises();
        expect(openActivity).toHaveBeenCalledWith(ACTIVITY[0]);
        expect(wrapper.findAllComponents(NotificationRow)).toHaveLength(0);
        wrapper.unmount();
    });

    it('focuses the menu, not its first notification, on open', async () => {
        const wrapper = mountMenu([{ ...ACTIVITY[0]!, read: true }]);
        await openMenu(wrapper);

        const rows = wrapper.findAllComponents(NotificationRow);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.element.contains(document.activeElement)).toBe(false);
        expect(document.activeElement?.getAttribute('data-slot')).toBe('popover-content');
        wrapper.unmount();
    });

    // Popover and Tooltip both build on Reka's Popper. Nested in the tooltip, the
    // popover trigger anchored the tooltip instead, and the menu stayed parked at
    // its unpositioned placeholder offscreen.
    it('positions the menu against the bell', async () => {
        const wrapper = mountMenu(ACTIVITY);
        await openMenu(wrapper);
        await new Promise((resolve) => setTimeout(resolve, 50));
        await flushPromises();

        const content = document.querySelector('[data-slot="popover-content"]');
        expect(content).not.toBeNull();
        expect((content!.parentElement as HTMLElement).style.transform).not.toContain('-200%');
        wrapper.unmount();
    });

    it('swaps the list for the settings and back, starting on the list each time', async () => {
        const wrapper = mountMenu(ACTIVITY);
        await openMenu(wrapper);
        const button = (label: string) =>
            document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

        button('Notification settings')!.click();
        await flushPromises();
        expect(wrapper.findComponent(NotificationSettings).exists()).toBe(true);
        expect(wrapper.findAllComponents(NotificationRow)).toHaveLength(0);
        expect(document.body.textContent).toContain('Notification settings');

        button('Back to notifications')!.click();
        await flushPromises();
        expect(wrapper.findComponent(NotificationSettings).exists()).toBe(false);
        expect(wrapper.findAllComponents(NotificationRow)).toHaveLength(2);

        button('Notification settings')!.click();
        await flushPromises();
        await wrapper.get('[aria-label="Notifications"]').trigger('click');
        await openMenu(wrapper);
        expect(wrapper.findAllComponents(NotificationRow)).toHaveLength(2);
        wrapper.unmount();
    });

    it('loads the dashboard state for the settings when nothing loaded it yet', async () => {
        const wrapper = mountMenu(ACTIVITY);
        const dashboard = useDashboardStore();
        dashboard.notificationSettings = null;
        const load = vi.spyOn(dashboard, 'load').mockResolvedValue(undefined);
        await openMenu(wrapper);

        document.querySelector<HTMLButtonElement>('[aria-label="Notification settings"]')!.click();
        await flushPromises();
        expect(load).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('says when no notifications were sent yet', async () => {
        const wrapper = mountMenu([]);
        await openMenu(wrapper);
        expect(document.body.textContent).toContain('No notifications for this repository yet.');
        wrapper.unmount();
    });
});
