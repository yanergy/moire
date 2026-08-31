import { describe, it, expect } from 'vitest';
import { repoLabel } from '@/lib/repo-path';

describe('repoLabel', () => {
    it('returns the final segment of a POSIX path', () => {
        expect(repoLabel('/Users/me/repos/moire')).toBe('moire');
    });

    it('returns the final segment of a Windows path', () => {
        expect(repoLabel('C:\\Users\\me\\proj')).toBe('proj');
    });

    it('ignores a trailing separator', () => {
        expect(repoLabel('/Users/me/repos/moire/')).toBe('moire');
    });

    it('returns a single segment unchanged', () => {
        expect(repoLabel('moire')).toBe('moire');
    });

    it('falls back to the input when there are no segments', () => {
        expect(repoLabel('')).toBe('');
        expect(repoLabel('/')).toBe('/');
    });
});
