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
        // The directory prefix and filename must join with no stray space between
        // them, even though the filename is a separate clickable element.
        expect(text).toContain('src/stores/comparison.ts');
        expect(text).toContain('M');
        expect(text).toContain('+19');
        expect(text).toContain('−7');
        expect(text).toContain('3 changes');
    });

    it('shows the old path moving to the new one for a rename', () => {
        const renamed: ChangedFile = {
            path: 'src/stores/comparison.ts',
            oldPath: 'src/lib/compare.ts',
            status: 'R',
            additions: 4,
            deletions: 2,
            binary: false,
        };
        const wrapper = mount(SelectionBanner, {
            props: { file: renamed, viewed: false, changeCount: 1 },
        });
        const text = wrapper.text();

        expect(text).toContain('src/lib/compare.ts');
        expect(text).toContain('comparison.ts');
        expect(wrapper.find('.lucide-arrow-right').exists()).toBe(true);
    });

    it('shows no rename arrow for a non-rename file', () => {
        const wrapper = mount(SelectionBanner, {
            props: { file, viewed: false, changeCount: 0 },
        });
        expect(wrapper.find('.lucide-arrow-right').exists()).toBe(false);
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
        const markViewed = wrapper.findAll('button').find((b) => b.text().includes('Mark viewed'));

        await wrapper.get('[aria-label="Previous change"]').trigger('click');
        await wrapper.get('[aria-label="Next change"]').trigger('click');
        await markViewed?.trigger('click');

        expect(wrapper.emitted('prev')).toHaveLength(1);
        expect(wrapper.emitted('next')).toHaveLength(1);
        expect(wrapper.emitted('toggleViewed')).toHaveLength(1);
    });

    it('makes the filename an open-file link with an external-link icon', async () => {
        const wrapper = mount(SelectionBanner, {
            props: { file, viewed: false, changeCount: 0 },
        });
        const link = wrapper.get('[title="src/stores/comparison.ts"]');

        // The icon lives inside the link (an "opens externally" affordance), not a
        // separate button beside it.
        expect(link.find('.lucide-square-arrow-out-up-right').exists()).toBe(true);

        await link.trigger('click');
        expect(wrapper.emitted('open')).toHaveLength(1);
    });

    it('renders the filename as plain text with no link or icon for a deleted file', () => {
        const deleted: ChangedFile = { ...file, status: 'D', additions: 0, deletions: 214 };
        const wrapper = mount(SelectionBanner, {
            props: { file: deleted, viewed: false, changeCount: 0 },
        });

        // No open affordance: a deleted file has no working-tree copy to open.
        expect(wrapper.find('[title="src/stores/comparison.ts"]').exists()).toBe(false);
        expect(wrapper.find('.lucide-square-arrow-out-up-right').exists()).toBe(false);
        expect(wrapper.text()).toContain('src/stores/comparison.ts');
    });
});
