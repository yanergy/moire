import { describe, it, expect } from 'vitest';
import { formatValue } from '../electron/logger.cjs';

describe('logger formatValue', () => {
    it('keeps an Error stack, the useful part', () => {
        const error = new Error('boom');
        expect(formatValue(error)).toBe(error.stack);
        expect(formatValue(error)).toContain('boom');
    });

    it('passes a string through unchanged', () => {
        expect(formatValue('plain message')).toBe('plain message');
    });

    it('JSON-encodes a non-error object so it still reads', () => {
        expect(formatValue({ code: 128, ref: 'nope' })).toBe('{"code":128,"ref":"nope"}');
    });

    it('falls back to String for an unserializable value', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(formatValue(circular)).toBe('[object Object]');
    });
});
