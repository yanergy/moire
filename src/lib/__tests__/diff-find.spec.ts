import { afterEach, describe, it, expect } from 'vitest';
import { findWidgetOffset, revealDelta, scrollParent, STICKY_HEADER_HEIGHT } from '@/lib/diff-find';

describe('scrollParent', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('finds the nearest vertically scrolling ancestor', () => {
        document.body.innerHTML =
            '<div id="outer" style="overflow-y: auto"><div><span id="leaf"></span></div></div>';
        const leaf = document.getElementById('leaf');
        expect(scrollParent(leaf)?.id).toBe('outer');
    });

    it('returns null without one', () => {
        document.body.innerHTML = '<div><span id="leaf"></span></div>';
        expect(scrollParent(document.getElementById('leaf'))).toBeNull();
        expect(scrollParent(null)).toBeNull();
    });
});

describe('findWidgetOffset', () => {
    it('stays at the top while the editor top is visible', () => {
        expect(findWidgetOffset(0, 200, 1000, 40)).toBe(0);
    });

    it('follows the scroller below the sticky header', () => {
        expect(findWidgetOffset(0, -300, 1000, 40)).toBe(300 + STICKY_HEADER_HEIGHT);
    });

    it('never leaves the editor', () => {
        expect(findWidgetOffset(0, -5000, 1000, 40)).toBe(960);
    });
});

describe('revealDelta', () => {
    it('leaves a visible line alone', () => {
        expect(revealDelta(300, 21, 0, 600)).toBe(0);
    });

    it('centers a line above or below the visible area', () => {
        const center = STICKY_HEADER_HEIGHT + (600 - STICKY_HEADER_HEIGHT) / 2;
        expect(revealDelta(1000, 21, 0, 600)).toBe(1000 - center);
        expect(revealDelta(10, 21, 0, 600)).toBe(10 - center);
    });
});
