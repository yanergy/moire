import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MonacoDiff from '../MonacoDiff.vue';
import { editor } from './monaco-stub';

describe('MonacoDiff', () => {
    it('mounts and creates a diff editor in its container', () => {
        const wrapper = mount(MonacoDiff, {
            props: {
                original: 'const a = 1;',
                modified: 'const a = 2;',
                language: 'typescript',
                viewMode: 'split',
                isDark: true,
            },
        });

        expect(wrapper.find('.size-full').exists()).toBe(true);
        expect(editor.createDiffEditor).toHaveBeenCalled();
    });
});
