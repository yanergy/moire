<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import StackedDiffCard from '@/components/diff/StackedDiffCard.vue';

// The GitHub-style "all files" view: every changed file's diff stacked in one
// scroll container. Only the cards near the viewport mount a real editor (windowed
// by an IntersectionObserver), so the list stays responsive on very large PRs.
const comparison = useComparisonStore();

const containerRef = ref<HTMLElement | null>(null);
// Paths whose cards are inside the scroll window (plus overscan); their editors mount.
const active = ref<Set<string>>(new Set());

let observer: IntersectionObserver | null = null;
let rafPending = false;

function onIntersect(entries: IntersectionObserverEntry[]) {
    const next = new Set(active.value);
    for (const entry of entries) {
        const path = (entry.target as HTMLElement).dataset.path;
        if (!path) {
            continue;
        }
        if (entry.isIntersecting) {
            next.add(path);
        } else {
            next.delete(path);
        }
    }

    active.value = next;
}

// (Re)observe every card after the list first renders or its contents change.
function syncObserved() {
    const container = containerRef.value;
    if (!observer || !container) {
        return;
    }

    observer.disconnect();
    const paths = new Set<string>();
    for (const el of container.querySelectorAll<HTMLElement>('[data-path]')) {
        observer.observe(el);
        if (el.dataset.path) {
            paths.add(el.dataset.path);
        }
    }

    // Drop any active paths whose cards were filtered out of the list.
    active.value = new Set([...active.value].filter((path) => paths.has(path)));
}

function cardEl(path: string): HTMLElement | null {
    const container = containerRef.value;
    if (!container) {
        return null;
    }

    for (const el of container.querySelectorAll<HTMLElement>('[data-path]')) {
        if (el.dataset.path === path) {
            return el;
        }
    }

    return null;
}

// The top-most card in view becomes the current file, so the sidebar highlight and
// status follow what the reader is looking at. Throttled to one read per frame.
function onScroll() {
    if (rafPending) {
        return;
    }

    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        const container = containerRef.value;
        if (!container) {
            return;
        }

        const top = container.scrollTop + 8;
        let current = '';
        for (const el of container.querySelectorAll<HTMLElement>('[data-path]')) {
            if (el.offsetTop <= top) {
                current = el.dataset.path ?? current;
            } else {
                break;
            }
        }

        if (current && current !== comparison.selectedPath) {
            comparison.setCurrentFromScroll(current);
        }
    });
}

// Clicking inside a Monaco editor focuses its hidden textarea, and the browser then
// scrolls that textarea into view, yanking the list (often to the top) when the
// clicked file is partly above the fold. Snapshot the scroll position as the click
// travels down (capture phase, before Monaco focuses), then undo any scroll the
// focus alone caused. Pointer-only, so keyboard focus still scrolls its target in.
let preFocusScrollTop = 0;
let pointerFocusGuard = false;

function onPointerDownCapture() {
    const container = containerRef.value;
    if (!container) {
        return;
    }

    preFocusScrollTop = container.scrollTop;
    pointerFocusGuard = true;
    // A click's focusin fires within this same task; clear the guard just after, so
    // a later keyboard focus is free to scroll its target into view.
    setTimeout(() => (pointerFocusGuard = false), 0);
}

function onFocusIn() {
    const container = containerRef.value;
    if (pointerFocusGuard && container && container.scrollTop !== preFocusScrollTop) {
        container.scrollTop = preFocusScrollTop;
    }
}

// Scroll the list to a file only when the file tree asks (a sidebar click). This is
// deliberately not driven by selectedPath: the current file also moves as the reader
// scrolls or clicks within the list, and jumping the scroll then would disorient.
watch(
    () => comparison.scrollToFile.seq,
    () => {
        const path = comparison.scrollToFile.path;
        if (path) {
            cardEl(path)?.scrollIntoView({ block: 'start' });
        }
    }
);

// Re-observe whenever the shown-file list changes (filters, a refresh, a range change).
watch(
    () => comparison.orderedShownFiles.map((f) => f.path).join('\n'),
    () => void nextTick(syncObserved)
);

onMounted(() => {
    observer = new IntersectionObserver(onIntersect, {
        root: containerRef.value,
        // Mount editors a screenful early, so they are ready before they scroll in.
        rootMargin: '800px 0px',
    });
    void nextTick(syncObserved);
});

onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
});
</script>

<template>
    <div
        ref="containerRef"
        class="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-moire-app"
        style="overflow-anchor: auto"
        @scroll="onScroll"
        @pointerdown.capture="onPointerDownCapture"
        @focusin="onFocusIn"
    >
        <stacked-diff-card
            v-for="file in comparison.orderedShownFiles"
            :key="file.path"
            :file="file"
            :active="active.has(file.path)"
        />
        <div
            v-if="comparison.orderedShownFiles.length === 0"
            class="flex h-full items-center justify-center px-6 text-center text-sm text-moire-faint"
        >
            No files match the current filter.
        </div>
    </div>
</template>
