<script setup lang="ts" generic="T extends string">
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Option {
    value: T;
    label: string;
    // Optional hover hint. When set, the item is wrapped in a tooltip; callers
    // that provide it must render this control inside a TooltipProvider.
    tooltip?: string;
}

defineProps<{
    options: Option[];
    modelValue: T;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: T];
}>();

// One class string shared by the plain and tooltip-wrapped item variants below,
// so the two stay visually identical.
const itemClass =
    'h-auto min-w-0 rounded px-2.5 py-1 font-medium text-moire-muted hover:bg-transparent hover:text-moire-fg data-[state=on]:bg-moire-seg-active data-[state=on]:text-moire-fg data-[state=on]:shadow-[var(--moire-seg-shadow)]';

// A single-select toggle group emits an empty string when the active item is
// clicked again. The segmented control must always keep one option active, so
// swallow the empty (deselect) update and forward only real changes.
function onChange(value: unknown) {
    if (typeof value !== 'string' || !value) {
        return;
    }

    emit('update:modelValue', value as T);
}
</script>

<template>
    <ToggleGroup
        type="single"
        :spacing="1"
        :model-value="modelValue"
        class="gap-0.5 rounded-md bg-moire-chrome p-[3px]"
        @update:model-value="onChange"
    >
        <template v-for="option in options" :key="option.value">
            <!-- The tooltip trigger sits on a wrapper span, not the item itself:
                 the trigger stamps its own data-state (open/closed), which would
                 otherwise clobber the toggle item's data-state=on and drop the
                 active styling. -->
            <Tooltip v-if="option.tooltip">
                <TooltipTrigger as-child>
                    <span class="inline-flex">
                        <ToggleGroupItem :value="option.value" :class="itemClass">
                            {{ option.label }}
                        </ToggleGroupItem>
                    </span>
                </TooltipTrigger>
                <TooltipContent class="max-w-xs">{{ option.tooltip }}</TooltipContent>
            </Tooltip>
            <ToggleGroupItem v-else :value="option.value" :class="itemClass">
                {{ option.label }}
            </ToggleGroupItem>
        </template>
    </ToggleGroup>
</template>
