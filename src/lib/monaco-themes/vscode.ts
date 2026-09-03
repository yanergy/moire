import type { CodeStyleTheme } from './types';

// The VS Code-flavored diff palette: the editor's original colors, kept as the
// alternative to the GitHub style.
export const vscode: CodeStyleTheme = {
    dark: {
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
    light: {
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
