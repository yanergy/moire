import * as monaco from '@/lib/monaco';
import type { CodeStyle } from '@/shared/types';
import { DARK_SURFACE, LIGHT_SURFACE } from './surfaces';
import { github } from './github';
import { vscode } from './vscode';
import type { CodeStyleTheme, MonacoColors } from './types';

// Monaco themes tuned to the app palette so the editor doesn't clash with the
// surrounding chrome. Each theme inherits token (syntax) colors from Monaco's stock
// vs-dark / vs themes and overrides only the surface and diff-overlay colors.
//
// Two axes: dark vs. light (follows the app theme) and the code style picked in the
// View → Code Style menu. Each code style lives in its own file in this folder as a
// plain color-key → hex map and layers over the shared surface (surfaces.ts): a
// style normally contributes just its diff palette, but may override surface keys
// too (the GitHub style overrides the dark canvas). This module merges a style over
// its surface and registers the result, so adding a style is one new data file plus
// an entry in STYLES.

const STYLES: Record<CodeStyle, CodeStyleTheme> = { github, vscode };

// Merge a surface with a diff palette into the props defineTheme expects. `rules`
// stays empty so syntax tokens keep inheriting from the stock base theme.
function toThemeData(
    base: 'vs' | 'vs-dark',
    surface: MonacoColors,
    diff: MonacoColors
): monaco.editor.IStandaloneThemeData {
    return { base, inherit: true, rules: [], colors: { ...surface, ...diff } };
}

// Registered theme name -> its data, keyed by the name monacoThemeFor resolves to.
const THEMES: Record<string, monaco.editor.IStandaloneThemeData> = {};
for (const style of Object.keys(STYLES) as CodeStyle[]) {
    const palette = STYLES[style];
    THEMES[`moire-${style}-dark`] = toThemeData('vs-dark', DARK_SURFACE, palette.dark);
    THEMES[`moire-${style}-light`] = toThemeData('vs', LIGHT_SURFACE, palette.light);
}

let defined = false;

export function defineMonacoThemes() {
    if (defined) {
        return;
    }

    defined = true;
    for (const [name, data] of Object.entries(THEMES)) {
        monaco.editor.defineTheme(name, data);
    }
}

export function monacoThemeFor(isDark: boolean, codeStyle: CodeStyle): string {
    return `moire-${codeStyle}-${isDark ? 'dark' : 'light'}`;
}
