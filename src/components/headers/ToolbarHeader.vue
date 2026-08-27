<script setup lang="ts">
import { ArrowRightLeft, Moon, RefreshCw, Sun } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { CompareMode, ViewMode } from '@/shared/types';
import RefSelector from '@/components/controls/RefSelector.vue';
import RepoPicker from '@/components/controls/RepoPicker.vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    <TooltipProvider :delay-duration="300">
        <div
            class="flex h-13 flex-none items-center gap-2 border-b border-dv-border bg-dv-app px-3"
        >
            <repo-picker />

            <div class="mx-1 h-5 w-px bg-dv-border" />

            <div class="flex items-center gap-1.5">
                <ref-selector side="base" />
                <Tooltip>
                    <TooltipTrigger as-child>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            class="size-7 text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                            @click="comparison.swap()"
                        >
                            <ArrowRightLeft :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Swap base and head</TooltipContent>
                </Tooltip>
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

            <Tooltip>
                <TooltipTrigger as-child>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        class="border-dv-border text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                    >
                        <RefreshCw :size="16" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger as-child>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Toggle theme"
                        class="size-7 text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                        @click="ui.toggleTheme()"
                    >
                        <Sun v-if="ui.isDark" :size="16" />
                        <Moon v-else :size="16" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
</template>
