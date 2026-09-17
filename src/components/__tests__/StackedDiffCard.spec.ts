import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import StackedDiffCard from '@/components/diff/StackedDiffCard.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';
import ImagePreview from '@/components/diff/ImagePreview.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { ChangedFile, FilePair } from '@/shared/types';

const textFile: ChangedFile = {
    path: 'src/app.ts',
    status: 'M',
    additions: 3,
    deletions: 1,
    binary: false,
};

function pairOf(over: Partial<FilePair> = {}): FilePair {
    return {
        path: 'src/app.ts',
        oldContent: 'old',
        newContent: 'new',
        language: 'typescript',
        binary: false,
        tooLarge: false,
        sizeBytes: 0,
        ...over,
    };
}

// A card fetches its pair through the store, so a getFilePair stub is enough; extra
// bridge methods (openFile) are merged in for the tests that need them.
async function mountCard(
    file: ChangedFile,
    pair: FilePair,
    active = true,
    apiExtra: Record<string, unknown> = {}
) {
    const getFilePair = vi.fn<() => Promise<FilePair>>().mockResolvedValue(pair);
    window.api = { getFilePair, ...apiExtra } as unknown as Window['api'];
    const store = useComparisonStore();
    store.base = 'main';
    const wrapper = mount(StackedDiffCard, { props: { file, active } });
    await flushPromises();
    return { store, wrapper, getFilePair };
}

describe('StackedDiffCard', () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(() => {
        delete window.api;
    });

    it('shows the diff editor for an active text file, with the path in the header', async () => {
        const { wrapper } = await mountCard(textFile, pairOf());
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(true);
        expect(wrapper.attributes('data-path')).toBe('src/app.ts');
        expect(wrapper.text()).toContain('src/app.ts');
    });

    it('renders no editor when inactive (off the scroll window)', async () => {
        const { wrapper } = await mountCard(textFile, pairOf(), false);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
        // The header still renders, so the file stays in the list and reachable.
        expect(wrapper.text()).toContain('src/app.ts');
    });

    it('gates a large file and reveals the editor once Load diff is clicked', async () => {
        const { wrapper } = await mountCard(
            textFile,
            pairOf({ tooLarge: true, sizeBytes: 5_000_000 })
        );
        expect(wrapper.findComponent(LargeFileGate).exists()).toBe(true);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);

        await wrapper.findComponent(LargeFileGate).find('button').trigger('click');
        await flushPromises();

        expect(wrapper.findComponent(LargeFileGate).exists()).toBe(false);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(true);
    });

    it('shows the binary notice for a binary file', async () => {
        const { wrapper } = await mountCard(
            textFile,
            pairOf({ binary: true, oldContent: null, newContent: null })
        );
        expect(wrapper.findComponent(BinaryFileNotice).exists()).toBe(true);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
    });

    it('shows the image preview for an image file', async () => {
        const { wrapper } = await mountCard(
            textFile,
            pairOf({
                binary: true,
                image: true,
                oldContent: null,
                newContent: null,
                oldImage: 'data:,a',
                newImage: 'data:,b',
            })
        );
        expect(wrapper.findComponent(ImagePreview).exists()).toBe(true);
        expect(wrapper.findComponent(BinaryFileNotice).exists()).toBe(false);
    });

    it('collapses the body to the header when the file is marked viewed', async () => {
        const { store, wrapper } = await mountCard(textFile, pairOf());
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(true);

        const viewedButton = wrapper.findAll('button').find((b) => b.text().includes('Viewed'));
        await viewedButton!.trigger('click');
        await flushPromises();

        expect(store.isViewed('src/app.ts')).toBe(true);
        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
    });

    it('starts collapsed when the file is already viewed', async () => {
        window.api = {
            getFilePair: vi.fn<() => Promise<FilePair>>().mockResolvedValue(pairOf()),
        } as unknown as Window['api'];
        const store = useComparisonStore();
        store.base = 'main';
        store.toggleViewed('src/app.ts');

        const wrapper = mount(StackedDiffCard, { props: { file: textFile, active: true } });
        await flushPromises();

        expect(wrapper.findComponent(DiffViewer).exists()).toBe(false);
    });

    it('opens the file through the bridge when the filename is clicked', async () => {
        const openFile = vi
            .fn<(p: string) => Promise<{ ok: boolean }>>()
            .mockResolvedValue({ ok: true });
        const { wrapper } = await mountCard(textFile, pairOf(), true, { openFile });

        await wrapper.get('[title="src/app.ts"]').trigger('click');
        expect(openFile).toHaveBeenCalledWith('src/app.ts');
    });
});
