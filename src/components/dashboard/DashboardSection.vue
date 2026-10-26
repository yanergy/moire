<script setup lang="ts">
// A titled dashboard section: a heading with its item count, then a bordered card
// whose children (PR rows, group headers) are separated by divider lines.
defineProps<{ title: string; count: number }>();
</script>

<template>
    <section class="mt-6">
        <h2 class="mb-2 flex items-center gap-2 text-[13px] font-semibold text-moire-fg">
            {{ title }}
            <span
                class="rounded-full bg-moire-chrome px-1.5 text-[11px] font-medium text-moire-muted"
            >
                {{ count }}
            </span>
        </h2>
        <div
            class="divide-y divide-moire-border overflow-hidden rounded-lg border border-moire-border"
        >
            <slot />
        </div>
    </section>
</template>
