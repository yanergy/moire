<script setup lang="ts">
import { computed, ref } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { isMarkdownFile, type MarkdownView } from '@/lib/markdown';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import ImagePreview from '@/components/diff/ImagePreview.vue';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';
import MarkdownPreview from '@/components/diff/MarkdownPreview.vue';
import SelectionBanner from '@/components/diff/SelectionBanner.vue';
import StatusBar from '@/components/diff/StatusBar.vue';

const comparison = useComparisonStore();
const ui = useUiStore();

const diffRef = ref<InstanceType<typeof DiffViewer> | null>(null);
const changeCount = ref(0);

// A Markdown file offers a rendered view next to its source diff; undefined for any
// other file, so the banner shows no toggle.
const markdownView = computed<MarkdownView | undefined>(() => {
    const path = comparison.selectedFile.path;
    if (!isMarkdownFile(path)) {
        return undefined;
    }

    return ui.isMarkdownRendered(path) ? 'rendered' : 'source';
});

function setMarkdownView(view: MarkdownView) {
    if (view !== markdownView.value) {
        ui.toggleMarkdownRendered(comparison.selectedFile.path);
    }
}

// The size gate and the binary notice still win over the rendered view: there is
// no content to render until the gate is cleared.
const showRendered = computed(
    () =>
        markdownView.value === 'rendered' &&
        !comparison.showDiffGate &&
        !comparison.showImagePreview &&
        !comparison.showBinaryNotice
);

// The editor is shown only when nothing else claims the pane (the size gate, an
// image preview, the binary notice, or the rendered Markdown). Its change count is
// meaningless otherwise.
const showViewer = computed(
    () =>
        !comparison.showDiffGate &&
        !comparison.showImagePreview &&
        !comparison.showBinaryNotice &&
        !showRendered.value
);

// The header labels the two sides split (base | head) or the range unified,
// following the view toggle. An image preview is always split, so it keeps the
// split header regardless of the toggle, which is then a no-op while on an image.
// The rendered Markdown is split too, unless the file exists on one side only.
const splitHeader = computed(() => {
    if (showRendered.value) {
        const pair = comparison.selectedPair;
        return pair.oldContent !== null && pair.newContent !== null;
    }

    return ui.viewMode === 'split' || comparison.showImagePreview;
});

// Change navigation walks the changes within the open file, then crosses into the
// adjacent file at either boundary (issue #2).
function navigate(direction: 'next' | 'prev') {
    // With a text diff on screen, step through this file's changes first. The
    // viewer returns false at the file boundary (or when it has no changes); only
    // then do we cross into the next file. A non-text pane (image, binary, or the
    // size gate) has no viewer to step through, so we cross straight away.
    if (showViewer.value && diffRef.value) {
        const moved = direction === 'next' ? diffRef.value.next() : diffRef.value.prev();
        if (moved) {
            return;
        }
    }

    // A real switch reloads the pair, and the viewer lands on the near edge once
    // its diff updates (driven by pendingChangeEdge). A single-file set wraps onto
    // itself with no reload, so wrap within the mounted viewer directly.
    const switched = comparison.goToAdjacentFile(direction);
    if (!switched && diffRef.value) {
        diffRef.value.goToEdge(direction === 'next' ? 'first' : 'last');
    }
}

// Open the selected file's working-tree copy in the chosen editor (or OS default).
// Fire-and-forget: a failure (e.g. the file is not in the checked-out tree) is left
// unsurfaced for now.
function openSelected() {
    void comparison.openFile(comparison.selectedFile.path);
}
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <!-- With no file selected (no repo, or a range with no changes), `selectedFile`
             falls back to the empty placeholder, whose blank path and default status
             would otherwise render a stray banner and (M) badge over an empty pane.
             Show the banner only when a real file is selected. -->
        <selection-banner
            v-if="comparison.selectedFile.path"
            :file="comparison.selectedFile"
            :viewed="comparison.isViewed(comparison.selectedFile.path)"
            :change-count="showViewer ? changeCount : 0"
            :markdown-view="markdownView"
            @prev="navigate('prev')"
            @next="navigate('next')"
            @toggle-viewed="comparison.toggleViewed(comparison.selectedFile.path)"
            @open="openSelected"
            @update:markdown-view="setMarkdownView"
        />

        <div
            class="flex h-7 flex-none items-stretch border-b border-moire-border bg-moire-chrome font-mono text-[11px] text-moire-muted"
        >
            <template v-if="splitHeader">
                <div class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                    {{ comparison.base }}
                </div>
                <div class="w-px bg-moire-border" />
                <div class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                    {{ comparison.head }}
                </div>
            </template>
            <div v-else class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                {{ comparison.rangeLabel }}
            </div>
        </div>

        <!-- A large file is held behind a gate so an accidental click can't freeze
             Monaco; picking "Load diff" mounts the editor with the fetched pair. An
             image shows a before/after preview, and any other binary a notice, since
             none of them have a text diff. -->
        <large-file-gate
            v-if="comparison.showDiffGate"
            class="min-h-0 flex-1"
            :size-bytes="comparison.selectedPair.sizeBytes"
            @load="comparison.loadLargeDiff()"
        />
        <image-preview
            v-else-if="comparison.showImagePreview"
            class="min-h-0 flex-1"
            :old-image="comparison.selectedPair.oldImage ?? null"
            :new-image="comparison.selectedPair.newImage ?? null"
        />
        <binary-file-notice v-else-if="comparison.showBinaryNotice" class="min-h-0 flex-1" />
        <markdown-preview
            v-else-if="showRendered"
            class="min-h-0 flex-1"
            :old-source="comparison.selectedPair.oldContent"
            :new-source="comparison.selectedPair.newContent"
        />
        <diff-viewer
            v-else
            ref="diffRef"
            class="min-h-0 flex-1"
            :original="comparison.selectedPair.oldContent"
            :modified="comparison.selectedPair.newContent"
            :language="comparison.selectedPair.language"
            :view-mode="ui.viewMode"
            :is-dark="ui.isDark"
            :code-style="ui.codeStyle"
            :pending-edge="comparison.pendingChangeEdge"
            :review-threads="comparison.threadsForFile(comparison.selectedFile.path)"
            :check-annotations="comparison.annotationsForFile(comparison.selectedFile.path)"
            :reply-to-thread="comparison.replyToReviewThread"
            :set-thread-resolved="comparison.setReviewThreadResolved"
            :can-comment="comparison.canCommentOnLines"
            :add-comment="
                (comment) =>
                    comparison.addReviewComment({
                        ...comment,
                        path: comparison.selectedFile.path,
                    })
            "
            :edit-pending-comment="comparison.editReviewComment"
            :delete-pending-comment="comparison.deleteReviewComment"
            :show-in-pr="ui.showThreadInPr"
            @update:change-count="changeCount = $event"
            @edge-consumed="comparison.clearChangeEdge()"
        />

        <status-bar />
    </div>
</template>
