import { describe, it, expect } from 'vitest';
import { languageLabel } from '@/lib/language';

describe('languageLabel', () => {
    it('returns friendly labels for known ids', () => {
        expect(languageLabel('typescript')).toBe('TypeScript');
        expect(languageLabel('json')).toBe('JSON');
        expect(languageLabel('php')).toBe('PHP');
        expect(languageLabel('xml')).toBe('XML');
        expect(languageLabel('ini')).toBe('INI');
        expect(languageLabel('dockerfile')).toBe('Dockerfile');
    });

    it('returns the id unchanged when unmapped', () => {
        expect(languageLabel('rust')).toBe('rust');
    });
});
