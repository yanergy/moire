<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, ChevronDown, ChevronRight, SquareArrowOutUpRight } from '@lucide/vue';
import type { ChangedFile, FilePair, FileStatus } from '@/shared/types';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { Badge } from '@/components/ui/badge';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import ImagePreview from '@/components/diff/ImagePreview.vue';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';

const props = defineProps<{
    file: ChangedFile;
    // Whether this card is inside the pane's scroll window (its IntersectionObserver
    // toggles this). The diff editor mounts only while active; off-window the body
    // collapses to a spacer, so a large PR keeps only a handful of live editors.
    active: boolean;
}>();

const comparison = useComparisonStore();
const ui = useUiStore();

const STATUS_BADGE: Record<FileStatus, string> = {
    A: 'border-moire-status-a text-moire-status-a',
    M: 'border-moire-status-m text-moire-status-m',
    D: 'border-moire-status-d text-moire-status-d',
    R: 'border-moire-status-r text-moire-status-r',
};

// This card's own diff pair, fetched lazily on first entering the window (unlike
// the single-file pane's shared selectedPair). Cached in the store by pairFor.
const pair = ref<FilePair | null>(null);
const largeLoaded = ref(false);
const collapsed = ref(false);
// The measured editor height, kept so the off-window spacer reserves the same
// space and the list does not jump when the editor unmounts.
const bodyHeight = ref<number | null>(null);

watch(
    () => props.active,
    (active) => {
        if (active && !pair.value) {
            void loadPair();
        }
    },
    { immediate: true }
);

async function loadPair() {
    pair.value = await comparison.pairFor(props.file.path);
}

// Clearing the per-file large gate refetches this file with its full content.
async function loadLarge() {
    pair.value = await comparison.pairFor(props.file.path, true);
    largeLoaded.value = true;
}

// The gate/preview/notice predicates, mirroring the single-file pane but read off
// this card's own pair rather than the store's shared selectedPair.
const showGate = computed(
    () => Boolean(pair.value?.tooLarge) && !pair.value?.binary && !largeLoaded.value
);
const showImage = computed(() => Boolean(pair.value?.image));
const showBinary = computed(() => Boolean(pair.value?.binary) && !pair.value?.image);

const viewed = computed(() => comparison.isViewed(props.file.path));

// Auto-collapse a file to its header when marked viewed (GitHub behavior); unmarking
// expands it again. A manual header click toggles within that.
watch(viewed, (isViewed) => (collapsed.value = isViewed), { immediate: true });

// A rough height for the off-window spacer before the editor has ever measured this
// file, scaled by the change size and clamped so it is neither tiny nor enormous.
// Replaced by the measured height once the editor has mounted at least once.
const estimatedHeight = computed(() => {
    const lines = props.file.additions + props.file.deletions;
    return Math.min(Math.max(lines * 20 + 52, 96), 1600);
});
const spacerHeight = computed(() => bodyHeight.value ?? estimatedHeight.value);

// The directory prefix stays muted; the filename is the emphasized, clickable part
// (opens the working-tree copy), matching the single-file banner.
const dir = computed(() => {
    const slash = props.file.path.lastIndexOf('/');
    return slash === -1 ? '' : props.file.path.slice(0, slash + 1);
});
const name = computed(() => {
    const slash = props.file.path.lastIndexOf('/');
    return slash === -1 ? props.file.path : props.file.path.slice(slash + 1);
});

function toggleCollapsed() {
    collapsed.value = !collapsed.value;
}

function openInEditor() {
    void comparison.openFile(props.file.path);
}
</script>

<template>
    <div class="border-b border-moire-border" :data-path="file.path">
        <!-- Slim per-file header: a collapse chevron, the status badge, the path
             (its filename opens the file), the +/- counts, and a mark-viewed toggle.
             Sticks to the top of the scroll area while the file is in view. -->
        <div
            class="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-moire-border px-3 font-mono text-xs"
            :class="viewed ? 'bg-moire-viewed' : 'bg-moire-chrome'"
        >
            <button
                type="button"
                :aria-label="collapsed ? 'Expand file' : 'Collapse file'"
                class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                @click="toggleCollapsed"
            >
                <component :is="collapsed ? ChevronRight : ChevronDown" :size="14" />
            </button>
            <Badge
                variant="outline"
                :class="['px-[7px] font-mono text-[10px] font-bold', STATUS_BADGE[file.status]]"
            >
                {{ file.status }}
            </Badge>
            <span class="min-w-0 truncate text-moire-muted">
                {{ dir
                }}<button
                    type="button"
                    :title="file.path"
                    class="cursor-pointer font-medium text-moire-fg hover:text-moire-accent hover:underline"
                    @click="openInEditor"
                >
                    {{ name
                    }}<SquareArrowOutUpRight
                        :size="12"
                        aria-hidden="true"
                        style="display: inline-block; margin-left: 0.4rem; vertical-align: -0.1em"
                    />
                </button>
            </span>
            <span class="shrink-0 text-moire-add-fg">
                {{ file.additions ? '+' + file.additions : '' }}
            </span>
            <span class="shrink-0 text-moire-del-fg">
                {{ file.deletions ? '−' + file.deletions : '' }}
            </span>
            <div class="flex-1" />
            <button
                type="button"
                class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors"
                :class="
                    viewed
                        ? 'border-moire-viewed-edge bg-moire-viewed text-moire-viewed-fg hover:bg-moire-viewed-hover'
                        : 'border-moire-border text-moire-muted hover:bg-moire-hover'
                "
                @click="comparison.toggleViewed(file.path)"
            >
                <span
                    class="flex size-[14px] items-center justify-center rounded-sm border"
                    :class="
                        viewed
                            ? 'border-moire-viewed-edge bg-moire-viewed-edge text-moire-check-fg'
                            : 'border-current'
                    "
                >
                    <Check v-if="viewed" class="size-[10px]" />
                </span>
                Viewed
            </button>
        </div>

        <!-- Body, shown only while expanded. Active and loaded renders the real diff
             (gate / image / binary / editor); otherwise a spacer reserves the file's
             height so the scroll geometry holds while the editor is unmounted. -->
        <template v-if="!collapsed">
            <template v-if="active && pair">
                <large-file-gate
                    v-if="showGate"
                    class="h-44"
                    :size-bytes="pair.sizeBytes"
                    @load="loadLarge"
                />
                <image-preview
                    v-else-if="showImage"
                    class="h-80"
                    :old-image="pair.oldImage ?? null"
                    :new-image="pair.newImage ?? null"
                />
                <binary-file-notice v-else-if="showBinary" class="h-44" />
                <diff-viewer
                    v-else
                    fit-content
                    :original="pair.oldContent"
                    :modified="pair.newContent"
                    :language="pair.language"
                    :view-mode="ui.viewMode"
                    :is-dark="ui.isDark"
                    :code-style="ui.codeStyle"
                    :review-threads="comparison.threadsForFile(file.path)"
                    :check-annotations="comparison.annotationsForFile(file.path)"
                    :reply-to-thread="comparison.replyToReviewThread"
                    :set-thread-resolved="comparison.setReviewThreadResolved"
                    @update:content-height="bodyHeight = $event"
                />
            </template>
            <div v-else :style="{ height: spacerHeight + 'px' }" />
        </template>
    </div>
</template>
