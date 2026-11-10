<script setup lang="ts">
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    useTemplateRef,
    watch,
    type Component,
} from 'vue';
import { useEventListener } from '@vueuse/core';
import {
    Bell,
    Check,
    CircleCheck,
    GitBranch,
    GitPullRequest,
    LayoutDashboard,
    LoaderCircle,
    TriangleAlert,
} from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useDashboardStore, type MergedPeriod } from '@/stores/dashboard';
import { useUiStore, type SettingsSection } from '@/stores/ui';
import { NOTIFICATION_TYPES } from '@/lib/dashboard';
import type { DashboardEventKind } from '@/shared/types';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import BranchPicker from '@/components/controls/BranchPicker.vue';
import SegmentedToggle from '@/components/controls/SegmentedToggle.vue';

// The Settings page: the open repository's main and development branch, its
// notification settings and its dashboard settings, kept per repository (so the
// page needs one open), and the PR view's settings, which apply to every one. The notification and dashboard values
// are the main process's, mirrored by the dashboard store.
const comparison = useComparisonStore();
const dashboard = useDashboardStore();
const ui = useUiStore();

const notifications = computed(() => dashboard.notificationSettings);
const notificationsOn = computed(() => notifications.value?.enabled ?? false);

// The picker notes "detected" until a branch is picked here.
const mainDetected = computed(() => !comparison.branchSettings.main);
const developmentDetected = computed(() => comparison.branchSettings.development === undefined);

const MERGED_OPTIONS: { value: MergedPeriod; label: string }[] = [
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
];

// Every change saves right away. The header reports it: "Saving…" while a write
// is in flight (shown for at least MIN_SAVING_MS, so a fast save still reads as
// one), then whether the last one landed.
const MIN_SAVING_MS = 400;
const pendingSaves = ref(0);
const lastSave = ref<'none' | 'saved' | 'failed'>('none');
const saveStatus = computed(() => (pendingSaves.value > 0 ? 'saving' : lastSave.value));

async function save(call: () => Promise<boolean>) {
    pendingSaves.value += 1;
    const [ok] = await Promise.all([
        call(),
        new Promise((resolve) => setTimeout(resolve, MIN_SAVING_MS)),
    ]);
    pendingSaves.value -= 1;
    lastSave.value = ok ? 'saved' : 'failed';
}

function setEvent(kind: DashboardEventKind, on: boolean) {
    void save(() => dashboard.setNotificationSettings({ events: { [kind]: on } }));
}

// The section elements, by key. The template ref names end in "Section" so they
// can never match a setup binding: in a production build the compiler binds a
// template ref to the setup variable of the same name (here `notifications` and
// `dashboard` exist), which breaks rendering for the whole app.
const sections = {
    branches: useTemplateRef<HTMLElement>('branchesSection'),
    notifications: useTemplateRef<HTMLElement>('notificationsSection'),
    dashboard: useTemplateRef<HTMLElement>('dashboardSection'),
    prView: useTemplateRef<HTMLElement>('prViewSection'),
};

// The side menu: one entry per section, in page order.
const NAV: { key: SettingsSection; label: string; icon: Component }[] = [
    { key: 'branches', label: 'Branches', icon: GitBranch },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'prView', label: 'PR view', icon: GitPullRequest },
];

// The section the side menu highlights: the last one whose top has reached the
// top of the view, or the last section once scrolled to the bottom (it may be
// too short to reach the top).
const activeSection = ref<SettingsSection>('branches');
const scroller = useTemplateRef<HTMLElement>('scroller');
const viewport = computed(() =>
    scroller.value?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
);

// How far below a section's scroll position (scroll-mt-3) still counts as there.
const ACTIVE_SLACK_PX = 48;

// While a menu click scrolls the page, the clicked section stays highlighted
// rather than the ones scrolled past (or the last one, when the scroll ends at
// the bottom). Cleared when that scroll ends, or when the user takes over.
let jumpingTo: SettingsSection | null = null;

function updateActiveSection() {
    const view = viewport.value;
    if (!view || jumpingTo) {
        return;
    }

    if (view.scrollTop > 0 && view.scrollTop + view.clientHeight >= view.scrollHeight - 2) {
        activeSection.value = NAV[NAV.length - 1]!.key;
        return;
    }

    const line = view.getBoundingClientRect().top + ACTIVE_SLACK_PX;
    const passed = NAV.filter(
        ({ key }) => (sections[key].value?.getBoundingClientRect().top ?? Infinity) <= line
    );
    activeSection.value = passed[passed.length - 1]?.key ?? 'branches';
}

