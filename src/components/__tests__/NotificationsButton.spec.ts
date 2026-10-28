import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import NotificationsButton from '@/components/headers/NotificationsButton.vue';
import { TooltipProvider } from '@/components/ui/tooltip';
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

// The toggle, found by its label.
function toggle(wrapper: VueWrapper) {
    return wrapper.findAll('button').find((b) => b.text().startsWith('Notifications'))!;
}

// The tooltip's text, shown once the toggle is hovered.
async function hoverTooltip(bell: DOMWrapper<Element>) {
    await bell.trigger('pointermove', { pointerType: 'mouse' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
    return document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? '';
}

describe('NotificationsButton', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // In a provider of its own, as the toolbar's, and attached so the tooltip,
    // which teleports to the body, can open.
    function mountButton(activity: ActivityEntry[]) {
        useDashboardStore().applyState(dashboardState({ activity }));
        return mount(
            {
                components: { NotificationsButton, TooltipProvider },
                template:
                    '<TooltipProvider :delay-duration="0"><NotificationsButton /></TooltipProvider>',
            },
            { global: { plugins: [pinia] }, attachTo: document.body }
        );
    }

    it('shows the unread count on the toggle and in its tooltip', async () => {
        const wrapper = mountButton([UNREAD, { ...UNREAD, number: 1, read: true }]);
        const bell = toggle(wrapper);
        expect(bell.get('[aria-label="1 unread notification"]').text()).toBe('1');
        expect(await hoverTooltip(bell)).toContain('1 unread notification');
        wrapper.unmount();
    });

    it('shows no count when every notification is read', () => {
        const wrapper = mountButton([{ ...UNREAD, read: true }]);
        expect(toggle(wrapper).text()).toBe('Notifications');
        wrapper.unmount();
    });

    it('toggles the notifications page', async () => {
        const wrapper = mountButton([]);
        const ui = useUiStore();
        const bell = toggle(wrapper);

        await bell.trigger('click');
        expect(ui.mainView).toBe('notifications');
        expect(bell.attributes('data-state')).toBe('on');
        expect(await hoverTooltip(bell)).toContain('Back to the diff');

        await bell.trigger('click');
        expect(ui.mainView).toBe('diff');
        wrapper.unmount();
    });
});
