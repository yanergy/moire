import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';
import { TooltipProvider } from '@/components/ui/tooltip';

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

    // Options may carry a tooltip (e.g. the compare-mode control), which wraps each
    // item in a tooltip. The item must still render and emit; the tooltip content
    // itself only mounts on hover and is not asserted here.
    it('renders tooltip-carrying options and still emits on click', async () => {
        const tipOptions = [
            { value: 'merge-base', label: 'merge-base', tooltip: 'Explains merge-base' },
            { value: 'direct', label: 'direct', tooltip: 'Explains direct' },
        ];
        const onUpdate = vi.fn<(value: string) => void>();
        const wrapper = mount(TooltipProvider, {
            slots: {
                default: () =>
                    h(SegmentedToggle, {
                        options: tipOptions,
                        modelValue: 'merge-base',
                        'onUpdate:modelValue': onUpdate,
                    }),
            },
        });
        await nextTick();

        const buttons = wrapper.findAll('button');
        expect(buttons).toHaveLength(2);

        await buttons[1]!.trigger('click');
        expect(onUpdate).toHaveBeenCalledWith('direct');
    });
});