function stopJumping() {
    jumpingTo = null;
}

useEventListener(viewport, 'scroll', updateActiveSection, { passive: true });
useEventListener(viewport, 'scrollend', stopJumping);
useEventListener(viewport, ['wheel', 'pointerdown', 'keydown'], stopJumping, { passive: true });

// The section just jumped to, outlined for a moment so it is easy to spot.
const HIGHLIGHT_MS = 1200;
const highlighted = ref<SettingsSection | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

function showSection(section: SettingsSection) {
    activeSection.value = section;
    jumpingTo = section;
    sections[section].value?.scrollIntoView({ block: 'start', behavior: 'smooth' });

    highlighted.value = section;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlighted.value = null), HIGHLIGHT_MS);
}

onBeforeUnmount(() => clearTimeout(highlightTimer));

function sectionClass(section: SettingsSection) {
    return [
        'scroll-mt-3 rounded-md ring-offset-[10px] ring-offset-moire-app transition-shadow duration-500',
        highlighted.value === section ? 'ring-2 ring-moire-accent' : '',
    ];
}

// Opened from a page's settings button: show that page's section.
async function scrollToSection() {
    const section = ui.settingsSection;
    if (!section) {
        return;
    }

    await nextTick();
    showSection(section);
}

function load() {
    lastSave.value = 'none';
    if (comparison.repoPath) {
        void dashboard.loadSettings();
    }
}

onMounted(() => {
    load();
    void scrollToSection();
});

watch(() => ui.settingsSection, scrollToSection);
watch(() => comparison.repoPath, load);

// The checkbox look for this page: the accent color when on.
const checkboxClass =
    'size-[15px] rounded-sm border-moire-ring shadow-none data-[state=checked]:border-moire-accent data-[state=checked]:bg-moire-accent data-[state=checked]:text-moire-check-fg';
// Each section groups its settings in bordered panels: one row per setting,
// divided by lines, and the longer checkbox lists as a two column grid.
const panelClass =
    'flex flex-col divide-y divide-moire-border overflow-hidden rounded-lg border border-moire-border bg-moire-chrome';
const rowClass = 'flex min-h-12 items-center gap-3 px-4 py-2.5 text-[13px] text-moire-fg';
const rowHint = 'text-[12px] text-moire-faint';
const gridPanelClass =
    'grid grid-cols-2 gap-x-6 rounded-lg border border-moire-border bg-moire-chrome px-4 py-3';
const gridItemClass = 'flex items-center gap-2.5 py-1.5 text-[13px] text-moire-fg';
const sectionTitle = 'pb-1 text-[15px] font-semibold text-moire-fg';
const sectionHint = 'pb-4 text-[12px] text-moire-muted';
const groupLabel =
    'px-1 pt-6 pb-2 text-[11px] font-medium tracking-wider text-moire-faint uppercase';
</script>

