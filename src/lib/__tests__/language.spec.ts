import { describe, it, expect } from 'vitest';
import { inferLanguage, languageLabel } from '@/lib/language';

describe('inferLanguage', () => {
    it('maps common extensions to Monaco language ids', () => {
        expect(inferLanguage('electron/git/parsers.ts')).toBe('typescript');
        expect(inferLanguage('src/components/DiffPane.vue')).toBe('html');
        expect(inferLanguage('src/assets/base.scss')).toBe('scss');
        expect(inferLanguage('package.json')).toBe('json');
        expect(inferLanguage('README.md')).toBe('markdown');
    });

    it('is case-insensitive on the extension', () => {
        expect(inferLanguage('Foo.TS')).toBe('typescript');
    });

    it('falls back to plaintext for unknown or extensionless paths', () => {
        expect(inferLanguage('Makefile')).toBe('plaintext');
        expect(inferLanguage('data.xyz')).toBe('plaintext');
    });
});

describe('languageLabel', () => {
    it('returns friendly labels for known ids', () => {
        expect(languageLabel('typescript')).toBe('TypeScript');
        expect(languageLabel('json')).toBe('JSON');
    });

    it('returns the id unchanged when unmapped', () => {
        expect(languageLabel('rust')).toBe('rust');
    });
});
