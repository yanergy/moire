<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
    ArrowRight,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Circle,
    CircleAlert,
    CircleCheck,
    CircleDot,
    CircleSlash,
    CircleX,
    ExternalLink,
    GitMerge,
    GitPullRequestClosed,
    GitPullRequestDraft,
    LoaderCircle,
    MoreHorizontal,
    Pencil,
    RefreshCw,
    Trash2,
} from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { renderMarkdown } from '@/lib/markdown';
import { timeSince } from '@/lib/status-bar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import UserAvatar from '@/components/pr/UserAvatar.vue';
import PrStatusBox from '@/components/pr/PrStatusBox.vue';
import type { PrCheckState, PrComment } from '@/shared/types';

// The shape both status boxes share: the Conversation tab's merge state and the
// Checks tab's CI summary. `icon` is a lucide component, `cls` tints the box.
interface StatusBox {
    icon: Component;
    iconCls: string;
    title: string;
    detail: string;
    cls: string;
}

const comparison = useComparisonStore();

const pr = computed(() => comparison.pullRequest);

// Re-fetch the open PR (status, description, conversation, checks) from gh on
// demand, for when it changed on GitHub since the range was last loaded. The
// range is unchanged, so this uses loadPullRequest without the toolbar spinner
// (which is reserved for range changes); a local `refreshing` flag spins just
// this button and guards against overlapping clicks.
// The header's overflow ("...") menu, holding Refresh and Open on GitHub.
const topMenuOpen = ref(false);

const refreshing = ref(false);
async function refreshPr() {
    // Invoked from the header overflow menu; close it so the spinner on the
    // trigger is what reports progress.
    topMenuOpen.value = false;
    if (refreshing.value) {
        return;
    }

    refreshing.value = true;
    try {
        await comparison.loadPullRequest();
    } finally {
        refreshing.value = false;
    }
}

// The PR view is tabbed, as in the design: the description and conversation under
// "Conversation", the CI checks under "Checks". Commits are a planned third tab.
const activeTab = ref<'conversation' | 'checks'>('conversation');

const checks = computed(() => pr.value?.checks ?? []);

// The Checks tab label shows a passed/total summary (only successes count as
// passed, matching the design), e.g. "3/5".
const checksSummary = computed(() => {
    const passed = checks.value.filter((c) => c.state === 'success').length;
    return `${passed}/${checks.value.length}`;
});

// A check row's icon and color. The design colors only success (green) and
// failure (red); the rest stay faint, distinguished by their icon.
function checkVisual(state: PrCheckState): { icon: Component; cls: string } {
    switch (state) {
        case 'success':
            return { icon: CircleCheck, cls: 'text-moire-status-a' };
        case 'failure':
            return { icon: CircleX, cls: 'text-moire-status-d' };
        case 'skipped':
            return { icon: CircleSlash, cls: 'text-moire-faint' };
        case 'neutral':
            return { icon: Circle, cls: 'text-moire-faint' };
        default:
            return { icon: CircleDot, cls: 'text-moire-faint' };
    }
}

// The Checks tab's own status box, summarising the CI run: red when any check
// failed, a neutral note while some are still running, green once all have
// passed. Null when no checks ran (the tab shows its empty state instead).
const checksStatus = computed<StatusBox | null>(() => {
    const list = checks.value;
    if (!list.length) {
        return null;
    }

    const failing = list.filter((c) => c.state === 'failure').length;
    const pending = list.filter((c) => c.state === 'pending').length;
    const passed = list.filter((c) => c.state === 'success').length;
    const passedDetail = `${passed} of ${list.length} passed.`;

    if (failing > 0) {
        return {
            icon: CircleX,
            iconCls: 'text-moire-status-d',
            title: `${failing} ${failing === 1 ? 'check has' : 'checks have'} failed`,
            detail: passedDetail,
            cls: 'border-moire-danger-edge bg-moire-danger',
        };
    }
    if (pending > 0) {
        return {
            icon: CircleDot,
            iconCls: 'text-moire-faint',
            title: `${pending} ${pending === 1 ? 'check is' : 'checks are'} still running`,
            detail: passedDetail,
            cls: 'border-moire-border bg-moire-chrome',
        };
    }
    return {
        icon: CircleCheck,
        iconCls: 'text-moire-status-a',
        title: 'All checks have passed',
        detail: `${list.length} ${list.length === 1 ? 'check' : 'checks'} passed.`,
        cls: 'border-moire-viewed-edge bg-moire-viewed',
    };
});

// The description is Markdown; renderMarkdown returns HTML that is safe to insert
// with v-html (raw tags escaped, unsafe link schemes rejected). See lib/markdown.
const renderedBody = computed(() => renderMarkdown(pr.value?.body));
const hasBody = computed(() => !!pr.value?.body.trim());

// The description folds on its own toggle, and the collapse-all control folds it
// together with the comments.
const descriptionCollapsed = ref(false);

const comments = computed(() => pr.value?.comments ?? []);

// Comments the user has folded down to just their header, keyed by index. The
// conversation is stable within a view and new comments append, so indices stay
// put across a refresh. Folding lets a long thread be skimmed by its headers;
// only comments with a body can fold.
const collapsedComments = ref<Set<number>>(new Set());
function isCollapsed(index: number): boolean {
    return collapsedComments.value.has(index);
}
function toggleCollapsed(index: number) {
    const next = new Set(collapsedComments.value);
    // Set.delete returns false when the index was absent, so add it instead.
    if (!next.delete(index)) {
        next.add(index);
    }

    collapsedComments.value = next;
}

