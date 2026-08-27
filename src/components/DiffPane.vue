<script setup lang="ts">
import { ref } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import MonacoDiff from '@/components/MonacoDiff.vue';
import SelectionBanner from '@/components/SelectionBanner.vue';
import StatusBar from '@/components/StatusBar.vue';

const comparison = useComparisonStore();
const ui = useUiStore();

const diffRef = ref<InstanceType<typeof MonacoDiff> | null>(null);
const changeCount = ref(0);
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-dv-app">
        <selection-banner
            :file="comparison.selectedFile"
            :viewed="comparison.isViewed(comparison.selectedFile.path)"
            :change-count="changeCount"
            @prev="diffRef?.prev()"
            @next="diffRef?.next()"
            @toggle-viewed="comparison.toggleViewed(comparison.selectedFile.path)"
        />

        <div
            class="flex h-7 flex-none items-stretch border-b border-dv-border bg-dv-chrome font-mono text-[11px] text-dv-muted"
        >
            <template v-if="ui.viewMode === 'split'">
                <div class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                    {{ comparison.base }}
                </div>
                <div class="w-px bg-dv-border" />
                <div class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                    {{ comparison.head }}
                </div>
            </template>
            <div v-else class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                {{ comparison.rangeLabel }}
            </div>
        </div>

        <monaco-diff
            ref="diffRef"
            class="min-h-0 flex-1"
            :original="comparison.selectedPair.oldContent"
            :modified="comparison.selectedPair.newContent"
            :language="comparison.selectedPair.language"
            :view-mode="ui.viewMode"
            :is-dark="ui.isDark"
            @update:change-count="changeCount = $event"
        />

        <status-bar />
    </div>
</template>
