<script setup lang="ts">
import { ArrowRightLeft, RefreshCw } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { CompareMode, ViewMode } from '@/shared/types';
import RefSelector from '@/components/RefSelector.vue';
import SegmentedToggle from '@/components/SegmentedToggle.vue';

const comparison = useComparisonStore();
const ui = useUiStore();

const compareOptions: { value: CompareMode; label: string }[] = [
    { value: 'merge-base', label: 'merge-base' },
    { value: 'direct', label: 'direct' },
];

const viewOptions: { value: ViewMode; label: string }[] = [
    { value: 'split', label: 'split' },
    { value: 'unified', label: 'unified' },
];
</script>

<template>
    <div class="flex h-13 flex-none items-center gap-2 border-b border-dv-border bg-dv-app px-3">
        <button
            type="button"
            class="flex h-8 items-center gap-2 rounded-md border border-dv-border px-3 text-[13px] font-medium whitespace-nowrap text-dv-fg hover:bg-dv-hover"
        >
            <span class="size-1.5 rounded-sm bg-dv-accent" />
            {{ comparison.repoName }}
            <span class="text-[9px] text-dv-faint">▾</span>
        </button>

        <div class="mx-1 h-5 w-px bg-dv-border" />

        <div class="flex items-center gap-1.5">
            <ref-selector side="base" />
            <button
                type="button"
                title="Swap base and head"
                class="flex size-7 items-center justify-center rounded-md text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                @click="comparison.swap()"
            >
                <arrow-right-left :size="16" />
            </button>
            <ref-selector side="head" />
        </div>

        <div class="flex-1" />

        <segmented-toggle
            :options="compareOptions"
            :model-value="comparison.compareMode"
            @update:model-value="comparison.setCompareMode"
        />

        <segmented-toggle
            :options="viewOptions"
            :model-value="ui.viewMode"
            @update:model-value="ui.setViewMode"
        />

        <button
            type="button"
            title="Refresh"
            class="flex size-8 items-center justify-center rounded-md border border-dv-border text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
        >
            <refresh-cw :size="16" />
        </button>
    </div>
</template>