<template>
    <div ref="scroller" class="flex min-h-0 min-w-0 flex-1 flex-col items-center bg-moire-app">
        <div class="flex min-h-0 w-full max-w-[1200px] flex-1 flex-col px-6 pt-8">
            <!-- The title with the repository it applies to underneath, and the
                 save status on the right. -->
            <div class="flex shrink-0 items-center gap-3">
                <div class="flex min-w-0 flex-col gap-0.5">
                    <span class="text-[18px] font-bold text-moire-fg">Settings</span>
                    <span v-if="comparison.repoPath" class="truncate text-[12px] text-moire-muted">
                        Unless a section says otherwise, these settings apply to
                        <span class="font-medium text-moire-fg">{{ comparison.repoName }}</span>
                        only
                    </span>
                </div>
                <div class="flex-1" />
                <span
                    class="flex shrink-0 items-center gap-1.5 text-[12px]"
                    aria-live="polite"
                    data-slot="save-status"
                >
                    <template v-if="saveStatus === 'saving'">
                        <LoaderCircle :size="14" class="animate-spin text-moire-faint" />
                        <span class="text-moire-muted">Saving…</span>
                    </template>
                    <template v-else-if="saveStatus === 'saved'">
                        <CircleCheck :size="14" class="text-moire-status-a" />
                        <span class="text-moire-muted">All changes saved</span>
                    </template>
                    <template v-else-if="saveStatus === 'failed'">
                        <TriangleAlert :size="14" class="text-moire-warn" />
                        <span class="text-moire-warn">Couldn't save the last change</span>
                    </template>
                </span>
            </div>

            <p v-if="!comparison.repoPath" class="py-10 text-[13px] text-moire-muted">
                Settings are kept per repository. Open a repository to change its settings.
            </p>

            <div v-else class="flex min-h-0 flex-1 gap-7 pt-5">
                <nav
                    aria-label="Settings sections"
                    class="flex w-[180px] flex-none flex-col gap-0.5 pt-3"
                >
                    <button
                        v-for="item in NAV"
                        :key="item.key"
                        type="button"
                        data-slot="settings-nav-item"
                        :aria-current="activeSection === item.key ? 'true' : undefined"
                        class="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] focus-visible:ring-2 focus-visible:ring-moire-ring focus-visible:outline-none"
                        :class="
                            activeSection === item.key
                                ? 'bg-moire-sel-row font-medium text-moire-fg'
                                : 'text-moire-muted hover:bg-moire-hover hover:text-moire-fg'
                        "
                        @click="showSection(item.key)"
                    >
                        <component :is="item.icon" :size="15" class="shrink-0" />
                        {{ item.label }}
                    </button>
                </nav>

                <!-- Only the sections scroll; the title and the menu stay put. -->
                <ScrollArea class="settings-scroll-area min-h-0 min-w-0 flex-1">
                    <div class="flex w-full flex-col gap-14 p-3 pb-8">
                        <!-- Branches -->
                        <section ref="branchesSection" :class="sectionClass('branches')">
                            <h2 :class="sectionTitle">Branches</h2>
                            <p :class="sectionHint">
                                Used for the base recommendations, the default base and the Git
                                menu's comparison presets.
                            </p>
                            <div :class="panelClass">
                                <div :class="rowClass">
                                    <div class="flex min-w-0 flex-1 flex-col">
                                        <span>Main branch</span>
                                        <span :class="rowHint">
                                            {{
                                                mainDetected
                                                    ? 'Automatically detected'
                                                    : 'Picked for this repository'
                                            }}
                                        </span>
                                    </div>
                                    <branch-picker
                                        :branches="comparison.branches"
                                        :value="comparison.branchRoles.main ?? null"
                                        label="Main branch"
                                        @select="
                                            (name) =>
                                                name &&
                                                save(() =>
                                                    comparison.setBranchSettings({ main: name })
                                                )
                                        "
                                    />
                                </div>
                                <div :class="rowClass">
                                    <div class="flex min-w-0 flex-1 flex-col">
                                        <span>Development branch</span>
                                        <span :class="rowHint">
                                            {{
                                                developmentDetected
                                                    ? 'Automatically detected'
                                                    : 'Picked for this repository'
                                            }}
                                        </span>
                                    </div>
                                    <branch-picker
                                        :branches="comparison.branches"
                                        :value="comparison.branchRoles.development ?? null"
                                        allow-none
                                        label="Development branch"
                                        @select="
                                            (name) =>
                                                save(() =>
                                                    comparison.setBranchSettings({
                                                        development: name,
                                                    })
                                                )
                                        "
                                    />
                                </div>
                            </div>
                        </section>

                        <!-- Notifications -->
                        <section ref="notificationsSection" :class="sectionClass('notifications')">
                            <h2 :class="sectionTitle">Notifications</h2>
                            <p :class="sectionHint">
                                Native notifications about this repository's pull requests, checked
                                every two minutes while Moiré runs.
                            </p>
                            <template v-if="notifications">
                                <div :class="panelClass">
                                    <label :class="rowClass">
                                        <Checkbox
                                            :model-value="notifications.enabled"
                                            :class="checkboxClass"
                                            @update:model-value="
                                                save(() =>
                                                    dashboard.setNotificationSettings({
                                                        enabled: !!$event,
                                                    })
                                                )
                                            "
                                        >
                                            <Check :size="11" />
                                        </Checkbox>
                                        Enable notifications
                                    </label>
                                    <label :class="[rowClass, notificationsOn ? '' : 'opacity-50']">
                                        <Checkbox
                                            :model-value="notifications.notifyDrafts"
                                            :disabled="!notificationsOn"
                                            :class="checkboxClass"
                                            @update:model-value="
                                                save(() =>
                                                    dashboard.setNotificationSettings({
                                                        notifyDrafts: !!$event,
                                                    })
                                                )
                                            "
                                        >
                                            <Check :size="11" />
                                        </Checkbox>
                                        Notify about draft PRs
                                    </label>
                                    <label :class="[rowClass, notificationsOn ? '' : 'opacity-50']">
                                        <Checkbox
                                            :model-value="notifications.dockBadge"
                                            :disabled="!notificationsOn"
                                            :class="checkboxClass"
                                            @update:model-value="
                                                save(() =>
                                                    dashboard.setNotificationSettings({
                                                        dockBadge: !!$event,
                                                    })
                                                )
                                            "
                                        >
                                            <Check :size="11" />
                                        </Checkbox>
                                        Show the unread count on the dock icon
                                    </label>
                                </div>

                                <h3 :class="groupLabel">Notify me when</h3>
                                <div :class="[gridPanelClass, notificationsOn ? '' : 'opacity-50']">
                                    <label
                                        v-for="type in NOTIFICATION_TYPES"
                                        :key="type.kind"
                                        :class="gridItemClass"
                                    >
                                        <Checkbox
                                            :model-value="notifications.events[type.kind]"
                                            :disabled="!notificationsOn"
                                            :class="checkboxClass"
                                            @update:model-value="setEvent(type.kind, !!$event)"
                                        >
                                            <Check :size="11" />
                                        </Checkbox>
                                        <span
                                            class="size-2 shrink-0 rounded-full"
                                            :class="type.dotClass"
                                        />
                                        {{ type.label }}
                                    </label>
                                </div>
                            </template>
                            <p v-else class="text-[13px] text-moire-muted">Loading the settings…</p>
                        </section>

                        <!-- Dashboard -->
                        <section ref="dashboardSection" :class="sectionClass('dashboard')">
                            <h2 :class="sectionTitle">Dashboard</h2>
                            <p :class="sectionHint">
                                What the Dashboard's overview shows. Whose PRs it counts is picked
                                on the Dashboard itself.
                            </p>
                            <div :class="panelClass">
                                <label :class="rowClass">
                                    <Checkbox
                                        :model-value="dashboard.showDrafts"
                                        :class="checkboxClass"
                                        @update:model-value="
                                            save(() => dashboard.setShowDrafts(!!$event))
                                        "
                                    >
                                        <Check :size="11" />
                                    </Checkbox>
                                    Include draft PRs
                                </label>
                                <div :class="rowClass">
                                    <span class="flex-1">Merged card counts</span>
                                    <segmented-toggle
                                        :options="MERGED_OPTIONS"
                                        bordered
                                        :model-value="dashboard.mergedPeriod"
                                        @update:model-value="
                                            save(() => dashboard.setMergedPeriod($event))
                                        "
                                    />
                                </div>
                            </div>

                            <h3 :class="groupLabel">Cards</h3>
                            <div :class="gridPanelClass">
                                <label
                                    v-for="card in dashboard.cardOptions"
                                    :key="card.key"
                                    :class="gridItemClass"
                                >
                                    <Checkbox
                                        :model-value="card.shown"
                                        :class="checkboxClass"
                                        @update:model-value="
                                            save(() => dashboard.toggleCard(card.key))
                                        "
                                    >
                                        <Check :size="11" />
                                    </Checkbox>
                                    {{ card.label }}
                                </label>
                            </div>
                        </section>

                        <!-- PR view -->
                        <section ref="prViewSection" :class="sectionClass('prView')">
                            <h2 :class="sectionTitle">PR view</h2>
                            <p :class="sectionHint">
                                How the pull request view looks. Applies to every repository.
                            </p>
                            <div :class="panelClass">
                                <label :class="rowClass">
                                    <Checkbox
                                        :model-value="ui.stickyPrHeader"
                                        :class="checkboxClass"
                                        data-slot="sticky-pr-header"
                                        @update:model-value="
                                            save(() => ui.setStickyPrHeader(!!$event))
                                        "
                                    >
                                        <Check :size="11" />
                                    </Checkbox>
                                    <div class="flex min-w-0 flex-1 flex-col">
                                        <span>Sticky header</span>
                                        <span :class="rowHint">
                                            Keep the title, the Review and Edit mode buttons and the
                                            tabs at the top while the conversation scrolls
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </div>
        </div>
    </div>
</template>

<!-- Unscoped for the same reason as the dashboard's (see DashboardView.vue): reka's
     scroll viewport wraps the slot in a width-less block, so force it full width.
     Keyed to this view's scroll area. -->
<style>
.settings-scroll-area [data-reka-scroll-area-viewport] > div {
    display: flex;
    width: 100%;
}
</style>
