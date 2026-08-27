<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { useUiStore } from '@/stores/ui';
import { useComparisonStore } from '@/stores/comparison';

const ui = useUiStore();
const comparison = useComparisonStore();
</script>

<template>
    <div
        class="flex h-9 flex-none items-center gap-3.5 border-b border-dv-border bg-dv-chrome px-3.5"
    >
        <div class="flex gap-2">
            <span class="size-3 rounded-full bg-dv-tl-red" />
            <span class="size-3 rounded-full bg-dv-tl-yellow" />
            <span class="size-3 rounded-full bg-dv-tl-green" />
        </div>

        <div class="flex-1 truncate text-center text-xs text-dv-muted">
            diff-viewer — <span class="font-medium text-dv-fg">{{ comparison.repoName }}</span>
        </div>

        <button
            type="button"
            title="Toggle theme"
            class="flex h-[22px] w-7 items-center justify-center rounded-md text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
            @click="ui.toggleTheme()"
        >
            <sun v-if="ui.isDark" :size="16" />
            <moon v-else :size="16" />
        </button>
    </div>
</template>
