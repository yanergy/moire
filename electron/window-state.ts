// Remembers the main window's size, position, and maximized state across launches
// (electron-store, via settings.ts). electron's `screen` is loaded lazily inside
// restore (a dynamic import) so the pure geometry check below stays unit-testable
// without a real display, and so importing this module never pulls in Electron.

import type { BrowserWindow } from 'electron';
import { getWindowState, setWindowState } from './settings';

const DEFAULT_SIZE = { width: 1280, height: 800 };

// px of the window that must land on a display for a saved position to be reused
const MIN_VISIBLE = 48;

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface RestoredBounds {
    width: number;
    height: number;
    x?: number;
    y?: number;
}

// Whether a saved window rect still lands on one of the given display work areas.
// A window saved on a monitor that has since been unplugged (or a display that
// shrank) would otherwise open off-screen, so the position is dropped and the OS
// centers the window instead. Pure, so it needs no real screen to test.
export function isOnScreen(bounds: Rect, workAreas: Rect[]): boolean {
    return workAreas.some((area) => {
        const overlapX =
            Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
        const overlapY =
            Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
        return overlapX >= MIN_VISIBLE && overlapY >= MIN_VISIBLE;
    });
}

// The bounds to open the window with, restored from last session. Size always
// carries over; the position only when the window would still be on-screen (else
// x/y are omitted and the OS centers it). Returns { bounds, maximized }.
export async function restoreWindowState(): Promise<{
    bounds: RestoredBounds;
    maximized: boolean;
}> {
    const saved = await getWindowState();
    if (!saved) {
        return { bounds: { ...DEFAULT_SIZE }, maximized: false };
    }

    const bounds: RestoredBounds = {
        width: saved.width ?? DEFAULT_SIZE.width,
        height: saved.height ?? DEFAULT_SIZE.height,
    };

    if (typeof saved.x === 'number' && typeof saved.y === 'number') {
        const { screen } = await import('electron');
        const workAreas = screen.getAllDisplays().map((display) => display.workArea);
        if (isOnScreen({ ...bounds, x: saved.x, y: saved.y }, workAreas)) {
            bounds.x = saved.x;
            bounds.y = saved.y;
        }
    }

    return { bounds, maximized: !!saved.maximized };
}

// Persist size/position (and maximized) as they change. getNormalBounds is the
// un-maximized rect even while maximized, so a maximized window still remembers
// the size to restore to. Debounced so a drag or resize doesn't hammer the store.
export function trackWindowState(win: BrowserWindow): void {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
        if (win.isDestroyed()) {
            return;
        }

        const { x, y, width, height } = win.getNormalBounds();
        void setWindowState({ x, y, width, height, maximized: win.isMaximized() });
    };

    const scheduleSave = () => {
        clearTimeout(timer);
        timer = setTimeout(save, 300);
    };

    win.on('resize', scheduleSave);
    win.on('move', scheduleSave);
    win.on('close', () => {
        clearTimeout(timer);
        save();
    });
}
