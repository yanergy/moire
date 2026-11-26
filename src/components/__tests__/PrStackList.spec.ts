import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrStackList from '@/components/pr/PrStackList.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { PrStack, PrStackEntry } from '@/shared/types';

const entry = (over: Partial<PrStackEntry>): PrStackEntry => ({
    number: 1,
    title: 'Bottom',
    url: '',
    headRefName: 'a',
    baseRefName: 'main',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: '',
    position: 1,
    isCurrent: false,
    ...over,
});

const stack: PrStack = {
    number: 1,
    size: 3,
    baseRefName: 'main',
    entries: [
        entry({ reviewDecision: 'APPROVED' }),
        entry({
            number: 2,
            title: 'Middle',
            headRefName: 'b',
            baseRefName: 'a',
            position: 2,
            isCurrent: true,
        }),
        entry({
            number: 3,
            title: 'Top',
            headRefName: 'c',
            baseRefName: 'b',
            position: 3,
            isDraft: true,
            needsRebase: true,
        }),
    ],
};

describe('PrStackList', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('lists the stack as a numbered sequence from the trunk up, the current PR highlighted', () => {
        const wrapper = mount(PrStackList, { props: { stack } });
        const rows = wrapper.findAll('[data-slot="stack-entry"]');

        expect(wrapper.findAll('[data-slot="stack-position"]').map((p) => p.text())).toEqual([
            '1',
            '2',
            '3',
        ]);
        expect(rows.map((r) => r.text().match(/#\d+/)![0])).toEqual(['#1', '#2', '#3']);
        // Not indented by depth: every row has the same inset.
        expect(rows.every((r) => !r.attributes('style'))).toBe(true);
        expect(rows[1]!.attributes('data-current')).toBe('true');
        expect(rows[1]!.classes()).toContain('border-moire-accent');
        expect(rows[1]!.text()).toContain('This PR');
        // A line joins each PR to the next, none after the last.
        expect(wrapper.findAll('[data-slot="stack-connector"]')).toHaveLength(2);
        expect(rows[0]!.text()).toContain('Approved');
        expect(rows[2]!.text()).toContain('Draft');
        expect(rows[2]!.find('[data-slot="stack-rebase"]').text()).toContain('rebase onto b');
        expect(wrapper.text()).toContain('Stacked on main');
    });

    it("opens another PR's own range from a click anywhere on its row", async () => {
        const store = useComparisonStore();
        const select = vi.spyOn(store, 'selectPullRequestRange').mockReturnValue(true);
        const wrapper = mount(PrStackList, { props: { stack } });
        const rows = wrapper.findAll('[data-slot="stack-entry"]');

        await rows[2]!.trigger('click');
        expect(select).toHaveBeenCalledWith('b', 'c');

        // The current PR is not a link.
        expect(rows[1]!.element.tagName).toBe('DIV');
        await rows[1]!.trigger('click');
        expect(select).toHaveBeenCalledTimes(1);
    });

    it('says when a branch is missing locally', async () => {
        const store = useComparisonStore();
        vi.spyOn(store, 'selectPullRequestRange').mockReturnValue(false);
        const wrapper = mount(PrStackList, { props: { stack } });

        await wrapper.findAll('[data-slot="stack-entry"]')[2]!.trigger('click');
        expect(wrapper.get('[data-slot="stack-error"]').text()).toContain('Fetch b and c');
    });

    it('shows a merged PR as merged and not as needing an action', () => {
        const wrapper = mount(PrStackList, {
            props: {
                stack: {
                    number: 1,
                    size: 2,
                    baseRefName: 'main',
                    entries: [entry({ state: 'MERGED' }), entry({ number: 2, position: 2 })],
                },
            },
        });
        const rows = wrapper.findAll('[data-slot="stack-entry"]');
        expect(rows[0]!.text()).toContain('Merged');
        expect(rows[0]!.find('[data-slot="stack-rebase"]').exists()).toBe(false);
    });
});
