import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SegmentedToggle from '@/components/SegmentedToggle.vue';

const options = [
    { value: 'split', label: 'split' },
    { value: 'unified', label: 'unified' },
];

describe('SegmentedToggle', () => {
    it('renders every option and marks the active one', () => {
        const wrapper = mount(SegmentedToggle, { props: { options, modelValue: 'split' } });
        const buttons = wrapper.findAll('button');

        expect(buttons).toHaveLength(2);
        expect(buttons[0]!.classes()).toContain('bg-dv-seg-active');
        expect(buttons[1]!.classes()).not.toContain('bg-dv-seg-active');
    });

    it('emits update:modelValue with the clicked option value', async () => {
        const wrapper = mount(SegmentedToggle, { props: { options, modelValue: 'split' } });
        await wrapper.findAll('button')[1]!.trigger('click');

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['unified']);
    });
});
