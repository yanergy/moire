<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowUp, Check, Circle } from '@lucide/vue';
import type { ChangedFile, FileStatus } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    <TooltipProvider :delay-duration="200">
        <div
            class="flex h-11 flex-none items-center gap-2.5 border-b border-dv-border px-3.5"
            :class="viewed ? 'bg-dv-viewed' : 'bg-dv-app'"
        >
            <span class="truncate font-mono text-xs text-dv-muted">
                {{ dir }}<span class="font-medium text-dv-fg">{{ name }}</span>
            </span>
            <Badge
                variant="outline"
                :class="['px-[7px] font-mono text-[10px] font-bold', STATUS_BADGE[file.status]]"
            >
                {{ file.status }}
            </Badge>
            <span class="font-mono text-[11px] text-dv-add-fg">
                {{ file.additions ? '+' + file.additions : '' }}
            </span>
            <span class="font-mono text-[11px] text-dv-del-fg">
                {{ file.deletions ? '−' + file.deletions : '' }}
            </span>

            <div class="flex-1" />

            <span class="text-[11px] whitespace-nowrap text-dv-faint">
                {{ changeCount }} changes
            </span>

            <div class="flex gap-1">
                <Tooltip>
                    <TooltipTrigger as-child>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            class="size-7 border-dv-border text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                            @click="emit('prev')"
                        >
                            <ArrowUp :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Previous change</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger as-child>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            class="size-7 border-dv-border text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                            @click="emit('next')"
                        >
                            <ArrowDown :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Next change</TooltipContent>
                </Tooltip>
            </div>

            <Button
                variant="outline"
                size="sm"
                class="h-7 min-w-[116px] gap-1.5"
                :class="
                    viewed
                        ? 'border-dv-viewed-edge bg-dv-viewed text-dv-viewed-fg hover:bg-dv-viewed-hover hover:text-dv-viewed-fg'
                        : 'border-dv-border text-dv-muted hover:bg-dv-hover'
                "
                @click="emit('toggleViewed')"
            >
                <Check v-if="viewed" :size="16" />
                <Circle v-else :size="16" />
                {{ viewed ? 'Viewed' : 'Mark viewed' }}
            </Button>
        </div>
    </TooltipProvider>
</template>
