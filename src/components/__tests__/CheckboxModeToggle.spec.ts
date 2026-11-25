import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CheckboxModeToggle from '@/components/pr/CheckboxModeToggle.vue';
import { stubTooltips } from './fixtures';

stubTooltips();

describe('CheckboxModeToggle', () => {
    it('reflects the pressed state', () => {
        const off = mount(CheckboxModeToggle, { props: { pressed: false } });
        expect(off.get('[data-slot="checkbox-mode"]').attributes('data-state')).toBe('off');

        const on = mount(CheckboxModeToggle, { props: { pressed: true } });
        expect(on.get('[data-slot="checkbox-mode"]').attributes('data-state')).toBe('on');
    });

    it('asks to toggle when clicked', async () => {
        const wrapper = mount(CheckboxModeToggle, { props: { pressed: false } });
        await wrapper.get('[data-slot="checkbox-mode"]').trigger('click');
        expect(wrapper.emitted('toggle')).toHaveLength(1);
    });
});
