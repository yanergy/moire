import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SelectionBanner from '@/components/diff/SelectionBanner.vue';
import type { ChangedFile } from '@/shared/types';

const file: ChangedFile = {
    path: 'src/stores/comparison.ts',
    status: 'M',
    additions: 19,
    deletions: 7,
    binary: false,
};

describe('SelectionBanner', () => {
    it('renders the path, status badge, and change counts', () => {
        const wrapper = mount(SelectionBanner, {
            props: { file, viewed: false, changeCount: 3 },
        });
        const text = wrapper.text();

        expect(text).toContain('src/stores/');
        expect(text).toContain('comparison.ts');
        expect(text).toContain('M');
        expect(text).toContain('+19');
        expect(text).toContain('−7');
        expect(text).toContain('3 changes');
    });

    it('switches the toggle label between the viewed states', async () => {
        const wrapper = mount(SelectionBanner, {
            props: { file, viewed: false, changeCount: 0 },
        });
        expect(wrapper.text()).toContain('Mark viewed');

        await wrapper.setProps({ viewed: true });
        expect(wrapper.text()).toContain('Viewed');
        expect(wrapper.text()).not.toContain('Mark viewed');
    });

    it('emits prev, next, and toggleViewed from its controls', async () => {
        const wrapper = mount(SelectionBanner, {
            props: { file, viewed: false, changeCount: 2 },
        });
        const buttons = wrapper.findAll('button'); // prev, next, mark-viewed

        await buttons[0]!.trigger('click');
        await buttons[1]!.trigger('click');
        await buttons[2]!.trigger('click');

        expect(wrapper.emitted('prev')).toHaveLength(1);
        expect(wrapper.emitted('next')).toHaveLength(1);
        expect(wrapper.emitted('toggleViewed')).toHaveLength(1);
    });
});
