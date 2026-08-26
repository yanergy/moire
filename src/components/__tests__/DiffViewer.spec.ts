import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DiffViewer from '../DiffViewer.vue';

describe('DiffViewer', () => {
    it('mounts and renders its container', () => {
        const wrapper = mount(DiffViewer, {
            props: { language: 'typescript' },
        });

        expect(wrapper.find('.diff-viewer').exists()).toBe(true);
    });
});
