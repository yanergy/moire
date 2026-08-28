<script setup lang="ts">
import type { Component } from 'vue';

// The shared shell for the states the diff pane shows instead of the editor (a
// large-file gate, a binary-file notice). Centered on the editor surface so it
// reads as part of the diff area. The default slot is for an optional action.
defineProps<{
    icon: Component;
    title: string;
    subtitle?: string;
}>();
</script>

<template>
    <!-- bg-moire-code is the editor surface (--moire-code), so the placeholder sits
         on the same background Monaco would, rather than the app background. -->
    <div class="flex flex-col items-center justify-center gap-4 bg-moire-code px-6 text-center">
        <component :is="icon" :size="40" class="text-moire-faint" />
        <div class="space-y-1">
            <p class="text-sm font-medium text-moire-fg">{{ title }}</p>
            <p v-if="subtitle" class="text-xs text-moire-muted">{{ subtitle }}</p>
        </div>
        <slot />
    </div>
</template>
