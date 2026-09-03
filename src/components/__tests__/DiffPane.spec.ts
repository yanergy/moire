import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import DiffPane from '@/components/diff/DiffPane.vue';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';
import ImagePreview from '@/components/diff/ImagePreview.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import SelectionBanner from '@/components/diff/SelectionBanner.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { ChangedFile, FilePair } from '@/shared/types';

const imagePair: FilePair = {
    path: 'logo.png',
    oldContent: null,
    newContent: null,
    language: 'plaintext',
    binary: true,
    tooLarge: false,
    sizeBytes: 2048,
    image: true,
    oldImage: 'data:image/png;base64,AAAA',
    newImage: 'data:image/png;base64,BBBB',
};

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
    afterEach(() => {
        delete window.api;
    });

    it('shows the gate instead of the diff viewer for a large file', () => {
        const store = useComparisonStore();
        store.selectedPair = { ...largePair };

        const wrapper = mount(DiffPane);
        expect(wrapper.findComponent(LargeFileGate).exists()).toBe(true);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
    });

    it('reveals the diff viewer once Load diff is clicked', async () => {
        // Clearing the gate refetches the withheld content through the bridge, so
        // the store needs a base, a selected file, and a getFilePair stub.
        window.api = {
            getFilePair: vi.fn<() => Promise<FilePair>>().mockResolvedValue({ ...largePair }),
        } as unknown as Window['api'];
        const store = useComparisonStore();
        store.base = 'main';
        store.files = [{ path: 'big.txt', status: 'M', additions: 0, deletions: 0, binary: false }];
        store.selectFile('big.txt');
        await flushPromises();

        const wrapper = mount(DiffPane);
        expect(store.showDiffGate).toBe(true);

        await wrapper.findComponent(LargeFileGate).find('button').trigger('click');
        await flushPromises();

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

    it('shows the image preview instead of the viewer or the binary notice', () => {
        const store = useComparisonStore();
        store.selectedPair = { ...imagePair };

        const wrapper = mount(DiffPane);
        expect(wrapper.findComponent(ImagePreview).exists()).toBe(true);
        expect(wrapper.findComponent(BinaryFileNotice).exists()).toBe(false);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
    });

    it('keeps the split base/head header for an image even in unified mode', () => {
        const store = useComparisonStore();
        store.selectedPair = { ...imagePair };
        store.base = 'main';
        store.head = 'feature';
        useUiStore().setViewMode('unified');

        const wrapper = mount(DiffPane);
        const header = wrapper.text();
        // Both branch names show (split header), not the single range label.
        expect(header).toContain('main');
        expect(header).toContain('feature');
        expect(header).not.toContain('main...feature');
    });
});

const textFile = (path: string): ChangedFile => ({
    path,
    status: 'M',
    additions: 1,
    deletions: 0,
    binary: false,
});

const textPair = (path: string): FilePair => ({
    path,
    oldContent: `old ${path}`,
    newContent: `new ${path}`,
    language: 'typescript',
    binary: false,
    tooLarge: false,
    sizeBytes: 0,
});

// The Monaco stub never fires a diff update, so a mounted viewer holds no changes:
// next()/prev() report the boundary right away and navigation crosses files, which
// is exactly the case this feature (issue #2) targets.
describe('DiffPane cross-file change navigation', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        window.api = {
            getFilePair: vi
                .fn<(b: string, h: string, path: string) => Promise<FilePair>>()
                .mockImplementation((_b, _h, path) => Promise.resolve(textPair(path))),
        } as unknown as Window['api'];
    });
    afterEach(() => {
        delete window.api;
    });

    async function seededPane(selected: string) {
        const store = useComparisonStore();
        store.base = 'main';
        store.files = [textFile('a.ts'), textFile('b.ts')];
        store.selectFile(selected);
        await flushPromises();
        const wrapper = mount(DiffPane);
        return { store, wrapper };
    }

    it('crosses to the next file when next is pressed at the end of the current file', async () => {
        const { store, wrapper } = await seededPane('a.ts');
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(true);

        wrapper.findComponent(SelectionBanner).vm.$emit('next');
        await flushPromises();

        expect(store.selectedPath).toBe('b.ts');
        expect(store.pendingChangeEdge).toBe('first');
    });

    it('wraps to the last file when prev is pressed on the first file', async () => {
        const { store, wrapper } = await seededPane('a.ts');

        wrapper.findComponent(SelectionBanner).vm.$emit('prev');
        await flushPromises();

        expect(store.selectedPath).toBe('b.ts');
        expect(store.pendingChangeEdge).toBe('last');
    });

    it('crosses files from a non-text pane, where there is no viewer to step through', async () => {
        const store = useComparisonStore();
        store.base = 'main';
        store.files = [textFile('logo.png'), textFile('b.ts')];
        store.selectFile('logo.png');
        store.selectedPair = { ...imagePair, path: 'logo.png' };
        const wrapper = mount(DiffPane);
        // The image preview claims the pane, not the diff viewer.
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);

        wrapper.findComponent(SelectionBanner).vm.$emit('next');
        await flushPromises();

        expect(store.selectedPath).toBe('b.ts');
        expect(store.pendingChangeEdge).toBe('first');
    });
});
