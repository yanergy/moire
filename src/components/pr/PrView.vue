<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import {
    ArrowRight,
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
} from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { renderMarkdown } from '@/lib/markdown';
import { timeSince } from '@/lib/status-bar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

const comments = computed(() => pr.value?.comments ?? []);

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

function openOnGitHub() {
    if (pr.value?.url) {
        void window.api?.openExternal(pr.value.url);
    }
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
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-7 shrink-0 gap-1.5 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            @click="openOnGitHub"
                        >
                            <ExternalLink :size="14" />
                            GitHub
                        </Button>
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
                <div class="flex flex-none gap-0.5 border-b border-moire-border px-3 py-2">
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

                <div class="p-4">
                    <!-- Conversation timeline. Each entry has an avatar column with a
                         connector line linking it to the next, as in the design. -->
                    <div v-if="activeTab === 'conversation'">
                        <!-- The PR's merge state leads the tab. -->
                        <pr-status-box :status="mergeStatus" />

                        <!-- The description reads as the first entry. -->
                        <div class="flex gap-3">
                            <div class="flex w-6 shrink-0 flex-col items-center gap-1.5">
                                <user-avatar :login="pr.author" :size="24" />
                                <span v-if="comments.length" class="w-px flex-1 bg-moire-border" />
                            </div>
                            <div class="min-w-0 flex-1 pb-5">
                                <div class="rounded-lg border border-moire-border bg-moire-app">
                                    <div
                                        class="flex flex-wrap items-center gap-1.5 border-b border-moire-border px-3.5 py-2.5 text-[13px] text-moire-faint"
                                    >
                                        <span class="text-[14px] font-medium text-moire-fg">
                                            {{ pr.author }}
                                        </span>
                                        <span>opened the description</span>
                                    </div>
                                    <div class="px-3.5 py-3">
                                        <!-- v-html is safe here: renderMarkdown escapes raw HTML and
                                         rejects unsafe link schemes (see lib/markdown). -->
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

                        <!-- Comments and review verdicts as timeline rows. -->
                        <div v-for="(comment, i) in comments" :key="i" class="flex gap-3">
                            <div class="flex w-6 shrink-0 flex-col items-center gap-1.5">
                                <user-avatar :login="comment.author" :size="24" />
                                <span
                                    v-if="i < comments.length - 1"
                                    class="w-px flex-1 bg-moire-border"
                                />
                            </div>
                            <div class="flex min-w-0 flex-1 flex-col gap-2 pb-5">
                                <div
                                    class="flex flex-wrap items-center gap-1.5 text-[13px] text-moire-faint"
                                >
                                    <span class="text-[14px] font-medium text-moire-fg">
                                        {{ comment.author }}
                                    </span>
                                    <span :class="verb(comment).cls">{{ verb(comment).text }}</span>
                                    <span>{{ relative(comment.createdAt) }}</span>
                                </div>
                                <div
                                    v-if="comment.body.trim()"
                                    class="pr-markdown rounded-lg border border-moire-border bg-moire-app px-3.5 py-2.5 text-[14px] leading-[1.6] text-moire-file-fg"
                                    @click="onBodyClick"
                                    v-html="renderMarkdown(comment.body)"
                                />
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
                                <span
                                    v-if="check.detail"
                                    class="shrink-0 text-[11px] text-moire-faint"
                                >
                                    {{ check.detail }}
                                </span>
                            </div>
                        </div>
                        <div v-else class="text-[14px] text-moire-faint italic">
                            No checks have run for this pull request.
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>
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
