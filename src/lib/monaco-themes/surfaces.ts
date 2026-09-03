import type { MonacoColors } from './types';

// Surface (non-diff) editor colors, shared by every code style so switching styles
// changes only the added/removed diff palette. They track the --moire-* tokens in
// base.css (e.g. editor.background is --moire-code) and must be kept consistent
// with them by hand.

export const DARK_SURFACE: MonacoColors = {
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
};

export const LIGHT_SURFACE: MonacoColors = {
    'editor.background': '#fffffe',
    'editor.foreground': '#24292f',
    'editorGutter.background': '#fffffe',
    'editorLineNumber.foreground': '#9599a1',
    'editorOverviewRuler.border': '#00000000',
};
