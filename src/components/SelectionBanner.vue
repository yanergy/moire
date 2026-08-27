<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowUp, Check, Circle } from '@lucide/vue';
import type { ChangedFile, FileStatus } from '@/shared/types';

const props = defineProps<{
    file: ChangedFile;
    viewed: boolean;
    changeCount: number;
}>();

const emit = defineEmits<{
    prev: [];
    next: [];
    toggleViewed: [];
}>();

const STATUS_BADGE: Record<FileStatus, string> = {
    A: 'border-dv-status-a text-dv-status-a',
    M: 'border-dv-status-m text-dv-status-m',
    D: 'border-dv-status-d text-dv-status-d',
    R: 'border-dv-status-r text-dv-status-r',
};

const dir = computed(() => {
    const slash = props.file.path.lastIndexOf('/');
    return slash === -1 ? '' : props.file.path.slice(0, slash + 1);
});

const name = computed(() => {
    const slash = props.file.path.lastIndexOf('/');
    return slash === -1 ? props.file.path : props.file.path.slice(slash + 1);
});
</script>

<template>
    <div
        class="flex h-11 flex-none items-center gap-2.5 border-b border-dv-border px-3.5"
        :class="viewed ? 'bg-dv-viewed' : 'bg-dv-app'"
    >
        <span class="truncate font-mono text-xs text-dv-muted">
            {{ dir }}<span class="font-medium text-dv-fg">{{ name }}</span>
        </span>
        <span
            class="rounded-full border px-[7px] font-mono text-[10px] font-bold whitespace-nowrap"
            :class="STATUS_BADGE[file.status]"
        >
            {{ file.status }}
        </span>
        <span class="font-mono text-[11px] text-dv-add-fg">
            {{ file.additions ? '+' + file.additions : '' }}
        </span>
        <span class="font-mono text-[11px] text-dv-del-fg">
            {{ file.deletions ? '−' + file.deletions : '' }}
        </span>

        <div class="flex-1" />

        <span class="text-[11px] whitespace-nowrap text-dv-faint">{{ changeCount }} changes</span>

        <div class="flex gap-1">
            <button
                type="button"
                title="Previous change"
                class="flex size-7 items-center justify-center rounded-md border border-dv-border text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                @click="emit('prev')"
            >
                <arrow-up :size="16" />
            </button>
            <button
                type="button"
                title="Next change"
                class="flex size-7 items-center justify-center rounded-md border border-dv-border text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                @click="emit('next')"
            >
                <arrow-down :size="16" />
            </button>
        </div>

        <button
            type="button"
            class="flex h-7 min-w-[116px] items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap"
            :class="
                viewed
                    ? 'border-dv-viewed-edge bg-dv-viewed text-dv-viewed-fg hover:bg-dv-viewed-hover'
                    : 'border-dv-border text-dv-muted hover:bg-dv-hover'
            "
            @click="emit('toggleViewed')"
        >
            <check v-if="viewed" :size="16" />
            <circle v-else :size="16" />
            {{ viewed ? 'Viewed' : 'Mark viewed' }}
        </button>
    </div>
</template>
