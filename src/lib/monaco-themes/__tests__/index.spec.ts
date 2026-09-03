import { describe, it, expect, vi } from 'vitest';
import { monacoThemeFor, defineMonacoThemes } from '../index';
// Resolves to the Monaco stub via the vitest alias, the same instance the module
// under test uses, so defineTheme calls are observable here.
import * as monaco from '@/lib/monaco';

describe('monacoThemeFor', () => {
    it('maps the dark flag and code style to the named theme', () => {
        expect(monacoThemeFor(true, 'github')).toBe('moire-github-dark');
        expect(monacoThemeFor(false, 'github')).toBe('moire-github-light');
        expect(monacoThemeFor(true, 'vscode')).toBe('moire-vscode-dark');
        expect(monacoThemeFor(false, 'vscode')).toBe('moire-vscode-light');
    });
});

describe('defineMonacoThemes', () => {
    // One test does the work: defineMonacoThemes registers once and no-ops after
    // (a module-level guard), so a second describe could not observe fresh calls.
    it('registers every combination once and merges each palette with the shared surface', () => {
        const defineTheme = vi.mocked(monaco.editor.defineTheme);
        defineTheme.mockClear();

        defineMonacoThemes();
        defineMonacoThemes(); // second call is a no-op

        const registered = Object.fromEntries(defineTheme.mock.calls) as Record<
            string,
            monaco.editor.IStandaloneThemeData
        >;

        expect(Object.keys(registered)).toEqual([
            'moire-github-dark',
            'moire-github-light',
            'moire-vscode-dark',
            'moire-vscode-light',
        ]);

        // Dark themes extend vs-dark, light themes extend vs.
        expect(registered['moire-github-dark']!.base).toBe('vs-dark');
        expect(registered['moire-github-light']!.base).toBe('vs');

        // The shared surface is the default (VS Code keeps it), while a style may
        // override surface keys: GitHub dark swaps in GitHub's near-black canvas.
        expect(registered['moire-vscode-dark']!.colors!['editor.background']).toBe('#1f1f22');
        expect(registered['moire-github-dark']!.colors!['editor.background']).toBe('#101216');

        // Each code style contributes its own diff colors.
        expect(registered['moire-github-light']!.colors!['diffEditor.insertedLineBackground']).toBe(
            '#e6ffec'
        );
        expect(registered['moire-vscode-light']!.colors!['diffEditor.insertedLineBackground']).toBe(
            '#9bb95538'
        );
    });
});
