import { describe, it, expect } from 'vitest';
import { mockFilePair } from '@/lib/mock';

describe('mockFilePair', () => {
    it('builds a modified pair with both sides and inferred language', () => {
        const pair = mockFilePair('electron/git/parsers.ts');
        expect(pair.language).toBe('typescript');
        expect(pair.oldContent).toContain("['A', 'M', 'D']");
        expect(pair.newContent).toContain("['A', 'M', 'D', 'R']");
        expect(pair.binary).toBe(false);
        expect(pair.tooLarge).toBe(false);
    });

    it('has null old content for an added file', () => {
        const pair = mockFilePair('electron/watcher/RepoWatcher.ts');
        expect(pair.oldContent).toBeNull();
        expect(pair.newContent).not.toBeNull();
    });

    it('has null new content for a deleted file', () => {
        const pair = mockFilePair('src/components/LegacyDiff.vue');
        expect(pair.newContent).toBeNull();
        expect(pair.oldContent).not.toBeNull();
        expect(pair.language).toBe('html');
    });

    it('returns an empty pair for an unknown path', () => {
        const pair = mockFilePair('does/not/exist.ts');
        expect(pair.path).toBe('does/not/exist.ts');
        expect(pair.oldContent).toBe('');
        expect(pair.newContent).toBe('');
    });
});
