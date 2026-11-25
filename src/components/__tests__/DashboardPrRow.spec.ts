import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import { dashboardPr, stubTooltips } from './fixtures';

stubTooltips();

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

    it("shows the author's avatar only when asked", () => {
        const plain = mount(DashboardPrRow, { props: { pr: dashboardPr(), now: NOW } });
        expect(plain.findComponent({ name: 'UserAvatar' }).exists()).toBe(false);

        const withAvatar = mount(DashboardPrRow, {
            props: { pr: dashboardPr(), now: NOW, showAvatar: true },
        });
        expect(withAvatar.findComponent({ name: 'UserAvatar' }).exists()).toBe(true);
    });

    it('shows only the head branch in a stack, with both branches on hover', () => {
        const pr = dashboardPr();
        const plain = mount(DashboardPrRow, { props: { pr, now: NOW } });
        expect(plain.find('[data-slot="pr-branches"]').text()).toBe(
            `${pr.headRefName} → ${pr.baseRefName}`
        );

        const stacked = mount(DashboardPrRow, { props: { pr, now: NOW, inStack: true } });
        const branches = stacked.find('[data-slot="pr-branches"]');
        expect(branches.text()).toBe(pr.headRefName);
        expect(branches.attributes('title')).toBe(`${pr.headRefName} → ${pr.baseRefName}`);
    });

    it('shows the first few labels and counts the rest', () => {
        const label = (name: string) => ({ name, color: 'a2eeef', description: '' });
        const pr = dashboardPr({
            labels: [label('bug'), label('ui'), label('p1'), label('later'), label('docs')],
        });
        const wrapper = mount(DashboardPrRow, { props: { pr, now: NOW } });

        expect(wrapper.findAll('[data-slot="pr-label"]').map((l) => l.text())).toEqual([
            'bug',
            'ui',
            'p1',
        ]);
        const more = wrapper.get('[data-slot="pr-label-more"]');
        expect(more.text()).toBe('+2');
        expect(more.attributes('title')).toBe('later, docs');
    });

    it('shows no labels for a PR without any', () => {
        const wrapper = mount(DashboardPrRow, { props: { pr: dashboardPr(), now: NOW } });
        expect(wrapper.find('[data-slot="pr-label"]').exists()).toBe(false);
        expect(wrapper.find('[data-slot="pr-label-more"]').exists()).toBe(false);
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
