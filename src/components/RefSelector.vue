<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { WORKING_TREE } from '@/shared/types';

const props = defineProps<{
    side: 'base' | 'head';
}>();

const comparison = useComparisonStore();

const open = ref(false);
const query = ref('');
const inputRef = useTemplateRef<HTMLInputElement>('input');

const current = computed(() => (props.side === 'base' ? comparison.base : comparison.head));

interface RefItem {
    name: string;
    meta: string;
    on: boolean;
}

interface RefGroup {
    label: string;
    items: RefItem[];
}

const groups = computed<RefGroup[]>(() => {
    const q = query.value.toLowerCase();
    const matches = (name: string) => !q || name.toLowerCase().includes(q);
    const toItem = (name: string, meta: string): RefItem => ({
        name,
        meta,
        on: name === current.value,
    });

    const result: RefGroup[] = [];

    if (props.side === 'head' && matches(WORKING_TREE)) {
        result.push({ label: 'Uncommitted', items: [toItem(WORKING_TREE, 'on disk')] });
    }

    const local = comparison.localBranches
        .filter((b) => matches(b.name))
        .map((b) => toItem(b.name, b.meta ?? ''));
    if (local.length > 0) {
        result.push({ label: 'Local branches', items: local });
    }

    const remote = comparison.remoteBranches
        .filter((b) => matches(b.name))
        .map((b) => toItem(b.name, b.meta ?? ''));
    if (remote.length > 0) {
        result.push({ label: 'Remotes', items: remote });
    }

    return result;
});

function toggle() {
    open.value = !open.value;
    query.value = '';
    if (open.value) {
        nextTick(() => inputRef.value?.focus());
    }
}

function pick(name: string) {
    if (props.side === 'base') {
        comparison.setBase(name);
    } else {
        comparison.setHead(name);
    }

    open.value = false;
    query.value = '';
}
</script>

<template>
    <div class="relative">
        <button
            type="button"
            class="flex h-8 min-w-[196px] items-center gap-2.5 rounded-md border px-3"
            :class="open ? 'border-dv-ring' : 'border-dv-border hover:bg-dv-hover'"
            :style="open ? { boxShadow: 'var(--dv-ring-glow)' } : undefined"
            @click="toggle()"
        >
            <span class="text-[10px] tracking-wider text-dv-faint uppercase">{{ side }}</span>
            <span class="flex-1 truncate text-left font-mono text-xs text-dv-fg">
                {{ current }}
            </span>
            <span class="text-[9px] text-dv-faint">▾</span>
        </button>

        <template v-if="open">
            <div class="fixed inset-0 z-30" @click="open = false" />

            <div
                class="absolute top-[38px] left-0 z-40 w-[306px] overflow-hidden rounded-lg border border-dv-border bg-dv-pop"
                :style="{ boxShadow: 'var(--dv-pop-shadow)' }"
            >
                <div class="flex h-10 items-center gap-2 border-b border-dv-border px-3">
                    <span class="text-xs text-dv-faint">⌕</span>
                    <input
                        ref="input"
                        v-model="query"
                        placeholder="Search refs…"
                        class="h-full flex-1 bg-transparent font-mono text-xs text-dv-fg outline-none"
                    />
                </div>

                <div class="max-h-[322px] overflow-y-auto p-1">
                    <template v-for="group in groups" :key="group.label">
                        <div class="px-2 pt-2 pb-1 text-[11px] font-medium text-dv-faint">
                            {{ group.label }}
                        </div>
                        <button
                            v-for="item in group.items"
                            :key="item.name"
                            type="button"
                            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-xs hover:bg-dv-hover"
                            :class="item.on ? 'bg-dv-hover text-dv-fg' : 'text-dv-file-fg'"
                            @click="pick(item.name)"
                        >
                            <span class="w-3 shrink-0 text-[11px] text-dv-fg">
                                {{ item.on ? '✓' : '' }}
                            </span>
                            <span class="flex-1 truncate">{{ item.name }}</span>
                            <span class="text-[11px] whitespace-nowrap text-dv-faint">
                                {{ item.meta }}
                            </span>
                        </button>
                    </template>
                </div>
            </div>
        </template>
    </div>
</template>