// Indices of comments that have a body, and so can be folded. The collapse/expand-
// all control and its state derive from these.
const collapsibleIndexes = computed(() => {
    const out: number[] = [];
    comments.value.forEach((comment, i) => {
        if (comment.body.trim()) {
            out.push(i);
        }
    });

    return out;
});

// Everything foldable in the conversation: the description (when it has a body)
// plus any comment with a body. Drives whether the collapse-all control shows.
const hasCollapsible = computed(() => hasBody.value || collapsibleIndexes.value.length > 0);

// True only when the description (if foldable) and every foldable comment are
// folded, mirroring the file tree's allCollapsed: it drives the control's icon,
// label, and direction.
const allCollapsed = computed(() => {
    const descriptionFolded = !hasBody.value || descriptionCollapsed.value;
    return (
        hasCollapsible.value &&
        descriptionFolded &&
        collapsibleIndexes.value.every((i) => collapsedComments.value.has(i))
    );
});

// Fold or unfold the whole conversation (the description and every comment) in one
// go. Expands only when it is already all folded, like the file tree's collapse-all.
function toggleAll() {
    if (allCollapsed.value) {
        collapsedComments.value = new Set();
        descriptionCollapsed.value = false;
        return;
    }

    collapsedComments.value = new Set(collapsibleIndexes.value);
    descriptionCollapsed.value = hasBody.value;
}

// --- Edit mode ---
//
// The conversation is read-only until the user turns on edit mode from the header.
// Only then does the composer at the bottom appear and each of the user's own
// comments gain an Edit action. Posting and editing go through the store, which
// writes via gh and re-fetches the PR so the change shows.
const editing = ref(false);

// New-comment composer.
const draft = ref('');
const posting = ref(false);
const postError = ref('');

// The comment currently being edited (its node id), plus its working copy.
const editingId = ref<string | null>(null);
const editDraft = ref('');
const savingEdit = ref(false);
const editError = ref('');

// Per-comment actions ("...") menu: the id of the comment whose menu is open (one
// at a time). The Edit and Delete actions live behind it.
const openMenuId = ref<string | null>(null);

// The comment awaiting a delete confirmation (its node id): its body swaps for an
// inline "Delete this comment?" prompt, so a stray click can't remove it.
const confirmingDeleteId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const deleteError = ref('');

// Leaving edit mode drops any in-progress draft, open editor, delete prompt, menu,
// and error so the view returns cleanly to read-only.
watch(editing, (on) => {
    if (!on) {
        editingId.value = null;
        draft.value = '';
        editDraft.value = '';
        postError.value = '';
        editError.value = '';
        openMenuId.value = null;
        confirmingDeleteId.value = null;
        deleteError.value = '';
    }
});

// A different PR (a branch switch) resets to read-only; its own edit state means
// nothing here.
watch(
    () => pr.value?.number,
    () => {
        editing.value = false;
        topMenuOpen.value = false;
        openMenuId.value = null;
        confirmingDeleteId.value = null;
    }
);

async function submitComment() {
    if (!draft.value.trim() || posting.value) {
        return;
    }

    posting.value = true;
    postError.value = '';
    const result = await comparison.postComment(draft.value);
    posting.value = false;
    if (result.ok) {
        draft.value = '';
        return;
    }

    postError.value = result.message ?? 'Could not post the comment.';
}

// Reveal a folded comment (index i) so an inline editor or delete prompt shows.
function expandComment(index: number) {
    if (collapsedComments.value.has(index)) {
        const next = new Set(collapsedComments.value);
        next.delete(index);
        collapsedComments.value = next;
    }
}

function startEdit(comment: PrComment, index: number) {
    openMenuId.value = null;
    confirmingDeleteId.value = null;
    editingId.value = comment.id;
    editDraft.value = comment.body;
    editError.value = '';
    expandComment(index);
}

function cancelEdit() {
    editingId.value = null;
    editError.value = '';
}

// The comment awaiting deletion, resolved from its id, so the confirmation dialog
// can name and preview it.
const commentPendingDelete = computed(() =>
    comments.value.find((c) => c.id === confirmingDeleteId.value)
);

// Ask before deleting: a menu click only opens the confirmation dialog; nothing is
// removed until it is confirmed.
function startDelete(comment: PrComment) {
    openMenuId.value = null;
    editingId.value = null;
    deleteError.value = '';
    confirmingDeleteId.value = comment.id;
}

function cancelDelete() {
    confirmingDeleteId.value = null;
    deleteError.value = '';
}

async function confirmDelete(commentId: string) {
    if (!commentId || deletingId.value) {
        return;
    }

    deletingId.value = commentId;
    deleteError.value = '';
    const result = await comparison.deleteComment(commentId);
    deletingId.value = null;
    if (result.ok) {
        confirmingDeleteId.value = null;
        return;
    }

    deleteError.value = result.message ?? 'Could not delete the comment.';
}

