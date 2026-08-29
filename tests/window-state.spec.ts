import { describe, it, expect } from 'vitest';
import { isOnScreen } from '../electron/window-state';

// A typical primary display work area (top bar / taskbar already excluded).
const primary = { x: 0, y: 0, width: 1920, height: 1080 };

describe('window-state isOnScreen', () => {
    it('accepts a window sitting fully on a display', () => {
        expect(isOnScreen({ x: 100, y: 100, width: 1280, height: 800 }, [primary])).toBe(true);
    });

    it('rejects a window fully off every display', () => {
        expect(isOnScreen({ x: 5000, y: 5000, width: 1280, height: 800 }, [primary])).toBe(false);
    });

    it('accepts a window still partly on-screen past the visibility threshold', () => {
        // ~100px of width remains on the display (x 1820..1920).
        expect(isOnScreen({ x: 1820, y: 100, width: 1280, height: 800 }, [primary])).toBe(true);
    });

    it('rejects a window with too little left on-screen', () => {
        // Only ~10px visible, under MIN_VISIBLE.
        expect(isOnScreen({ x: 1910, y: 100, width: 1280, height: 800 }, [primary])).toBe(false);
    });

    it('accepts a window on a secondary display', () => {
        const secondary = { x: 1920, y: 0, width: 1920, height: 1080 };
        expect(
            isOnScreen({ x: 2000, y: 100, width: 1280, height: 800 }, [primary, secondary])
        ).toBe(true);
    });

    it('accepts a display positioned to the left with a negative origin', () => {
        const left = { x: -1920, y: 0, width: 1920, height: 1080 };
        expect(isOnScreen({ x: -1800, y: 100, width: 1280, height: 800 }, [left])).toBe(true);
    });
});
