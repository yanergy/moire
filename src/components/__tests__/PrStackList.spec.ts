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
    depth: 0,
    isCurrent: false,
    needsRetarget: false,
    ...over,
});

const stack: PrStack = {
    trunk: 'main',
    entries: [
        entry({ reviewDecision: 'APPROVED' }),
        entry({
            number: 2,
            title: 'Middle',
            headRefName: 'b',
            baseRefName: 'a',
            depth: 1,
            isCurrent: true,
        }),
        entry({
            number: 3,
            title: 'Top',
            headRefName: 'c',
            baseRefName: 'b',
            depth: 2,
            isDraft: true,
            needsRebase: true,
        }),
    ],
};

describe('PrStackList', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('lists the stack top first, marks the current PR, and ends with the trunk', () => {
        const wrapper = mount(PrStackList, { props: { stack } });
        const rows = wrapper.findAll('[data-slot="stack-entry"]');

        expect(rows.map((r) => r.text().match(/#\d+/)![0])).toEqual(['#3', '#2', '#1']);
        expect(rows[1]!.attributes('data-current')).toBe('true');
        expect(rows[1]!.text()).toContain('This PR');
        expect(rows[2]!.text()).toContain('Approved');
        expect(rows[0]!.text()).toContain('Draft');
        expect(rows[0]!.find('[data-slot="stack-rebase"]').text()).toContain('rebase onto b');
        expect(wrapper.text().trim().endsWith('main')).toBe(true);
    });

    it("opens another PR's own range, against its parent", async () => {
        const store = useComparisonStore();
        const select = vi.spyOn(store, 'selectPullRequestRange').mockReturnValue(true);
        const wrapper = mount(PrStackList, { props: { stack } });

        await wrapper.findAll('[data-slot="stack-entry"] button')[0]!.trigger('click');
        expect(select).toHaveBeenCalledWith('b', 'c');

        await wrapper.findAll('[data-slot="stack-entry"] button')[1]!.trigger('click');
        expect(select).toHaveBeenCalledTimes(1);
    });

    it('says when a branch is missing locally', async () => {
        const store = useComparisonStore();
        vi.spyOn(store, 'selectPullRequestRange').mockReturnValue(false);
        const wrapper = mount(PrStackList, { props: { stack } });

        await wrapper.findAll('[data-slot="stack-entry"] button')[0]!.trigger('click');
        expect(wrapper.get('[data-slot="stack-error"]').text()).toContain('Fetch b and c');
    });

    it('flags a PR that needs retargeting after its base PR merged', () => {
        const wrapper = mount(PrStackList, {
            props: {
                stack: {
                    trunk: 'main',
                    entries: [
                        entry({ state: 'MERGED' }),
                        entry({
                            number: 2,
                            headRefName: 'b',
                            baseRefName: 'a',
                            depth: 1,
                            needsRetarget: true,
                        }),
                    ],
                },
            },
        });
        expect(wrapper.get('[data-slot="stack-retarget"]').text()).toContain('retarget onto main');
    });
});
