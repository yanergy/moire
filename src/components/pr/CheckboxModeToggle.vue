<script setup lang="ts">
// The per block "checkbox mode" toggle in the PR view: while on, the task-list
// checkboxes in that description or comment are tickable; off, they are read only,
// so a stray click does not change them.
import { ListChecks } from '@lucide/vue';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

defineProps<{
    pressed: boolean;
}>();

const emit = defineEmits<{
    toggle: [];
}>();
</script>

<template>
    <Tooltip>
        <!-- The trigger sits on a wrapper span: the tooltip stamps its own data-state
             (open/closed), which would clobber the toggle's data-state=on styling. -->
        <TooltipTrigger as-child>
            <span class="inline-flex">
                <Toggle
                    size="sm"
                    data-slot="checkbox-mode"
                    :model-value="pressed"
                    aria-label="Checkbox mode"
                    class="size-5 min-w-0 rounded p-0 text-moire-faint hover:bg-moire-hover hover:text-moire-fg data-[state=on]:bg-moire-hover data-[state=on]:text-moire-fg"
                    @update:model-value="emit('toggle')"
                >
                    <ListChecks :size="13" />
                </Toggle>
            </span>
        </TooltipTrigger>
        <TooltipContent>{{
            pressed
                ? 'Checkbox mode on: tick task-list items'
                : 'Checkbox mode: tick task-list items'
        }}</TooltipContent>
    </Tooltip>
</template>
