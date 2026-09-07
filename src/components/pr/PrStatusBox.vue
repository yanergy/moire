<script setup lang="ts">
import type { Component } from 'vue';

// A tinted status box (icon + title + optional detail) shown at the top of a PR
// tab: the PR's merge state on the Conversation tab, the CI checks' state on the
// Checks tab. `null` renders nothing. The trailing padding sits below the box, as
// the box leads its tab's content.
defineProps<{
    status: {
        icon: Component;
        iconCls: string;
        title: string;
        detail: string;
        cls: string;
    } | null;
}>();
</script>

<template>
    <div v-if="status" class="pb-4">
        <div class="flex items-center gap-2.5 rounded-lg border px-3.5 py-3" :class="status.cls">
            <component :is="status.icon" :size="18" :class="status.iconCls" />
            <div class="min-w-0">
                <div class="text-[14px] font-medium text-moire-fg">{{ status.title }}</div>
                <div v-if="status.detail" class="mt-0.5 text-[13px] text-moire-muted">
                    {{ status.detail }}
                </div>
            </div>
        </div>
    </div>
</template>