async function saveEdit() {
    const id = editingId.value;
    if (!id || !editDraft.value.trim() || savingEdit.value) {
        return;
    }

    savingEdit.value = true;
    editError.value = '';
    const result = await comparison.editComment(id, editDraft.value);
    savingEdit.value = false;
    if (result.ok) {
        editingId.value = null;
        return;
    }

    editError.value = result.message ?? 'Could not save the edit.';
}

// The PR's creation date, shown as "opened Aug 28" ahead of the change stats as
// in the design. Empty when the timestamp is missing or unparseable.
const openedOn = computed(() => {
    const ms = Date.parse(pr.value?.createdAt ?? '');
    return Number.isNaN(ms)
        ? ''
        : new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
});

// A conversation entry's action verb and its color. Reviews read as a verdict
// (approved green, changes red); plain comments read as "commented".
function verb(comment: PrComment): { text: string; cls: string } {
    if (comment.kind !== 'review') {
        return { text: 'commented', cls: 'text-moire-faint' };
    }

    switch (comment.state) {
        case 'APPROVED':
            return { text: 'approved these changes', cls: 'text-moire-status-a' };
        case 'CHANGES_REQUESTED':
            return { text: 'requested changes', cls: 'text-moire-status-d' };
        default:
            return { text: 'reviewed', cls: 'text-moire-faint' };
    }
}

function relative(iso: string): string {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? '' : timeSince(ms, Date.now());
}

// Lighten a channel so a dark label color stays legible as text on its own tint.
const lighten = (c: number) => Math.min(c + 45, 235);

