import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';

describe('LargeFileGate', () => {
    it('shows the size in MB and a Load diff button', () => {
        const wrapper = mount(LargeFileGate, { props: { sizeBytes: 2 * 1024 * 1024 } });

        expect(wrapper.text()).toContain('2.0 MB');
        expect(wrapper.find('button').text()).toContain('Load diff');
    });

    it('shows sub-megabyte sizes in KB', () => {
        const wrapper = mount(LargeFileGate, { props: { sizeBytes: 700 * 1024 } });
        expect(wrapper.text()).toContain('700 KB');
    });

    it('emits load when the button is clicked', async () => {
        const wrapper = mount(LargeFileGate, { props: { sizeBytes: 1024 * 1024 } });

        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('load')).toHaveLength(1);
    });
});
