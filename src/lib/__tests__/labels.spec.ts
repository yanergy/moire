import { describe, it, expect } from 'vitest';
import { labelStyle } from '@/lib/labels';

describe('labelStyle', () => {
    it('tints the fill and border and lightens the text from the label color', () => {
        expect(labelStyle('0a1428')).toEqual({
            backgroundColor: 'rgba(10, 20, 40, 0.14)',
            borderColor: 'rgba(10, 20, 40, 0.45)',
            color: 'rgb(55, 65, 85)',
        });
    });

    it('caps the lightened text below white', () => {
        expect(labelStyle('ffffff').color).toBe('rgb(235, 235, 235)');
    });

    it('falls back to grey for a malformed color', () => {
        expect(labelStyle('#zz').borderColor).toBe('rgba(136, 136, 136, 0.45)');
    });
});
