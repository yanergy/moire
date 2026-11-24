import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';

// How long a refresh button stays disabled after data last came in, so repeated
// clicks do not fire round after round of gh / GitHub API requests.
export const REFRESH_COOLDOWN_MS = 8000;

// The cooldown behind a manual refresh button (dashboard, PR view). It runs from
// the moment the data was last fetched, whoever fetched it: a background poll
// starts it too, so a manual refresh right after one waits, while the poll itself
// never checks it. `lastRefreshedAt` reads that moment (epoch ms, or null before
// any fetch).
export function useRefreshCooldown(
    lastRefreshedAt: () => number | null,
    cooldownMs: number = REFRESH_COOLDOWN_MS
) {
    const now = ref(Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;

    const coolingDown = computed(() => {
        const at = lastRefreshedAt();
        return at !== null && now.value - at < cooldownMs;
    });

    // Re-check once the cooldown should have run out, so the button re-enables on
    // its own without polling a clock.
    watch(
        lastRefreshedAt,
        (at) => {
            clearTimeout(timer);
            now.value = Date.now();
            if (at === null) {
                return;
            }

            const remaining = at + cooldownMs - now.value;
            if (remaining > 0) {
                timer = setTimeout(() => {
                    now.value = Date.now();
                }, remaining);
            }
        },
        { immediate: true }
    );

    if (getCurrentScope()) {
        onScopeDispose(() => clearTimeout(timer));
    }

    return { coolingDown };
}
