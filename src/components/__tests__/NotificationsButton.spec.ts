import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import NotificationsButton from '@/components/headers/NotificationsButton.vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import type { ActivityEntry } from '@/shared/types';
import { dashboardState } from './fixtures';

const UNREAD: ActivityEntry = {
    kind: 'checks-failed',
    checks: ['lint'],
    at: '2026-10-26T12:00:00Z',
    number: 2,
    title: 'Second',
    url: 'https://github.com/o/r/pull/2',
};

describe('NotificationsButton', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function mountButton(activity: ActivityEntry[]) {
        useDashboardStore().applyState(dashboardState({ activity }));
        return mount(NotificationsButton, {
            props: { selected: false },
            global: { plugins: [pinia] },
        });
    }

    it('shows the unread count on the toggle', () => {
        const wrapper = mountButton([UNREAD, { ...UNREAD, number: 1, read: true }]);
        expect(wrapper.get('[aria-label="1 unread notification"]').text()).toBe('1');
    });

    it('shows no count when every notification is read', () => {
        const wrapper = mountButton([{ ...UNREAD, read: true }]);
        expect(wrapper.text()).toBe('Notifications');
    });

    it('goes to the notifications page', async () => {
        const wrapper = mountButton([]);
        const ui = useUiStore();

        await wrapper.get('button').trigger('click');
        expect(ui.mainView).toBe('notifications');
    });

    it('shows as the current page when selected, and then does nothing on click', async () => {
        const wrapper = mountButton([]);
        await wrapper.setProps({ selected: true });

        expect(wrapper.get('button').attributes('aria-current')).toBe('page');
        await wrapper.get('button').trigger('click');
        expect(useUiStore().mainView).toBe('diff');
    });
});
