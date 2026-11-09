<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// A toolbar tab that goes to a page (Diff, PR, Dashboard, Notifications,
// Settings). Not a toggle: the current page's tab shows as selected (underlined in
// the accent color on the toolbar's bottom edge), and clicking it does nothing, so
// the only way off a page is another page's tab (or back/forward).
const props = defineProps<{
    selected: boolean;
    // A page that is not available right now (the PR tab without a PR): dimmed
    // and inert, but still hoverable so a tooltip around it can say why.
    disabled?: boolean;
    class?: HTMLAttributes['class'];
}>();

const emit = defineEmits<{
    navigate: [];
}>();

function onClick() {
    if (!props.selected && !props.disabled) {
        emit('navigate');
    }
}
</script>

<template>
    <Button
        variant="ghost"
        size="sm"
        data-slot="toolbar-nav-button"
        :aria-current="selected ? 'page' : undefined"
        :aria-disabled="disabled || undefined"
        :class="
            cn(
                'relative h-full gap-2 rounded-none px-2 text-[13px] font-medium text-moire-muted hover:bg-transparent hover:text-moire-fg dark:hover:bg-transparent',
                selected &&
                    'cursor-default text-moire-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-moire-accent',
                disabled && 'cursor-default opacity-50 hover:text-moire-muted',
                props.class
            )
        "
        @click="onClick"
    >
        <slot />
    </Button>
</template>
