import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';

const options = [
    { value: 'split', label: 'split' },
    { value: 'unified', label: 'unified' },
];

describe('SegmentedToggle', () => {
    it('renders every option and marks the active one', async () => {
        const wrapper = mount(SegmentedToggle, { props: { options, modelValue: 'split' } });
        await nextTick();
        const buttons = wrapper.findAll('button');

        expect(buttons).toHaveLength(2);
        expect(buttons[0]!.attributes('data-state')).toBe('on');
        expect(buttons[1]!.attributes('data-state')).toBe('off');
    });

    it('emits update:modelValue with the clicked option value', async () => {
        const wrapper = mount(SegmentedToggle, { props: { options, modelValue: 'split' } });
        await wrapper.findAll('button')[1]!.trigger('click');

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['unified']);
    });
});
