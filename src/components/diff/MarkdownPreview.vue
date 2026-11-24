<script setup lang="ts">
// The rendered view of a Markdown file: the base version on the left and the head
// version on the right, the way GitHub's "rich diff" shows them. An added or deleted
// file has one version only, which then takes the full width.
//
// Changed blocks are tinted (see lib/markdown-diff), and prev/next step through
// them like the source diff: the current change gets the active change marker and
// scrolls into view, and the parent crosses into the next file at either end.
import { computed, nextTick, ref, watch } from 'vue';
import { isRelativeUrl, renderMarkdownFile } from '@/lib/markdown';
import { highlightBlockChanges } from '@/lib/markdown-diff';

const props = defineProps<{
    // null when the file does not exist on that side (an add or a delete).
    oldSource: string | null;
    newSource: string | null;
    // A cross-file landing to apply once rendered (first or last change), as the
    // source diff does; the parent clears it on edgeConsumed.
    pendingEdge?: 'first' | 'last' | null;
}>();

const emit = defineEmits<{
    'update:changeCount': [count: number];
    edgeConsumed: [];
}>();

// With both versions present, the blocks that changed between them are tinted
// (removed on the left, added on the right), so the edit is visible in the
// rendered view too. An add or a delete has nothing to compare against.
const rendered = computed(() => {
    const oldHtml = props.oldSource === null ? null : renderMarkdownFile(props.oldSource);
    const newHtml = props.newSource === null ? null : renderMarkdownFile(props.newSource);
    const marked =
        oldHtml !== null && newHtml !== null ? highlightBlockChanges(oldHtml, newHtml) : null;

    const sides = [
        { key: 'old', html: marked?.oldHtml ?? oldHtml },
        { key: 'new', html: marked?.newHtml ?? newHtml },
    ].filter((side): side is { key: string; html: string } => side.html !== null);
    return { sides, changeCount: marked?.changeCount ?? 0 };
});
const sides = computed(() => rendered.value.sides);

const root = ref<HTMLElement | null>(null);
// The change prev/next is on; -1 until the reader (or a cross-file landing) picks
// one, so a plainly opened file shows no marker.
const changeIndex = ref(-1);

// Mark the current change's blocks on both sides and bring them into view. The
// HTML comes from v-html, so the marker class is set on the DOM directly.
function markCurrent() {
    const el = root.value;
    if (!el) {
        return;
    }

    for (const block of el.querySelectorAll('.pr-md-current')) {
        block.classList.remove('pr-md-current');
    }
    if (changeIndex.value < 0) {
        return;
    }

    const blocks = el.querySelectorAll(`[data-change="${changeIndex.value}"]`);
    for (const block of blocks) {
        block.classList.add('pr-md-current');
    }
    blocks[0]?.scrollIntoView?.({ block: 'center' });
}

// A new render replaces the DOM: report the new count, then apply a pending
// cross-file landing, else start with nothing selected.
watch(
    rendered,
    async ({ changeCount }) => {
        emit('update:changeCount', changeCount);
        await nextTick();
        if (props.pendingEdge && changeCount > 0) {
            goToEdge(props.pendingEdge);
            emit('edgeConsumed');
            return;
        }

        changeIndex.value = -1;
        markCurrent();
    },
    { immediate: true }
);

// The same contract as the source diff's viewer: false at the boundary (or with no
// changes), the parent's signal to cross into the adjacent file. From no selection
// either arrow selects the first change.
function next(): boolean {
    if (changeIndex.value >= rendered.value.changeCount - 1) {
        return false;
    }

    changeIndex.value++;
    markCurrent();
    return true;
}

function prev(): boolean {
    if (changeIndex.value === -1) {
        return next();
    }
    if (changeIndex.value <= 0) {
        return false;
    }

    changeIndex.value--;
    markCurrent();
    return true;
}

function goToEdge(edge: 'first' | 'last') {
    const count = rendered.value.changeCount;
    if (count === 0) {
        return;
    }

    changeIndex.value = edge === 'first' ? 0 : count - 1;
    markCurrent();
}

defineExpose({ next, prev, goToEdge });

// A web link opens in the browser rather than navigating the app window. A
// relative link points into the repository at some ref, which there is no page
// for, so it does nothing.
function onClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) {
        return;
    }

    event.preventDefault();
    if (isRelativeUrl(href)) {
        return;
    }

    void window.api?.openExternal(href);
}
</script>

<template>
    <div ref="root" class="overflow-auto bg-moire-app" @click="onClick">
        <div class="flex min-h-full">
            <template v-for="(side, index) in sides" :key="side.key">
                <div v-if="index > 0" class="w-px shrink-0 bg-moire-border" />
                <!-- v-html is safe here: renderMarkdownFile sanitizes the output through
                     DOMPurify (see lib/markdown). -->
                <div
                    class="pr-markdown min-w-0 flex-1 px-6 py-5 text-[14px] leading-[1.6] text-moire-file-fg"
                    :data-side="side.key"
                    v-html="side.html"
                />
            </template>
        </div>
    </div>
</template>
