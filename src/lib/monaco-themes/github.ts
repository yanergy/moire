import type { CodeStyleTheme } from './types';

// The GitHub-flavored diff palette (the default code style), matching github.com.
//
// Dark overrides the editor surface to GitHub's dark canvas (#101216) so the diff
// colors below can be GitHub's exact opaque values, read off github.com's rendered
// dark diff. Being opaque, they render exactly as given, independent of the surface,
// with no compositing involved. This is the one place a code style departs from the
// shared --moire-* surface tokens.
//
// The word-level (text) backgrounds are intentionally transparent; see the note at
// those keys for why Monaco forces that trade-off.
export const github: CodeStyleTheme = {
    dark: {
        // GitHub's dark surface: #101216 is its unchanged-row background, #eef5fb
        // its text. This replaces the shared dark surface for this style.
        'editor.background': '#101216',
        'editor.foreground': '#eef5fb',
        'editorGutter.background': '#101216',
        'editorLineNumber.foreground': '#9198a1',
        'editorLineNumber.activeForeground': '#eef5fb',
        'editorWidget.background': '#151a1f',
        'editorWidget.border': '#3d444d',
        // Exact opaque diff colors from github.com's dark diff: the added row
        // (#15221c) and removed row (#20181a), and their line-number gutters
        // (#203a26 / #472323). Opaque, so they render exactly as given.
        //
        // GitHub's word-level highlights (#254b2b added / #682d2a removed) are left
        // transparent here on purpose. GitHub paints that highlight only on the
        // changed words inside a modified line, but Monaco paints
        // insertedTextBackground/removedTextBackground across the full width of every
        // added/removed line. Using GitHub's word color would re-saturate whole added
        // blocks (the exact problem this replaces), so full lines instead stay
        // exactly on the row color, at the cost of the intraline word emphasis.
        'diffEditor.insertedLineBackground': '#15221c',
        'diffEditor.removedLineBackground': '#20181a',
        'diffEditor.insertedTextBackground': '#00000000',
        'diffEditor.removedTextBackground': '#00000000',
        // GitHub shows plain empty space on the counterpart side of an added or
        // removed block; Monaco fills it with a diagonal hatch by default. Transparent
        // removes the hatch to match GitHub.
        'diffEditor.diagonalFill': '#00000000',
        'diffEditor.unchangedRegionBackground': '#388bfd1a',
        'diffEditor.unchangedRegionForeground': '#58a6ff',
        'diffEditorGutter.insertedLineBackground': '#203a26',
        'diffEditorGutter.removedLineBackground': '#472323',
        'diffEditorOverview.insertedForeground': '#2ea043cc',
        'diffEditorOverview.removedForeground': '#f85149cc',
    },
    light: {
        // GitHub's light surface: white canvas, #1d2023 text.
        'editor.background': '#ffffff',
        'editor.foreground': '#1d2023',
        'editorGutter.background': '#ffffff',
        // Exact opaque diff colors from github.com's light diff: added row #daf8df,
        // removed row #fde9e6, line-number gutters #ade8b7 / #f9cac5. As in dark, the
        // word (text) backgrounds are left transparent and the changed-word highlight
        // is drawn by DiffViewer (--moire-word-* tokens) so it lands only on the
        // changed words, not whole added/removed lines.
        'diffEditor.insertedLineBackground': '#daf8df',
        'diffEditor.removedLineBackground': '#fde9e6',
        'diffEditor.insertedTextBackground': '#00000000',
        'diffEditor.removedTextBackground': '#00000000',
        // No diagonal hatch on the counterpart side, matching GitHub (see dark note).
        'diffEditor.diagonalFill': '#00000000',
        'diffEditor.unchangedRegionBackground': '#ddf4ff',
        'diffEditor.unchangedRegionForeground': '#0969da',
        'diffEditorGutter.insertedLineBackground': '#ade8b7',
        'diffEditorGutter.removedLineBackground': '#f9cac5',
        'diffEditorOverview.insertedForeground': '#2da44ecc',
        'diffEditorOverview.removedForeground': '#cf222ecc',
    },
};
