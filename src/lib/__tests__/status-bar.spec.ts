import { describe, it, expect } from 'vitest';
import { detectEol, timeSince } from '@/lib/status-bar';

describe('detectEol', () => {
    it('reports LF for Unix line endings', () => {
        expect(detectEol('a\nb\nc\n')).toBe('LF');
    });

    it('reports CRLF for Windows line endings', () => {
        expect(detectEol('a\r\nb\r\n')).toBe('CRLF');
    });

    it('reports Mixed when both styles occur', () => {
        expect(detectEol('a\r\nb\nc')).toBe('Mixed');
    });

    it('returns empty for content with no newline, empty content, or withheld text', () => {
        expect(detectEol('single line')).toBe('');
        expect(detectEol('')).toBe('');
        expect(detectEol(null)).toBe('');
    });
});

describe('timeSince', () => {
    const base = 1_000_000_000_000;

    it('reads as "just now" within five seconds (and for a future timestamp)', () => {
        expect(timeSince(base, base)).toBe('just now');
        expect(timeSince(base, base + 4_000)).toBe('just now');
        expect(timeSince(base, base - 5_000)).toBe('just now');
    });

    it('coarsens from seconds to days as it ages', () => {
        expect(timeSince(base, base + 30_000)).toBe('30s ago');
        expect(timeSince(base, base + 5 * 60_000)).toBe('5m ago');
        expect(timeSince(base, base + 3 * 3_600_000)).toBe('3h ago');
        expect(timeSince(base, base + 2 * 86_400_000)).toBe('2d ago');
    });
});
