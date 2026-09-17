<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowRight, ArrowUp, Check, SquareArrowOutUpRight } from '@lucide/vue';
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
    open: [];
}>();

const STATUS_BADGE: Record<FileStatus, string> = {
    A: 'border-moire-status-a text-moire-status-a',
    M: 'border-moire-status-m text-moire-status-m',
    D: 'border-moire-status-d text-moire-status-d',
    R: 'border-moire-status-r text-moire-status-r',
};

// The filename doubles as an "open file" trigger, so it looks like a link: an
// accent color and underline on hover. Kept in a constant so the inline tag below
// stays on one line with the directory prefix (a line break there would render a
// stray space between the folder path and the filename).
const NAME_LINK_CLASS =
    'cursor-pointer font-medium text-moire-fg hover:text-moire-accent hover:underline';

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
            class="flex h-11 flex-none items-center gap-2.5 border-b border-moire-border px-3.5"
            :class="viewed ? 'bg-moire-viewed' : 'bg-moire-app'"
        >
            <!-- A rename shows the old path moving to the new one; every other
                 status shows the path on its own. -->
            <span class="flex min-w-0 items-center gap-1.5 font-mono text-xs text-moire-muted">
                <template v-if="file.oldPath">
                    <span class="min-w-0 truncate">{{ file.oldPath }}</span>
                    <ArrowRight :size="13" class="shrink-0 text-moire-faint" />
                </template>
                <span class="min-w-0 truncate">
                    {{ dir
                    }}<button
                        v-if="file.status !== 'D'"
                        type="button"
                        :title="file.path"
                        :class="NAME_LINK_CLASS"
                        @click="emit('open')"
                    >
                        {{ name
                        }}<SquareArrowOutUpRight
                            :size="12"
                            aria-hidden="true"
                            style="
                                display: inline-block;
                                margin-left: 0.4rem;
                                vertical-align: -0.1em;
                            "
                        /></button
                    ><span v-else class="font-medium text-moire-fg">{{ name }}</span>
                </span>
            </span>
            <Badge
                variant="outline"
                :class="['px-[7px] font-mono text-[10px] font-bold', STATUS_BADGE[file.status]]"
            >
                {{ file.status }}
            </Badge>
            <span class="font-mono text-[11px] text-moire-add-fg">
                {{ file.additions ? '+' + file.additions : '' }}
            </span>
            <span class="font-mono text-[11px] text-moire-del-fg">
                {{ file.deletions ? '−' + file.deletions : '' }}
            </span>

            <div class="flex-1" />

            <span class="text-[11px] whitespace-nowrap text-moire-faint">
                {{ changeCount }} changes
            </span>

            <div class="flex gap-1">
                <Tooltip>
                    <TooltipTrigger as-child>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Previous change"
                            class="size-7 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
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
                            aria-label="Next change"
                            class="size-7 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
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
                class="h-7 w-[128px] gap-2 pr-3 pl-2"
                :class="
                    viewed
                        ? 'border-moire-viewed-edge bg-moire-viewed text-moire-viewed-fg hover:bg-moire-viewed-hover hover:text-moire-viewed-fg'
                        : 'border-moire-border text-moire-muted hover:bg-moire-hover'
                "
                @click="emit('toggleViewed')"
            >
                <!-- A checkbox look, not the real Checkbox primitive: that renders a
                     button, and a button inside this Button is invalid. The whole
                     Button is the single click target, so this stays presentational. -->
                <span
                    class="flex size-[15px] shrink-0 items-center justify-center rounded-sm border"
                    :class="
                        viewed
                            ? 'border-moire-viewed-edge bg-moire-viewed-edge text-moire-check-fg'
                            : 'border-current'
                    "
                >
                    <Check v-if="viewed" class="size-[11px]" />
                </span>
                <span class="flex-1 text-center">{{ viewed ? 'Viewed' : 'Mark viewed' }}</span>
            </Button>
        </div>
    </TooltipProvider>
</template>