// A label pill, tinted from its GitHub color the way the design tones labels: the
// color drives a faint fill, a stronger border, and a lightened, legible text.
// The per-label colors are data, not theme tokens, so they are applied inline.
function labelStyle(color: string): Record<string, string> {
    const hex = /^[0-9a-f]{6}$/i.test(color) ? color : '888888';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.14)`,
        borderColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
        color: `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`,
    };
}

// The Conversation tab's status box, describing the PR's merge state. Draft,
// closed, and merged states read first; otherwise it reflects mergeability.
// UNKNOWN yields no box. `cls` tints the box; `icon` is its colored glyph.
const mergeStatus = computed<StatusBox | null>(() => {
    if (!pr.value) {
        return null;
    }

    const p = pr.value;
    const green = 'border-moire-viewed-edge bg-moire-viewed';
    const red = 'border-moire-danger-edge bg-moire-danger';

    if (p.state === 'MERGED') {
        return {
            icon: GitMerge,
            iconCls: 'text-moire-status-r',
            title: 'Merged',
            detail: '',
            cls: 'border-moire-merged-edge bg-moire-merged',
        };
    }
    if (p.state === 'CLOSED') {
        return {
            icon: GitPullRequestClosed,
            iconCls: 'text-moire-status-d',
            title: 'Closed without merging',
            detail: '',
            cls: red,
        };
    }
    // A draft shows its own provisional box, unless a reviewer has requested
    // changes: that takes over the styling below, which keeps the dashed outline.
    if (p.isDraft && p.reviewDecision !== 'CHANGES_REQUESTED') {
        return {
            icon: GitPullRequestDraft,
            iconCls: 'text-moire-muted',
            title: 'This pull request is still a draft',
            detail: 'Mark it ready for review to merge.',
            // Dashed outline with the same border tone as the draft PR toggle.
            cls: 'border-dashed border-input bg-moire-chrome',
        };
    }
    if (p.mergeable === 'CONFLICTING') {
        return {
            icon: CircleAlert,
            iconCls: 'text-moire-status-d',
            title: 'This branch has conflicts that must be resolved',
            detail: '',
            cls: red,
        };
    }
    // Changes requested outranks the draft box and the plain "mergeable" state
    // (and shows even when mergeability is unknown), but not a hard conflict above.
    if (p.reviewDecision === 'CHANGES_REQUESTED') {
        return {
            icon: CircleAlert,
            iconCls: 'text-moire-changes-fg',
            title: 'Changes requested',
            detail: 'A reviewer asked for changes before this can be merged.',
            // A draft keeps its dashed outline; the rest takes the yellow tint.
            cls: p.isDraft
                ? 'border-dashed border-moire-changes-edge bg-moire-changes'
                : 'border-moire-changes-edge bg-moire-changes',
        };
    }
    if (p.mergeable === 'MERGEABLE') {
        return {
            icon: CircleCheck,
            iconCls: 'text-moire-status-a',
            title: 'This branch has no conflicts with the base branch',
            detail: p.mergeStateStatus === 'BLOCKED' ? 'Review or checks are required.' : '',
            cls: green,
        };
    }

    return null;
});

// Open a GitHub URL (the PR, or a check's run) in the user's browser through the
// preload bridge. The main process only opens http(s).
function openExternal(url: string) {
    if (url) {
        void window.api?.openExternal(url);
    }
}

// Open the PR on GitHub from the header overflow menu, closing it first.
function openPrOnGitHub() {
    topMenuOpen.value = false;
    openExternal(pr.value?.url ?? '');
}

// A link inside any rendered Markdown opens in the browser rather than navigating
// the app window. The main process only opens http(s).
function onBodyClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) {
        return;
    }

    event.preventDefault();
    void window.api?.openExternal(href);
}
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <ScrollArea v-if="pr" class="pr-scroll-area min-h-0 flex-1">
            <div class="w-full max-w-[1040px]">
                <!-- Header -->
                <div class="border-b border-moire-border px-4 pt-4 pb-4">
                    <div class="flex items-start gap-3">
                        <div
                            class="min-w-0 flex-1 text-[18px] leading-[1.35] font-bold text-moire-fg"
                        >
                            {{ pr.title }}
                            <span class="font-normal text-moire-faint">#{{ pr.number }}</span>
                        </div>
                        <div class="flex shrink-0 items-center gap-1.5">
                            <!-- The conversation is read-only until this is on; then the
                                 composer and per-comment Edit actions appear. -->
                            <Toggle
                                variant="outline"
                                size="sm"
                                :model-value="editing"
                                class="h-7 gap-1.5 border border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=on]:bg-moire-hover data-[state=on]:text-moire-fg"
                                aria-label="Toggle edit mode"
                                title="Edit mode: post and edit comments"
                                @update:model-value="editing = $event"
                            >
                                <!-- Checkbox look borrowed from the diff viewer's "Mark
                                     viewed" button: a bordered square that fills with a
                                     check when on, so the state is unmistakable. Kept
                                     neutral (filled with the foreground, not an accent),
                                     matching this toggle's neutral pressed state. Not the
                                     real Checkbox primitive: it renders a button, and a
                                     button inside this Toggle would be invalid. -->
                                <span
                                    class="flex size-[15px] shrink-0 items-center justify-center rounded-sm border"
                                    :class="
                                        editing
                                            ? 'border-moire-fg bg-moire-fg text-moire-check-fg'
                                            : 'border-current'
                                    "
                                >
                                    <Check v-if="editing" class="size-[11px]" />
                                </span>
                                Edit mode
                            </Toggle>
                            <!-- Secondary actions (refresh, open on GitHub) tuck into an
                                 overflow menu so the header stays uncluttered. While a
                                 refresh runs, the trigger shows the spinner in place of
                                 the "..." glyph. -->
                            <Popover :open="topMenuOpen" @update:open="topMenuOpen = $event">
                                <PopoverTrigger as-child>
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        class="size-7 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                                        aria-label="More actions"
                                        title="More actions"
                                    >
                                        <RefreshCw
                                            v-if="refreshing"
                                            :size="16"
                                            class="animate-spin"
                                        />
                                        <MoreHorizontal v-else :size="16" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    align="end"
                                    :side-offset="6"
                                    class="w-48 overflow-hidden border-moire-border bg-moire-pop p-0"
                                    :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
                                >
                                    <Command class="bg-transparent">
                                        <CommandList>
                                            <CommandGroup>
                                                <CommandItem
                                                    value="refresh"
                                                    aria-label="Refresh pull request"
                                                    class="gap-2 text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                                                    @select="refreshPr"
                                                >
                                                    <RefreshCw
                                                        :size="14"
                                                        class="shrink-0 text-moire-faint"
                                                    />
                                                    <span class="flex-1">Refresh</span>
                                                </CommandItem>
                                                <CommandItem
                                                    value="github"
                                                    class="gap-2 text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                                                    @select="openPrOnGitHub"
                                                >
                                                    <ExternalLink
                                                        :size="14"
                                                        class="shrink-0 text-moire-faint"
                                                    />
                                                    <span class="flex-1">Open on GitHub</span>
                                                </CommandItem>
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <!-- who / stats / labels, each on its own line. -->
                    <div class="mt-4 flex flex-col gap-2">
                        <div class="flex flex-wrap items-center gap-2 text-[13px] text-moire-muted">
                            <user-avatar :login="pr.author" :size="20" />
                            <span class="text-moire-fg">{{ pr.author }}</span>
                            <span>
                                wants to merge {{ pr.commitCount }}
                                {{ pr.commitCount === 1 ? 'commit' : 'commits' }} into
                            </span>
                            <span
                                class="rounded bg-moire-hover px-1.5 py-px font-mono text-moire-fg"
                            >
                                {{ pr.baseRefName }}
                            </span>
                            <ArrowRight :size="12" class="text-moire-faint" />
                            <span
                                class="rounded bg-moire-hover px-1.5 py-px font-mono text-moire-fg"
                            >
                                {{ pr.headRefName }}
                            </span>
                        </div>

                        <div class="flex items-center gap-3 text-[13px] text-moire-faint">
                            <span v-if="openedOn">Opened {{ openedOn }}</span>
                            <span class="text-moire-add-fg">+{{ pr.additions }}</span>
                            <span class="text-moire-del-fg">−{{ pr.deletions }}</span>
                            <span
                                >{{ pr.changedFiles }}
                                {{ pr.changedFiles === 1 ? 'file' : 'files' }}</span
                            >
                        </div>

                        <div v-if="pr.labels.length" class="flex flex-wrap gap-1.5">
                            <span
                                v-for="label in pr.labels"
                                :key="label.name"
                                :title="label.description"
                                class="rounded-full border px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap"
                                :style="labelStyle(label.color)"
                            >
                                {{ label.name }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Tabs: the description and conversation, or the CI checks. The
                     counts (comments, passed/total checks) sit faint beside the
                     label, as in the design. -->
                <div
                    class="flex flex-none items-center gap-1.5 border-b border-moire-border px-3 py-2"
                >
                    <!-- Fold or unfold the whole conversation (description and
                         comments) at once, mirroring the file tree's collapse-all. It
                         sits to the left of the tabs, not floating alone at the far
                         right where a lone icon reads as an options menu. Only on the
                         conversation tab, and only when something can fold. -->
                    <Button
                        v-if="activeTab === 'conversation' && hasCollapsible"
                        variant="ghost"
                        size="icon-xs"
                        class="text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                        :aria-label="allCollapsed ? 'Expand all' : 'Collapse all'"
                        :title="allCollapsed ? 'Expand all' : 'Collapse all'"
                        @click="toggleAll"
                    >
                        <ChevronsUpDown v-if="allCollapsed" :size="16" />
                        <ChevronsDownUp v-else :size="16" />
                    </Button>

                    <div class="flex items-center gap-0.5">
                        <button
                            type="button"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12px] font-medium whitespace-nowrap transition-colors"
                            :class="
                                activeTab === 'conversation'
                                    ? 'bg-moire-hover text-moire-fg'
                                    : 'text-moire-muted hover:text-moire-fg'
                            "
                            @click="activeTab = 'conversation'"
                        >
                            Conversation
                            <span v-if="comments.length" class="text-moire-faint">
                                {{ comments.length }}
                            </span>
                        </button>
                        <button
                            type="button"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12px] font-medium whitespace-nowrap transition-colors"
                            :class="
                                activeTab === 'checks'
                                    ? 'bg-moire-hover text-moire-fg'
                                    : 'text-moire-muted hover:text-moire-fg'
                            "
                            @click="activeTab = 'checks'"
                        >
                            <!-- A glance-able roll-up of the checks (same glyphs as the
                                 rows and the summary box), colored even when the tab is
                                 inactive so a failure stands out without opening it. -->
                            <component
                                :is="checksStatus.icon"
                                v-if="checksStatus"
                                :size="13"
                                :class="checksStatus.iconCls"
                            />
                            Checks
                            <span v-if="checks.length" class="text-moire-faint">
                                {{ checksSummary }}
                            </span>
                        </button>
                    </div>
                </div>

                <div class="p-4">
                    <!-- Conversation timeline. Each entry has an avatar column with a
                         connector line linking it to the next, as in the design. -->
                    <div v-if="activeTab === 'conversation'">
                        <!-- The PR's merge state leads the tab. -->
                        <pr-status-box :status="mergeStatus" />

                        <!-- The description reads as the first entry. -->
                        <div class="flex gap-3">
                            <div class="flex w-6 shrink-0 flex-col items-center">
                                <!-- Center the avatar within the header band (h-10, the
                                     header's height) so it lines up with the header's
                                     middle, which reads best when the card is collapsed.
                                     The description has no connector below it; a divider
                                     separates it from the conversation instead. -->
                                <div class="flex h-10 shrink-0 items-center">
                                    <user-avatar :login="pr.author" :size="24" />
                                </div>
                            </div>
                            <div class="min-w-0 flex-1 pb-5">
                                <div class="rounded-lg border border-moire-border bg-moire-app">
                                    <div
                                        class="flex items-center justify-between gap-1.5 px-3.5 py-2.5 text-[13px] text-moire-faint"
                                        :class="{
                                            'border-b border-moire-border': !descriptionCollapsed,
                                        }"
                                    >
                                        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                                            <span class="text-[14px] font-medium text-moire-fg">
                                                {{ pr.author }}
                                            </span>
                                            <span>opened this pull request</span>
                                        </div>
                                        <!-- Fold the description down to its header. Pinned to
                                             the card's right edge; points down to expand, up to
                                             collapse. Only shown when there is a description. -->
                                        <button
                                            v-if="hasBody"
                                            type="button"
                                            class="-mr-1 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-moire-faint transition-colors hover:bg-moire-hover hover:text-moire-fg"
                                            :aria-expanded="!descriptionCollapsed"
                                            :aria-label="
                                                descriptionCollapsed
                                                    ? 'Expand description'
                                                    : 'Collapse description'
                                            "
                                            @click="descriptionCollapsed = !descriptionCollapsed"
                                        >
                                            <!-- Same disclosure as the file tree: down when
                                                 open, right when collapsed. -->
                                            <ChevronDown v-if="!descriptionCollapsed" :size="14" />
                                            <ChevronRight v-else :size="14" />
                                        </button>
                                    </div>
                                    <div v-if="!descriptionCollapsed" class="px-3.5 py-3">
                                        <!-- v-html is safe here: renderMarkdown sanitizes the
                                         output through DOMPurify (see lib/markdown). -->
                                        <div
                                            v-if="hasBody"
                                            class="pr-markdown text-[14px] leading-[1.6] text-moire-file-fg"
                                            @click="onBodyClick"
                                            v-html="renderedBody"
                                        />
                                        <div v-else class="text-[14px] text-moire-faint italic">
                                            No description provided.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Separate the description from the conversation below it with a
                             labelled rule spanning the full conversation width. Padding, not
                             margin, for the gap below: the project's unlayered
                             `* { margin: 0 }` reset zeroes margin utilities. The flanking
                             spans are the rule, split around the centred label. -->
                        <div
                            v-if="comments.length"
                            class="flex items-center gap-2.5 pb-5 text-[11px] font-medium tracking-wide text-moire-faint uppercase"
                        >
                            <span class="h-px flex-1 bg-moire-border" />
                            Comments
                            <span class="h-px flex-1 bg-moire-border" />
                        </div>

                        <!-- Conversation entries. One with a body renders as a card
                             matching the description (header bar, then body); a bare
                             review verdict stays a compact one-line row, as on GitHub. -->
                        <div v-for="(comment, i) in comments" :key="i" class="flex gap-3">
                            <div class="flex w-6 shrink-0 flex-col items-center">
                                <!-- Center the avatar in the header band so it lines up
                                     with the header's middle, with an equal margin above
                                     and below (no extra gap before the connector line). A
                                     card header is h-10; a bare verdict is a single h-6
                                     line. -->
                                <div
                                    class="flex shrink-0 items-center"
                                    :class="comment.body.trim() ? 'h-10' : 'h-6'"
                                >
                                    <user-avatar :login="comment.author" :size="24" />
                                </div>
                                <span
                                    v-if="i < comments.length - 1"
                                    class="w-px flex-1 bg-moire-border"
                                />
                            </div>
                            <div class="min-w-0 flex-1 pb-5">
                                <div
                                    v-if="comment.body.trim()"
                                    class="rounded-lg border border-moire-border bg-moire-app"
                                >
                                    <div
                                        class="flex items-center justify-between gap-1.5 px-3.5 py-2.5 text-[13px] text-moire-faint"
                                        :class="{
                                            'border-b border-moire-border': !isCollapsed(i),
                                        }"
                                    >
                                        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                                            <span class="text-[14px] font-medium text-moire-fg">
                                                {{ comment.author }}
                                            </span>
                                            <span :class="verb(comment).cls">
                                                {{ verb(comment).text }}
                                            </span>
                                            <span>{{ relative(comment.createdAt) }}</span>
                                        </div>
                                        <div class="flex shrink-0 items-center gap-0.5">
                                            <!-- Edit and delete for your own comments, tucked
                                                 behind a "..." menu, and only in edit mode.
                                                 Hidden while this comment is already being
                                                 edited or is awaiting a delete confirmation. -->
                                            <Popover
                                                v-if="
                                                    editing &&
                                                    comment.canEdit &&
                                                    editingId !== comment.id &&
                                                    confirmingDeleteId !== comment.id
                                                "
                                                :open="openMenuId === comment.id"
                                                @update:open="
                                                    openMenuId = $event ? comment.id : null
                                                "
                                            >
                                                <PopoverTrigger as-child>
                                                    <button
                                                        type="button"
                                                        class="inline-flex size-5 cursor-pointer items-center justify-center rounded text-moire-faint transition-colors hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                                                        aria-label="Comment actions"
                                                        title="Comment actions"
                                                    >
                                                        <MoreHorizontal :size="14" />
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    align="end"
                                                    :side-offset="6"
                                                    class="w-44 overflow-hidden border-moire-border bg-moire-pop p-0"
                                                    :style="{
                                                        boxShadow: 'var(--moire-pop-shadow)',
                                                    }"
                                                >
                                                    <Command class="bg-transparent">
                                                        <CommandList>
                                                            <CommandGroup>
                                                                <CommandItem
                                                                    value="edit"
                                                                    aria-label="Edit comment"
                                                                    class="gap-2 text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                                                                    @select="startEdit(comment, i)"
                                                                >
                                                                    <Pencil
                                                                        :size="14"
                                                                        class="shrink-0 text-moire-faint"
                                                                    />
                                                                    <span class="flex-1">Edit</span>
                                                                </CommandItem>
                                                                <CommandItem
                                                                    value="delete"
                                                                    aria-label="Delete comment"
                                                                    class="gap-2 text-xs text-moire-status-d data-[highlighted]:bg-moire-danger data-[highlighted]:text-moire-status-d"
                                                                    @select="startDelete(comment)"
                                                                >
                                                                    <Trash2
                                                                        :size="14"
                                                                        class="shrink-0"
                                                                    />
                                                                    <span class="flex-1">
                                                                        Delete
                                                                    </span>
                                                                </CommandItem>
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                            <!-- Fold this comment down to its header; points
                                                 down to expand, up to collapse (as the file
                                                 tree does). -->
                                            <button
                                                type="button"
                                                class="-mr-1 inline-flex size-5 cursor-pointer items-center justify-center rounded text-moire-faint transition-colors hover:bg-moire-hover hover:text-moire-fg"
                                                :aria-expanded="!isCollapsed(i)"
                                                :aria-label="
                                                    isCollapsed(i)
                                                        ? 'Expand comment'
                                                        : 'Collapse comment'
                                                "
                                                @click="toggleCollapsed(i)"
                                            >
                                                <ChevronDown v-if="!isCollapsed(i)" :size="14" />
                                                <ChevronRight v-else :size="14" />
                                            </button>
                                        </div>
                                    </div>
                                    <div v-if="!isCollapsed(i)" class="px-3.5 py-3">
                                        <!-- Editing this comment: an inline editor in place of
                                             the rendered body. -->
                                        <div
                                            v-if="editingId === comment.id"
                                            class="flex flex-col gap-2"
                                        >
                                            <Textarea
                                                v-model="editDraft"
                                                aria-label="Edit comment body"
                                                class="min-h-24 border-moire-border bg-transparent text-[14px] leading-[1.6] text-moire-file-fg focus-visible:border-moire-ring focus-visible:ring-0"
                                            />
                                            <span
                                                v-if="editError"
                                                class="text-[12px] text-moire-status-d"
                                            >
                                                {{ editError }}
                                            </span>
                                            <div class="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    class="h-7 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                                                    :disabled="savingEdit"
                                                    @click="cancelEdit"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    class="h-7 gap-1.5 bg-moire-submit text-white hover:bg-moire-submit-hover"
                                                    :disabled="!editDraft.trim() || savingEdit"
                                                    @click="saveEdit"
                                                >
                                                    <LoaderCircle
                                                        v-if="savingEdit"
                                                        :size="14"
                                                        class="animate-spin"
                                                    />
                                                    Save
                                                </Button>
                                            </div>
                                        </div>
                                        <div
                                            v-else
                                            class="pr-markdown text-[14px] leading-[1.6] text-moire-file-fg"
                                            @click="onBodyClick"
                                            v-html="renderMarkdown(comment.body)"
                                        />
                                    </div>
                                </div>

                                <!-- A bare review verdict has nothing to fold, so no card
                                     and no chevron. -->
                                <div
                                    v-else
                                    class="flex flex-wrap items-center gap-1.5 text-[13px] text-moire-faint"
                                >
                                    <span class="text-[14px] font-medium text-moire-fg">
                                        {{ comment.author }}
                                    </span>
                                    <span :class="verb(comment).cls">{{ verb(comment).text }}</span>
                                    <span>{{ relative(comment.createdAt) }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- New-comment composer, shown only in edit mode. Indented to the
                             cards' left edge. Posts through the store, which re-fetches so
                             the comment appears. gap, not margin (the unlayered reset). -->
                        <div v-if="editing" class="pl-9">
                            <div class="rounded-lg border border-moire-border bg-moire-app p-3.5">
                                <div class="flex flex-col gap-2.5">
                                    <Textarea
                                        v-model="draft"
                                        placeholder="Add a comment…"
                                        aria-label="Add a comment"
                                        class="min-h-20 border-moire-border bg-transparent text-[14px] leading-[1.6] text-moire-file-fg focus-visible:border-moire-ring focus-visible:ring-0"
                                    />
                                    <span v-if="postError" class="text-[12px] text-moire-status-d">
                                        {{ postError }}
                                    </span>
                                    <div class="flex justify-end">
                                        <Button
                                            size="sm"
                                            class="h-7 gap-1.5 bg-moire-submit text-white hover:bg-moire-submit-hover"
                                            :disabled="!draft.trim() || posting"
                                            @click="submitComment"
                                        >
                                            <LoaderCircle
                                                v-if="posting"
                                                :size="14"
                                                class="animate-spin"
                                            />
                                            Comment
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Checks: a summary of the CI run, then one row per check
                         (status glyph, name, faint detail), or an empty state. -->
                    <div v-else-if="activeTab === 'checks'">
                        <div v-if="checks.length">
                            <pr-status-box :status="checksStatus" />
                            <div
                                v-for="(check, i) in checks"
                                :key="i"
                                class="flex items-center gap-2.5 border-b border-moire-border py-[11px]"
                            >
                                <component
                                    :is="checkVisual(check.state).icon"
                                    :size="14"
                                    class="shrink-0"
                                    :class="checkVisual(check.state).cls"
                                />
                                <span class="min-w-0 flex-1 truncate text-[12.5px] text-moire-fg">
                                    {{ check.name }}
                                </span>
                                <!-- Detail and the Details button share a wider gap
                                     so the duration reads apart from the button.
                                     (gap, not a margin: the unlayered reset kills
                                     margin utilities.) -->
                                <div
                                    v-if="check.detail || check.url"
                                    class="flex shrink-0 items-center gap-4"
                                >
                                    <span v-if="check.detail" class="text-[11px] text-moire-faint">
                                        {{ check.detail }}
                                    </span>
                                    <!-- Opens this check's run on GitHub (the failing
                                         one is where you go to read the logs). -->
                                    <button
                                        v-if="check.url"
                                        type="button"
                                        class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-moire-muted transition-colors hover:bg-moire-hover hover:text-moire-fg"
                                        title="View this check on GitHub"
                                        @click="openExternal(check.url)"
                                    >
                                        <ExternalLink :size="12" />
                                        Details
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div v-else class="text-[14px] text-moire-faint italic">
                            No checks have run for this pull request.
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>

        <!-- Delete confirmation. A modal, deliberately outside the comment card, so
             the destructive action reads clearly and is not mistaken for part of the
             thread. Closing it (Cancel, Esc, or the backdrop) leaves the comment be. -->
        <Dialog
            :open="confirmingDeleteId !== null"
            @update:open="
                (open) => {
                    if (!open) cancelDelete();
                }
            "
        >
            <DialogContent
                :show-close-button="false"
                class="gap-0 border-moire-border bg-moire-pop p-0 text-moire-fg sm:max-w-md"
                :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
            >
                <div class="flex flex-col gap-3 p-5">
                    <div class="flex items-center gap-2.5">
                        <span
                            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-moire-danger text-moire-status-d"
                        >
                            <Trash2 :size="16" />
                        </span>
                        <DialogTitle class="text-[15px] font-semibold text-moire-fg">
                            Delete comment
                        </DialogTitle>
                    </div>
                    <DialogDescription class="text-[13px] leading-[1.5] text-moire-muted">
                        This permanently deletes your comment on GitHub. It cannot be undone.
                    </DialogDescription>
                    <!-- A preview of the comment being deleted, so it is clear which one. -->
                    <div
                        v-if="commentPendingDelete"
                        class="overflow-hidden rounded-md border border-moire-border bg-moire-app px-3 py-2 text-[13px] leading-[1.5] text-moire-file-fg"
                    >
                        <span class="line-clamp-3 whitespace-pre-wrap">
                            {{ commentPendingDelete.body }}
                        </span>
                    </div>
                    <span v-if="deleteError" class="text-[12px] text-moire-status-d">
                        {{ deleteError }}
                    </span>
                </div>
                <DialogFooter class="gap-2 border-t border-moire-border px-5 py-3.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-8 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                        :disabled="deletingId !== null"
                        @click="cancelDelete"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        class="h-8 gap-1.5 bg-moire-status-d text-white hover:bg-moire-status-d/90"
                        :disabled="deletingId !== null"
                        @click="confirmDelete(confirmingDeleteId ?? '')"
                    >
                        <LoaderCircle v-if="deletingId !== null" :size="14" class="animate-spin" />
                        Delete comment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<!-- Unscoped: reka's scroll viewport wraps the slot in a width-less block (only
     min-width: fit-content), so it shrink-wraps to the content and leaves no room
     to center within. Force that wrapper full width and center its child with
     flexbox. (Tailwind's mx-auto can't do it here: the project's unlayered
     `* { margin: 0 }` reset overrides the layered margin utility.) Content wider
     than the pane still overflows and scrolls. Keyed to this view's scroll area
     (.pr-scroll-area) so other ScrollAreas are untouched; unscoped because the
     wrapper is reka-internal and carries no scope attribute for :deep to reach. -->
<style>
.pr-scroll-area [data-reka-scroll-area-viewport] > div {
    display: flex;
    width: 100%;
    justify-content: center;
}
</style>

<style scoped>
/* The rendered Markdown bodies (description and comments). Injected via v-html, so
   they carry no scope attribute; :deep reaches them. Element styling leans on the
   --moire-* tokens so it matches the app in both themes. */
:deep(.pr-markdown > *:first-child) {
    margin-top: 0;
}

:deep(.pr-markdown > *:last-child) {
    margin-bottom: 0;
}

:deep(.pr-markdown p) {
    margin: 0 0 10px;
}

:deep(.pr-markdown h1),
:deep(.pr-markdown h2),
:deep(.pr-markdown h3),
:deep(.pr-markdown h4) {
    margin: 16px 0 8px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--moire-fg);
}

:deep(.pr-markdown h1) {
    font-size: 1.35em;
}

:deep(.pr-markdown h2) {
    font-size: 1.2em;
}

:deep(.pr-markdown h3) {
    font-size: 1.08em;
}

:deep(.pr-markdown h4) {
    font-size: 1em;
}

:deep(.pr-markdown ul),
:deep(.pr-markdown ol) {
    margin: 0 0 10px;
    padding-left: 22px;
}

:deep(.pr-markdown li) {
    margin: 3px 0;
}

/* GitHub-style task list: the [ ]/[x] marker becomes a checkbox in place of the
   bullet, pulled left so it aligns where the bullet was (the ul pads 22px). */
:deep(.pr-markdown li.pr-task-item) {
    margin-left: -22px;
    list-style: none;
}

:deep(.pr-markdown .pr-task-checkbox) {
    margin: 0 0.5em 0 0;
    vertical-align: middle;
    accent-color: var(--moire-accent);
}

:deep(.pr-markdown li > ul),
:deep(.pr-markdown li > ol) {
    margin: 3px 0;
}

:deep(.pr-markdown a) {
    color: var(--moire-accent);
    text-decoration: none;
}

:deep(.pr-markdown a:hover) {
    text-decoration: underline;
}

:deep(.pr-markdown code) {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--moire-hover);
    font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
    font-size: 0.9em;
}

:deep(.pr-markdown pre) {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--moire-border);
    border-radius: 6px;
    overflow-x: auto;
    background: var(--moire-chrome);
}

:deep(.pr-markdown pre code) {
    padding: 0;
    border-radius: 0;
    background: transparent;
    font-size: 0.92em;
}

:deep(.pr-markdown blockquote) {
    margin: 0 0 10px;
    padding: 2px 0 2px 12px;
    border-left: 3px solid var(--moire-border);
    color: var(--moire-muted);
}

:deep(.pr-markdown hr) {
    margin: 16px 0;
    border: 0;
    border-top: 1px solid var(--moire-border);
}

:deep(.pr-markdown img) {
    max-width: 100%;
}

:deep(.pr-markdown table) {
    margin: 0 0 12px;
    border-collapse: collapse;
}

:deep(.pr-markdown th),
:deep(.pr-markdown td) {
    padding: 4px 8px;
    border: 1px solid var(--moire-border);
}
</style>
