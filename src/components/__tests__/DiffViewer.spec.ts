import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import { editor } from './monaco-stub';

describe('DiffViewer', () => {
    it('mounts and creates a diff editor in its container', () => {
        const wrapper = mount(DiffViewer, {
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
