<script setup lang="ts">
import { computed } from 'vue';
import { TriangleAlert, X } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { Button } from '@/components/ui/button';

const comparison = useComparisonStore();

// A remembered base or head can be deleted between sessions; on reopen the store
// drops it from the selection and lists it here. The notice names what vanished
// so the empty ref selector does not read as a bug.
const message = computed(() => {
    const names = comparison.disappearedBranches;
    if (names.length === 0) {
        return '';
    }

    const quoted = names.map((name) => `“${name}”`);
    const list =
        quoted.length === 1
            ? quoted[0]
            : quoted.slice(0, -1).join(', ') + ' and ' + quoted[quoted.length - 1];
    const noun = names.length === 1 ? 'Branch' : 'Branches';
    const verb = names.length === 1 ? 'has' : 'have';
    return `${noun} ${list} ${verb} disappeared since last time.`;
});
</script>

<template>
    <div
        v-if="comparison.disappearedBranches.length > 0"
        class="flex h-8 flex-none items-center gap-2 border-b border-moire-border bg-moire-app px-3 text-xs text-moire-muted"
    >
        <TriangleAlert :size="14" class="shrink-0 text-moire-status-d" />
        <span class="flex-1 truncate">{{ message }}</span>
        <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            class="text-moire-faint hover:bg-moire-hover hover:text-moire-fg"
            @click="comparison.dismissMissingBranches()"
        >
            <X :size="14" />
        </Button>
    </div>
</template>
