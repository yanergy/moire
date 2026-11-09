<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import { useEventListener, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Floating "Back to top" and "Jump to bottom" buttons for a long scrolling view
// (the PR view's conversation). They stay in place and each is enabled while its
// end is more than one screen away, scrolling the view smoothly there. On a view
// too short for either to ever be enabled, the pair is left out. They float, stacked, at the bottom of
// their nearest positioned ancestor (the view, made `relative`), and follow the
// element that scrolls: a ScrollArea's viewport, not the window.
//
// `column` is the max width of the view's centered content column: the buttons
// sit just right of that column, next to the content, rather than in the far
// corner of a wide window. When the window is too narrow for that, they stay
// inside the view's right edge instead.
const props = defineProps<{
    target: HTMLElement | null | undefined;
    column: number;
}>();

// The gap between the column's edge and the buttons, and a button's size plus its
// margin from the view's right edge (clear of the scrollbar).
const GAP_PX = 8;
const EDGE_PX = 36 + 24;
const position = computed(() => ({
    left: `min(calc(50% + ${props.column / 2 + GAP_PX}px), calc(100% - ${EDGE_PX}px))`,
}));

const long = ref(false);
const canTop = ref(false);
const canBottom = ref(false);

function update() {
    const view = props.target;
    if (!view) {
        long.value = canTop.value = canBottom.value = false;
        return;
    }

    long.value = view.scrollHeight - view.clientHeight > view.clientHeight;
    canTop.value = view.scrollTop > view.clientHeight;
    canBottom.value = view.scrollHeight - view.scrollTop - view.clientHeight > view.clientHeight;
}

useEventListener(() => props.target, 'scroll', update, { passive: true });
// The distance to the bottom also changes without a scroll: the window resizes, or
// the content grows or shrinks (comments load, threads fold).
useResizeObserver(() => props.target, update);
useResizeObserver(() => props.target?.firstElementChild as HTMLElement | undefined, update);
// A new scroll element (another PR) starts from its own position.
watch(() => props.target, update, { immediate: true });

const reducedMotion = usePreferredReducedMotion();

function jump(to: 'top' | 'bottom') {
    const view = props.target;
    view?.scrollTo({
        top: to === 'top' ? 0 : view.scrollHeight,
        behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
    });
}

const BUTTONS = [
    { to: 'top', label: 'Back to top', icon: ArrowUp },
    { to: 'bottom', label: 'Jump to bottom', icon: ArrowDown },
] as const;

const enabled = (to: 'top' | 'bottom') => (to === 'top' ? canTop.value : canBottom.value);
</script>

<template>
    <div v-if="long" class="absolute bottom-6 z-10 flex flex-col gap-2" :style="position">
        <Tooltip v-for="button in BUTTONS" :key="button.to">
            <TooltipTrigger as-child>
                <Button
                    variant="outline"
                    size="icon"
                    :data-slot="`scroll-to-${button.to}`"
                    :aria-label="button.label"
                    :disabled="!enabled(button.to)"
                    class="size-9 rounded-full border-moire-border bg-moire-pop text-moire-muted hover:bg-moire-hover hover:text-moire-fg disabled:opacity-40 dark:border-moire-border dark:bg-moire-pop dark:hover:bg-moire-hover"
                    :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
                    @click="jump(button.to)"
                >
                    <component :is="button.icon" :size="18" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{{ button.label }}</TooltipContent>
        </Tooltip>
    </div>
</template>
