import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
    it('joins truthy class values and drops falsy ones', () => {
        expect(cn('a', false, undefined, null, 'b')).toBe('a b');
    });

    it('merges conflicting tailwind utilities so the last one wins', () => {
        expect(cn('px-2', 'px-4')).toBe('px-4');
        expect(cn('text-moire-fg', 'text-moire-muted')).toBe('text-moire-muted');
    });

    it('accepts arrays and conditional objects', () => {
        expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
    });
});
