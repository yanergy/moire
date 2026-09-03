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
// The diff colors below were read off github.com's own rendered diff. The one
// deliberate departure is the word-level (text) background, kept faint rather than
// GitHub's value; see the note at those keys for why Monaco forces that trade-off.
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
        // GitHub's diff overlays, composited over the canvas above. Line and gutter
        // values were read directly off github.com's dark diff (getComputedStyle):
        // the line cell is #2ea043 at 15% added / #f85149 at 10% removed, the
        // line-number gutter #3fb950 / #f85149 at 30%. The word (text) backgrounds
        // are GitHub's #2ea043 / #f85149 too but kept at a low 8%: Monaco paints
        // them across whole added/removed lines (not just the changed words as
        // GitHub does), so GitHub's own 40% word color would over-saturate full
        // lines. 8% keeps full lines near GitHub's line color while a modified
        // line's changed words still pick up a touch from the stacking.
        'diffEditor.insertedLineBackground': '#2ea04326',
        'diffEditor.removedLineBackground': '#f851491a',
        'diffEditor.insertedTextBackground': '#2ea04314',
        'diffEditor.removedTextBackground': '#f8514914',
        'diffEditor.unchangedRegionBackground': '#388bfd1a',
        'diffEditor.unchangedRegionForeground': '#58a6ff',
        'diffEditorGutter.insertedLineBackground': '#3fb9504d',
        'diffEditorGutter.removedLineBackground': '#f851494d',
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
