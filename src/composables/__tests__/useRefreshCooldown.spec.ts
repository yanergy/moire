import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useRefreshCooldown } from '@/composables/useRefreshCooldown';

describe('useRefreshCooldown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function setup(at: number | null) {
        const last = ref<number | null>(at);
        const scope = effectScope();
        const { coolingDown } = scope.run(() => useRefreshCooldown(() => last.value, 8000))!;
        return { last, coolingDown, scope };
    }

    it('is not cooling down before any fetch', () => {
        expect(setup(null).coolingDown.value).toBe(false);
    });

    it('cools down for a while after a fetch, then frees up on its own', () => {
        const { coolingDown, scope } = setup(Date.now());
        expect(coolingDown.value).toBe(true);

        vi.advanceTimersByTime(7999);
        expect(coolingDown.value).toBe(true);

        vi.advanceTimersByTime(1);
        expect(coolingDown.value).toBe(false);
        scope.stop();
    });

    it('restarts when new data comes in, as after a background refresh', async () => {
        const { last, coolingDown, scope } = setup(Date.now() - 60_000);
        expect(coolingDown.value).toBe(false);

        last.value = Date.now();
        await nextTick();
        expect(coolingDown.value).toBe(true);
        scope.stop();
    });
});
