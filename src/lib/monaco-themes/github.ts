import type { CodeStyleTheme } from './types';

// The GitHub-flavored diff palette (the default code style), matching github.com.
//
// Dark overrides the editor surface to GitHub's near-black canvas (#0d1117): the
// line backgrounds are GitHub's semi-transparent green (#2ea043) and red (#f85149)
// tuned to composite over that canvas (the inserted line renders as #12261e). Over
// Moiré's lighter --moire-code grey they read too bright, so the canvas override is
// what makes them land. This is the one place a code style departs from the shared
// --moire-* surface tokens.
//
// The *text* backgrounds (the word-level highlight) are kept deliberately faint.
// GitHub reserves its strong highlight for the changed words inside a modified
// line, but Monaco paints insertedTextBackground/removedTextBackground across the
// full width of every added/removed line, whole new lines included. A strong value
// there (GitHub's own word color) turns entire added blocks into a saturated slab
// that looks nothing like GitHub. Keeping it near the line background lets full
// lines stay subtle while a modified line's changed words still pick up a little
// extra from the stacking. Values here were tuned against github.com side by side.
export const github: CodeStyleTheme = {
    dark: {
        // GitHub's canvas, replacing the shared dark surface for this style.
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editorGutter.background': '#0d1117',
        'editorLineNumber.foreground': '#6e7681',
        'editorLineNumber.activeForeground': '#c9d1d9',
        'editorWidget.background': '#161b22',
        'editorWidget.border': '#30363d',
        // GitHub's diff overlays, composited over the canvas above.
        'diffEditor.insertedLineBackground': '#2ea04326',
        'diffEditor.removedLineBackground': '#f8514926',
        'diffEditor.insertedTextBackground': '#2ea04326',
        'diffEditor.removedTextBackground': '#f851491a',
        'diffEditor.unchangedRegionBackground': '#388bfd1a',
        'diffEditor.unchangedRegionForeground': '#58a6ff',
        'diffEditorGutter.insertedLineBackground': '#2ea04340',
        'diffEditorGutter.removedLineBackground': '#f8514940',
        'diffEditorOverview.insertedForeground': '#3fb950cc',
        'diffEditorOverview.removedForeground': '#f85149cc',
    },
    light: {
        'diffEditor.insertedLineBackground': '#e6ffec',
        'diffEditor.removedLineBackground': '#ffebe9',
        // Semi-transparent so full added/removed lines stay pale (they composite to
        // roughly the line color) while intraline words gain a touch more.
        'diffEditor.insertedTextBackground': '#2da44e33',
        'diffEditor.removedTextBackground': '#cf222e26',
        'diffEditor.unchangedRegionBackground': '#ddf4ff',
        'diffEditor.unchangedRegionForeground': '#0969da',
        'diffEditorGutter.insertedLineBackground': '#ccffd8',
        'diffEditorGutter.removedLineBackground': '#ffd7d5',
        'diffEditorOverview.insertedForeground': '#2da44ecc',
        'diffEditorOverview.removedForeground': '#cf222ecc',
    },
};
