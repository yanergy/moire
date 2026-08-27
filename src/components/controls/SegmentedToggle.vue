<script setup lang="ts" generic="T extends string">
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface Option {
    value: T;
    label: string;
}

defineProps<{
    options: Option[];
    modelValue: T;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: T];
}>();

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
        <ToggleGroupItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="h-auto min-w-0 rounded px-2.5 py-1 text-xs font-medium text-moire-muted hover:bg-transparent hover:text-moire-fg data-[state=on]:bg-moire-seg-active data-[state=on]:text-moire-fg data-[state=on]:shadow-[var(--moire-seg-shadow)]"
        >
            {{ option.label }}
        </ToggleGroupItem>
    </ToggleGroup>
</template>
