import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardCard from '@/components/dashboard/DashboardCard.vue';
import type { DashboardCategory } from '@/stores/dashboard';
import { dashboardPr } from './fixtures';

function category(count: number, unread = 0): DashboardCategory {
    return {
        key: 'review',
        label: 'Needs your review',
        caption: 'Requested from you',
        dotClass: 'bg-moire-accent',
        prs: Array.from({ length: count }, (_, i) => dashboardPr({ id: `P${i}`, number: i + 1 })),
        unread,
    };
}

describe('DashboardCard', () => {
    it('shows the dot, label, count and caption', () => {
        const wrapper = mount(DashboardCard, { props: { category: category(4) } });

        expect(wrapper.text()).toContain('Needs your review');
        expect(wrapper.text()).toContain('4');
        expect(wrapper.text()).toContain('Requested from you');
        expect(wrapper.find('.bg-moire-accent').exists()).toBe(true);
    });

    it('fades a zero count', () => {
        const wrapper = mount(DashboardCard, { props: { category: category(0) } });
        expect(wrapper.find('.text-moire-faint.tabular-nums').text()).toBe('0');
    });

    it('shows a pill counting unread notifications about its PRs', () => {
        expect(mount(DashboardCard, { props: { category: category(2) } }).text()).not.toContain(
            'new'
        );

        const pill = mount(DashboardCard, { props: { category: category(2, 1) } }).get(
            '[title="1 unread notification"]'
        );
        expect(pill.text()).toBe('1 new');
        expect(pill.classes()).toContain('bg-moire-pr-open');
    });

    it('emits open when clicked', async () => {
        const wrapper = mount(DashboardCard, { props: { category: category(1) } });
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('open')).toHaveLength(1);
    });
});
