import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';

describe('BinaryFileNotice', () => {
    it('explains that a binary file has no text diff', () => {
        const wrapper = mount(BinaryFileNotice);

        expect(wrapper.text()).toContain('Binary file');
        expect(wrapper.text()).toContain("can't be shown as a text diff");
    });
});
