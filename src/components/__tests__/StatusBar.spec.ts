import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusBar from '@/components/diff/StatusBar.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { ChangedFile, FilePair } from '@/shared/types';

const CHANGED: ChangedFile[] = [
    { path: 'src/app.ts', status: 'M', additions: 3, deletions: 1, binary: false },
    { path: 'src/lib/util.ts', status: 'A', additions: 12, deletions: 0, binary: false },
];

const crlfPair: FilePair = {
    path: 'src/app.ts',
    oldContent: 'a\r\n',
    newContent: 'a\r\nb\r\n',
    language: 'typescript',
    binary: false,
    tooLarge: false,
    sizeBytes: 0,
};

describe('StatusBar', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('shows real counts, the language, the detected line ending, and live sync state', () => {
        const store = useComparisonStore();
        store.files = CHANGED;
        store.selectedPair = { ...crlfPair };
        store.repoPath = '/repos/moire';
        store.lastSyncedAt = Date.now();

        const text = mount(StatusBar).text();
        expect(text).toContain('2 files changed');
        expect(text).toContain('+15');
        expect(text).toContain('−1');
        // Language, encoding, and the line ending detected from the file's own
        // content (not hardcoded) sit together.
        expect(text).toContain('TypeScript · UTF-8 · CRLF');
        expect(text).toContain('Watching for changes');
        expect(text).toContain('synced');
    });

    it('omits the line ending for a binary file whose text is withheld', () => {
        const store = useComparisonStore();
        store.repoPath = '/repos/moire';
        store.selectedPair = {
            path: 'logo.png',
            oldContent: null,
            newContent: null,
            language: 'plaintext',
            binary: true,
            tooLarge: false,
            sizeBytes: 4096,
        };

        const text = mount(StatusBar).text();
        expect(text).not.toContain('CRLF');
        expect(text).not.toContain('LF');
        // A binary file has no text encoding or line ending to report.
        expect(text).not.toContain('UTF-8');
    });

    it('hides the language and watching readout when no repo is open', () => {
        const text = mount(StatusBar).text();
        expect(text).toContain('0 files changed');
        expect(text).not.toContain('Watching for changes');
        // The empty placeholder pair carries no path, so no language is claimed.
        expect(text).not.toContain('Plain Text');
    });
});
