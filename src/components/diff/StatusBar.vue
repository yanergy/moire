<script setup lang="ts">
import { computed } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { languageLabel } from '@/lib/language';

const comparison = useComparisonStore();

const langLabel = computed(() => languageLabel(comparison.selectedPair.language));
</script>

<template>
    <div
        class="flex h-[26px] flex-none items-center gap-3.5 border-t border-dv-border bg-dv-chrome px-3.5 text-[11px] text-dv-muted"
    >
        <span class="whitespace-nowrap">{{ comparison.fileCount }} files changed</span>
        <span class="whitespace-nowrap text-dv-add-fg">+{{ comparison.totalAdditions }}</span>
        <span class="whitespace-nowrap text-dv-del-fg">−{{ comparison.totalDeletions }}</span>

        <div class="flex-1" />

        <span class="whitespace-nowrap text-dv-faint">{{ langLabel }} · UTF-8 · LF</span>
        <span class="flex items-center gap-1.5 whitespace-nowrap">
            <span class="size-1.5 rounded-full bg-dv-add-fg" />
            watching .git/refs · synced 4s ago
        </span>
    </div>
</template>
