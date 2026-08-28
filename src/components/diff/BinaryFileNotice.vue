<script setup lang="ts">
import { Binary } from '@lucide/vue';
import DiffPlaceholder from '@/components/diff/DiffPlaceholder.vue';
</script>

<template>
    <diff-placeholder
        :icon="Binary"
        title="Binary file"
        subtitle="This file can't be shown as a text diff."
    />
</template>
