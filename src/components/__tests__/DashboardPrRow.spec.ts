import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import { dashboardPr } from './fixtures';

const NOW = Date.parse('2026-10-26T12:00:00Z');

describe('DashboardPrRow', () => {
    it('shows the title, number, branches, age and size', () => {
        const wrapper = mount(DashboardPrRow, { props: { pr: dashboardPr(), now: NOW } });
        const text = wrapper.text();

        expect(text).toContain('Add notifications');
        expect(text).toContain('#1');
        expect(text).toContain('feat/x → main');
        expect(text).toContain('opened 3h ago');
        expect(text).toContain('+10');
        expect(text).toContain('−2');
    });

    it('ages a closed PR by when it closed', () => {
        const pr = dashboardPr({ state: 'CLOSED', closedAt: '2026-10-25T12:00:00Z' });
        const wrapper = mount(DashboardPrRow, { props: { pr, now: NOW } });
        expect(wrapper.text()).toContain('closed 1d ago');
    });

    it('names the failed checks on the CI icon', () => {
        const pr = dashboardPr({ ci: 'failing', failedChecks: ['lint'] });
        const wrapper = mount(DashboardPrRow, { props: { pr, now: NOW } });
        expect(wrapper.find('[aria-label="Failed: lint"]').exists()).toBe(true);
    });

    it('emits open with the PR when clicked', async () => {
        const pr = dashboardPr();
        const wrapper = mount(DashboardPrRow, { props: { pr, now: NOW } });

        await wrapper.findAll('button')[0]!.trigger('click');
        expect(wrapper.emitted('open')).toEqual([[pr]]);
    });

    it('emits openInBrowser, not open, from the Open in browser button', async () => {
        const pr = dashboardPr();
        const wrapper = mount(DashboardPrRow, { props: { pr, now: NOW } });

        await wrapper.get('[aria-label="Open in browser"]').trigger('click');
        expect(wrapper.emitted('openInBrowser')).toEqual([[pr]]);
        expect(wrapper.emitted('open')).toBeUndefined();
    });

    it('always shows Open in browser at the end of the row', () => {
        const wrapper = mount(DashboardPrRow, { props: { pr: dashboardPr(), now: NOW } });
        const button = wrapper.get('[aria-label="Open in browser"]');

        expect(button.classes()).not.toContain('opacity-0');
        expect(button.element.parentElement!.lastElementChild).toBe(button.element);
    });
});
