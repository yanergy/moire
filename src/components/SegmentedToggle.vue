<script setup lang="ts" generic="T extends string">
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
</script>

<template>
    <div class="flex gap-0.5 rounded-md bg-dv-chrome p-[3px]">
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap"
            :class="
                option.value === modelValue
                    ? 'bg-dv-seg-active text-dv-fg'
                    : 'text-dv-muted hover:text-dv-fg'
            "
            :style="option.value === modelValue ? { boxShadow: 'var(--dv-seg-shadow)' } : undefined"
            @click="emit('update:modelValue', option.value)"
        >
            {{ option.label }}
        </button>
    </div>
</template>
