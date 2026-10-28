import { ref, watch } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import type {
    CodeStyle,
    DiffLayout,
    MainView,
    ThemePreference,
    ThemeState,
    ViewMode,
} from '@/shared/types';
import type { DashboardCategoryKey } from '@/stores/dashboard';

// One page in the back/forward history: the main view and, for the dashboard,
// the card whose PR list is open (null for the overview).
interface Page {
    mainView: MainView;
    dashboardCard: DashboardCategoryKey | null;
}

const MAX_HISTORY = 50;

// View-level preferences. The theme, diff-color palette, and diff layout are owned
// by the Electron main process: `preference` is what the user picked in the View →
// Theme menu ('system' follows the OS), `isDark` is the resolved value main pushes
// over IPC, `codeStyle` is the View → Code Style selection, and `diffLayout` is the
// View → Diff Layout selection. This store only mirrors and applies those; it never
// decides them itself. The split/unified view mode is local renderer state.
export const useUiStore = defineStore('ui', () => {
    const preference = ref<ThemePreference>('system');
    const isDark = ref(true);
    const codeStyle = ref<CodeStyle>('github');
    const diffLayout = ref<DiffLayout>('single');
    const viewMode = ref<ViewMode>('split');
    // Which pane the main area shows: the diff (default), the pull-request view, or
    // the GitHub dashboard. Local renderer state, like viewMode; the PR view is only
    // reachable when a PR is detected for the selected branches (see the comparison
    // store), and the dashboard only while a repository is open.
    const mainView = ref<MainView>('diff');
    // The dashboard card whose PR list is open, or null for the overview grid.
    // Here rather than in the dashboard view so the history can restore it.
    const dashboardCard = ref<DashboardCategoryKey | null>(null);

    // Back/forward history of the visible page, as in a browser (the mouse back
    // and forward buttons step through it). Every page change records the page
    // it leaves and clears the forward stack; stepping through the history moves
    // pages between the two stacks without recording.
    const backStack = ref<Page[]>([]);
    const forwardStack = ref<Page[]>([]);

    function currentPage(): Page {
        return { mainView: mainView.value, dashboardCard: dashboardCard.value };
    }

    function applyPage(page: Page) {
        mainView.value = page.mainView;
        dashboardCard.value = page.dashboardCard;
    }

    function navigate(page: Page) {
        const current = currentPage();
        if (page.mainView === current.mainView && page.dashboardCard === current.dashboardCard) {
            return;
        }

        backStack.value = [...backStack.value, current].slice(-MAX_HISTORY);
        forwardStack.value = [];
        applyPage(page);
    }

    function goBack() {
        const page = backStack.value[backStack.value.length - 1];
        if (!page) {
            return;
        }

        backStack.value = backStack.value.slice(0, -1);
        forwardStack.value = [...forwardStack.value, currentPage()];
        applyPage(page);
    }

    function goForward() {
        const page = forwardStack.value[forwardStack.value.length - 1];
        if (!page) {
            return;
        }

        forwardStack.value = forwardStack.value.slice(0, -1);
        backStack.value = [...backStack.value, currentPage()];
        applyPage(page);
    }

    // Another repository opened: its pages have nothing to do with the old ones.
    function resetNavigation() {
        dashboardCard.value = null;
        backStack.value = [];
        forwardStack.value = [];
    }

    function applyThemeState(state: ThemeState) {
        preference.value = state.preference;
        isDark.value = state.isDark;
    }

    function setCodeStyle(style: CodeStyle) {
        codeStyle.value = style;
    }

    function setDiffLayout(layout: DiffLayout) {
        diffLayout.value = layout;
    }

    function setViewMode(mode: ViewMode) {
        viewMode.value = mode;
    }

    function setMainView(view: MainView) {
        navigate({ ...currentPage(), mainView: view });
    }

    // The dashboard as a fresh visit: its overview, not the last card left open.
    function openDashboard() {
        navigate({ mainView: 'dashboard', dashboardCard: null });
    }

    function setDashboardCard(card: DashboardCategoryKey | null) {
        navigate({ ...currentPage(), dashboardCard: card });
    }

    // The `.dark` class on <html> drives both the Tailwind dark variant and the
    // --moire-* token overrides.
    watch(
        isDark,
        (dark) => {
            document.documentElement.classList.toggle('dark', dark);
        },
        { immediate: true }
    );

    return {
        preference,
        isDark,
        codeStyle,
        diffLayout,
        viewMode,
        mainView,
        dashboardCard,
        applyThemeState,
        setCodeStyle,
        setDiffLayout,
        setViewMode,
        setMainView,
        openDashboard,
        setDashboardCard,
        goBack,
        goForward,
        resetNavigation,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
