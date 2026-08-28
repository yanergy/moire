import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DiffPane from '@/components/diff/DiffPane.vue';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { FilePair } from '@/shared/types';

const largePair: FilePair = {
    path: 'big.txt',
    oldContent: 'x',
    newContent: 'x',
    language: 'plaintext',
    binary: false,
    tooLarge: true,
    sizeBytes: 3 * 1024 * 1024,
};

describe('DiffPane large-file gate', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('shows the gate instead of the diff viewer for a large file', () => {
        const store = useComparisonStore();
        store.selectedPair = { ...largePair };

        const wrapper = mount(DiffPane);
        expect(wrapper.findComponent(LargeFileGate).exists()).toBe(true);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
    });

    it('reveals the diff viewer once Load diff is clicked', async () => {
        const store = useComparisonStore();
        store.selectedPair = { ...largePair };

        const wrapper = mount(DiffPane);
        await wrapper.findComponent(LargeFileGate).find('button').trigger('click');

        expect(store.showDiffGate).toBe(false);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(true);
        expect(wrapper.findComponent(LargeFileGate).exists()).toBe(false);
    });

    it('shows the binary notice instead of the viewer for a binary file', () => {
        const store = useComparisonStore();
        store.selectedPair = {
            path: 'logo.png',
            oldContent: null,
            newContent: null,
            language: 'plaintext',
            binary: true,
            tooLarge: false,
            sizeBytes: 4096,
        };

        const wrapper = mount(DiffPane);
        expect(wrapper.findComponent(BinaryFileNotice).exists()).toBe(true);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
        expect(wrapper.findComponent(LargeFileGate).exists()).toBe(false);
    });
});
