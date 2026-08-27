import * as monaco from 'monaco-editor';

// Two Monaco themes tuned to the app palette so the editor doesn't clash with
// the surrounding chrome. Both inherit token colors from Monaco's stock
// vs-dark / vs themes (which already match the design's syntax palette) and
// override only the surface, gutter, and diff-overlay colors.
//
// Monaco color values must be hex (#RRGGBB or #RRGGBBAA); the design's rgba
// diff colors are converted to hex8 here. This module is the editor's palette
// source, mirroring the --moire-* tokens in base.css.

const DARK: monaco.editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
        'editor.background': '#1f1f22',
        'editor.foreground': '#d4d4d8',
        'editorGutter.background': '#1f1f22',
        'editorLineNumber.foreground': '#6e7681',
        'editorLineNumber.activeForeground': '#a1a1aa',
        'editorIndentGuide.background1': '#ffffff10',
        'editorOverviewRuler.border': '#00000000',
        'editorWidget.background': '#18181b',
        'editorWidget.border': '#27272a',
        'scrollbarSlider.background': '#79797966',
        'scrollbarSlider.hoverBackground': '#797979a6',
        'diffEditor.insertedLineBackground': '#9bb95533',
        'diffEditor.removedLineBackground': '#ff00002e',
        'diffEditor.insertedTextBackground': '#9bb9556b',
        'diffEditor.removedTextBackground': '#ff000061',
        'diffEditor.unchangedRegionBackground': '#4078be1a',
        'diffEditor.unchangedRegionForeground': '#6e9cd2',
        'diffEditorGutter.insertedLineBackground': '#9bb95547',
        'diffEditorGutter.removedLineBackground': '#ff00003d',
        'diffEditorOverview.insertedForeground': '#78aa50cc',
        'diffEditorOverview.removedForeground': '#c84646cc',
    },
};

const LIGHT: monaco.editor.IStandaloneThemeData = {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
        'editor.background': '#fffffe',
        'editor.foreground': '#24292f',
        'editorGutter.background': '#fffffe',
        'editorLineNumber.foreground': '#9599a1',
        'editorOverviewRuler.border': '#00000000',
        'diffEditor.insertedLineBackground': '#9bb95538',
        'diffEditor.removedLineBackground': '#ff00001a',
        'diffEditor.insertedTextBackground': '#78b45a73',
        'diffEditor.removedTextBackground': '#ff3c3c42',
        'diffEditor.unchangedRegionBackground': '#4078be17',
        'diffEditor.unchangedRegionForeground': '#3b6ba5',
        'diffEditorGutter.insertedLineBackground': '#9bb9554d',
        'diffEditorGutter.removedLineBackground': '#ff000029',
        'diffEditorOverview.insertedForeground': '#3f8f4fcc',
        'diffEditorOverview.removedForeground': '#b03a3acc',
    },
};

let defined = false;

export function defineMonacoThemes() {
    if (defined) {
        return;
    }

    defined = true;
    monaco.editor.defineTheme('moire-dark', DARK);
    monaco.editor.defineTheme('moire-light', LIGHT);
}

export function monacoThemeFor(isDark: boolean): string {
    return isDark ? 'moire-dark' : 'moire-light';
}
