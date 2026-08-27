import { describe, it, expect } from 'vitest';
import { windowTitle } from '@/lib/window-title';

describe('windowTitle', () => {
    it('appends the open repository to the app name', () => {
        expect(windowTitle('moire')).toBe('Moiré — moire');
    });

    it('is just the app name when no repo is open', () => {
        expect(windowTitle('')).toBe('Moiré');
    });
});
