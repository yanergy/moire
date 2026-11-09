<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// A toolbar button that goes to a page (Diff, PR, Dashboard, Notifications,
// Settings). Not a toggle: the current page's button shows as selected, and
// clicking it does nothing, so the only way off a page is another page's button
// (or back/forward).
//
// Two looks: a 'tab' for the toolbar's page navigation (no frame, the current
// page underlined in the accent color on the toolbar's bottom edge), and an
// outlined 'button' for the PR button by the branches, sized by the caller.
const props = withDefaults(
    defineProps<{
        selected: boolean;
        look?: 'tab' | 'button';
        class?: HTMLAttributes['class'];
    }>(),
    { look: 'button' }
);

const LOOKS = {
    tab: {
        base: 'relative h-full gap-2 rounded-none px-2 text-[13px] font-medium text-moire-muted hover:bg-transparent hover:text-moire-fg dark:hover:bg-transparent',
        selected:
            'cursor-default text-moire-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-moire-accent',
    },
    button: {
        base: 'border-input bg-transparent text-moire-muted shadow-xs hover:bg-moire-hover hover:text-moire-fg dark:border-input dark:bg-transparent dark:hover:bg-moire-hover',
        selected:
            'cursor-default bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground dark:bg-accent dark:hover:bg-accent',
    },
} as const;

const emit = defineEmits<{
    navigate: [];
}>();

function onClick() {
    if (!props.selected) {
        emit('navigate');
    }
}
</script>

<template>
    <Button
        :variant="look === 'tab' ? 'ghost' : 'outline'"
        size="sm"
        data-slot="toolbar-nav-button"
        :data-look="look"
        :aria-current="selected ? 'page' : undefined"
        :class="cn(LOOKS[look].base, selected && LOOKS[look].selected, props.class)"
        @click="onClick"
    >
        <slot />
    </Button>
</template>
