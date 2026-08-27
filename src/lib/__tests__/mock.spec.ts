import { describe, it, expect } from 'vitest';
import { MOCK_BRANCHES, MOCK_FILES, mockFilePair } from '@/lib/mock';

describe('mock dataset', () => {
    it('exposes the changed files and branches from the prototype', () => {
        expect(MOCK_FILES).toHaveLength(10);
        expect(MOCK_BRANCHES.some((b) => b.name === 'main' && b.kind === 'local')).toBe(true);
        expect(MOCK_BRANCHES.some((b) => b.kind === 'remote')).toBe(true);
    });
});

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
