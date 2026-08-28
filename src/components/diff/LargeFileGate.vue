<script setup lang="ts">
import { computed } from 'vue';
import { FileWarning } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import DiffPlaceholder from '@/components/diff/DiffPlaceholder.vue';

const props = defineProps<{
    sizeBytes: number;
}>();

const emit = defineEmits<{
    load: [];
}>();

// Files only reach this gate above the render threshold (~512 KB), so KB and MB
// cover every case.
const humanSize = computed(() => {
    const mb = props.sizeBytes / (1024 * 1024);
    if (mb >= 1) {
        return `${mb.toFixed(1)} MB`;
    }

    return `${Math.round(props.sizeBytes / 1024)} KB`;
});
</script>

<template>
    <diff-placeholder
        :icon="FileWarning"
        :title="`This file is large (${humanSize})`"
        subtitle="Rendering the diff may be slow."
    >
        <Button
            variant="outline"
            size="sm"
            class="border-moire-border text-moire-fg hover:bg-moire-hover"
            @click="emit('load')"
        >
            Load diff
        </Button>
    </diff-placeholder>
</template>
