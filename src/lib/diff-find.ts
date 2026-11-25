// Helpers for Monaco's find widget in the stacked "all files" view. There each
// diff editor is sized to its content and the page scrolls instead, so the
// editor's own reveal of a match does nothing and the widget, pinned to the
// editor's top, can sit above the visible area. These keep both in view.

// The height of the sticky per-file header that covers the top of the scroller.
export const STICKY_HEADER_HEIGHT = 36;

// The nearest ancestor that scrolls vertically, or null.
export function scrollParent(element: HTMLElement | null): HTMLElement | null {
    for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === 'auto' || overflowY === 'scroll') {
            return node;
        }
    }

    return null;
}

// How far down the editor the find widget goes so it stays just below the sticky
// header while the editor's top is scrolled out of view, clamped to the editor.
export function findWidgetOffset(
    scrollerTop: number,
    editorTop: number,
    editorHeight: number,
    widgetHeight: number
): number {
    const offset = scrollerTop + STICKY_HEADER_HEIGHT - editorTop;
    return Math.max(0, Math.min(offset, editorHeight - widgetHeight));
}

// The scroll delta that centers a line (its top at `lineTop`, viewport coords) in
// the scroller, or 0 when the line is already comfortably in view.
export function revealDelta(
    lineTop: number,
    lineHeight: number,
    scrollerTop: number,
    scrollerHeight: number
): number {
    const visibleTop = scrollerTop + STICKY_HEADER_HEIGHT;
    const visibleBottom = scrollerTop + scrollerHeight;
    if (lineTop >= visibleTop && lineTop + lineHeight <= visibleBottom) {
        return 0;
    }

    return lineTop - (visibleTop + (visibleBottom - visibleTop) / 2);
}
