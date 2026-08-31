import { describe, it, expect, vi } from 'vitest';
import { monacoThemeFor, defineMonacoThemes } from '@/lib/monaco-theme';
// Resolves to the Monaco stub via the vitest alias, the same instance the module
// under test uses, so defineTheme calls are observable here.
import * as monaco from '@/lib/monaco';

describe('monacoThemeFor', () => {
    it('maps the dark flag to the named theme', () => {
        expect(monacoThemeFor(true)).toBe('moire-dark');
        expect(monacoThemeFor(false)).toBe('moire-light');
    });
});

describe('defineMonacoThemes', () => {
    it('registers both themes once, then no-ops on repeat calls', () => {
        const defineTheme = vi.mocked(monaco.editor.defineTheme);
        defineTheme.mockClear();

        defineMonacoThemes();
        defineMonacoThemes();

        expect(defineTheme).toHaveBeenCalledTimes(2);
        expect(defineTheme).toHaveBeenCalledWith(
            'moire-dark',
            expect.objectContaining({ base: 'vs-dark' })
        );
        expect(defineTheme).toHaveBeenCalledWith(
            'moire-light',
            expect.objectContaining({ base: 'vs' })
        );
    });
});
