import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import RefSelector from '@/components/controls/RefSelector.vue';
import { useComparisonStore } from '@/stores/comparison';
import { BRANCHES, stubTooltips } from '@/components/__tests__/fixtures';

stubTooltips();

// The ref picker is a shadcn-vue Popover + Command. Its list is teleported to
// document.body, so assertions query the document rather than the wrapper.
async function open(wrapper: VueWrapper) {
    await wrapper.find('button').trigger('click');
    await flushPromises();
}

const commandInput = () => document.querySelector('[data-slot="command-input"]');
const listText = () => document.body.textContent ?? '';
const headings = () =>
    [...document.querySelectorAll('[data-slot="ref-group-label"]')].map((el) =>
        el.textContent?.trim()
    );

const groupHeader = (label: string) =>
    [...document.querySelectorAll('[data-slot="ref-group-label"]')]
        .find((el) => el.textContent?.trim() === label)
        ?.closest('[data-slot="ref-group-header"]') as HTMLElement | undefined;

const commandItem = (fullName: string) =>
    document.querySelector(`span[title="${fullName}"]`)?.closest('[data-slot="command-item"]');

const toggleAllButton = () =>
    document.querySelector('[aria-label$="all groups"]') as HTMLElement | null;

const recommendedHeading = () =>
    document.querySelector('[data-slot="command-group-heading"]')?.textContent?.trim();

const headingTexts = () =>
    [...document.querySelectorAll('[data-slot="command-group-heading"]')].map((el) =>
        el.textContent?.trim()
    );

const starButton = (fullName: string) =>
    commandItem(fullName)?.querySelector('[data-slot="ref-favorite"]') as HTMLElement | null;

const itemTitles = () =>
    [...document.querySelectorAll('[data-slot="command-item"] span[title]')].map((el) =>
        el.getAttribute('title')
    );

describe('RefSelector', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // The store starts empty (no repo open), so seed the prototype branch list
    // and a base the way a repo open would before mounting a selector.
    function mountSide(side: 'base' | 'head') {
        const store = useComparisonStore();
        store.branches = BRANCHES;
        store.base = 'main';
        return mount(RefSelector, {
            props: { side },
            attachTo: document.body,
            global: { plugins: [pinia] },
        });
    }

    it('opens the native preset menu on right click, not the picker', async () => {
        const showBranchPickerMenu = vi.fn<(ref: string) => Promise<void>>().mockResolvedValue();
        window.api = { showBranchPickerMenu } as unknown as Window['api'];
        const wrapper = mountSide('base');

        await wrapper.find('button').trigger('contextmenu');
        await flushPromises();

        expect(showBranchPickerMenu).toHaveBeenCalledWith('main');
        expect(commandInput()).toBeNull();
        delete window.api;
    });

    it('shows the current ref and groups branches by prefix on open', async () => {
        const wrapper = mountSide('base');
        expect(wrapper.text()).toContain('main');
        expect(commandInput()).toBeNull();

        await open(wrapper);
        expect(commandInput()).not.toBeNull();
        // Flat branches stay under "Local branches"; prefixed ones get a heading
        // per prefix. (The fixture's remotes are both recommended, so no remote
        // group is left.)
        expect(headings()).toEqual(
            expect.arrayContaining(['Local branches', 'feat', 'fix', 'release'])
        );
        // A grouped branch is displayed as its leaf under the prefix heading.
        const label = document.querySelector(
            '[data-slot="command-item"] span[title="feat/monaco-spike"]'
        );
        expect(label?.textContent).toBe('monaco-spike');
    });

    it('recommends the default and current branches on the base side, listed once', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        // The fixture has origin/develop (detected as the development branch) and
        // no origin/HEAD, so the default branch falls back to origin/main. They sit
        // under a static heading, not a collapsible group header.
        expect(recommendedHeading()).toBe('Recommended');
        expect(headings()).not.toContain('Recommended');
        expect(itemTitles().slice(0, 3)).toEqual(['origin/develop', 'origin/main', 'main']);
        expect(commandItem('origin/main')?.textContent).toContain('default');
        expect(commandItem('main')?.textContent).toContain('current');

        // They are dropped from the lists below, so each appears exactly once.
        expect(itemTitles().filter((title) => title === 'origin/main')).toHaveLength(1);
        expect(itemTitles().filter((title) => title === 'main')).toHaveLength(1);
    });

    it('recommends the development branch picked on the Settings page', async () => {
        const store = useComparisonStore();
        const wrapper = mountSide('base');
        store.branches = [
            { name: 'main', kind: 'local', isCurrent: true },
            { name: 'origin/main', kind: 'remote' },
            { name: 'origin/development', kind: 'remote' },
            { name: 'origin/staging', kind: 'remote' },
        ];
        store.branchSettings = { development: 'origin/staging' };
        await open(wrapper);

        expect(itemTitles().slice(0, 3)).toEqual(['origin/staging', 'origin/main', 'main']);
    });

    it('leads the base recommendations with origin/development', async () => {
        const store = useComparisonStore();
        const wrapper = mountSide('base');
        store.branches = [
            ...BRANCHES,
            { name: 'origin/development', kind: 'remote' },
            { name: 'origin/trunk', kind: 'remote', isDefault: true },
        ];
        await open(wrapper);

        expect(itemTitles().slice(0, 3)).toEqual(['origin/development', 'origin/trunk', 'main']);
        expect(itemTitles().filter((title) => title === 'origin/development')).toHaveLength(1);
    });

    it('recommends the working tree, then the current branch, on the head side', async () => {
        const wrapper = mountSide('head');
        await open(wrapper);

        // The working tree sits under "Recommended", not in a group of its own.
        expect(document.querySelectorAll('[data-slot="command-group-heading"]')).toHaveLength(1);
        expect(recommendedHeading()).toBe('Recommended');
        expect(itemTitles().slice(0, 2)).toEqual(['WORKING TREE', 'main']);
        expect(commandItem('main')?.textContent).toContain('current');
        expect(itemTitles().filter((title) => title === 'main')).toHaveLength(1);
    });

    it('offers the working tree entry only on the head side', async () => {
        const head = mountSide('head');
        await open(head);
        expect(listText()).toContain('WORKING TREE');
        head.unmount();
        document.body.innerHTML = '';

        const base = mountSide('base');
        await open(base);
        expect(listText()).not.toContain('WORKING TREE');
    });

    it('filters the ref list by the search query, matching the full path', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        const input = commandInput() as HTMLInputElement;
        input.value = 'feat';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await flushPromises();

        // The query matches the full ref (feat/monaco-spike), shown as its leaf.
        expect(listText()).toContain('monaco-spike');
        expect(listText()).not.toContain('develop');
    });

    it('picks a grouped ref by its full name and closes the popover', async () => {
        const wrapper = mountSide('base');
        const store = useComparisonStore();
        await open(wrapper);

        const items = [...document.querySelectorAll('[data-slot="command-item"]')] as HTMLElement[];
        const monaco = items.find((el) => el.textContent?.includes('monaco-spike'));
        monaco?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(store.base).toBe('feat/monaco-spike');
        expect(commandInput()).toBeNull();
    });

    it('collapses and expands a group when its header is clicked', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);
        expect(commandItem('feat/monaco-spike')).toBeTruthy();

        groupHeader('feat')?.click();
        await flushPromises();
        expect(commandItem('feat/monaco-spike')).toBeFalsy();

        groupHeader('feat')?.click();
        await flushPromises();
        expect(commandItem('feat/monaco-spike')).toBeTruthy();
    });

    it('keeps a collapsed group searchable, revealing matches on query', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        groupHeader('feat')?.click();
        await flushPromises();
        expect(commandItem('feat/monaco-spike')).toBeFalsy();

        const input = commandInput() as HTMLInputElement;
        input.value = 'monaco';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await flushPromises();

        expect(commandItem('feat/monaco-spike')).toBeTruthy();
    });

    it('collapses and expands every group with the toggle-all button', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        expect(commandItem('develop')).toBeTruthy();
        expect(commandItem('feat/monaco-spike')).toBeTruthy();

        toggleAllButton()?.click();
        await flushPromises();
        expect(commandItem('develop')).toBeFalsy();
        expect(commandItem('feat/monaco-spike')).toBeFalsy();
        // The recommendation has no collapsible header, so it stays visible.
        expect(commandItem('origin/main')).toBeTruthy();

        toggleAllButton()?.click();
        await flushPromises();
        expect(commandItem('develop')).toBeTruthy();
        expect(commandItem('feat/monaco-spike')).toBeTruthy();
    });

    it('stars a branch into a Favorites group below the recommendations', async () => {
        const wrapper = mountSide('base');
        const store = useComparisonStore();
        await open(wrapper);

        expect(headingTexts()).toEqual(['Recommended']);
        starButton('feat/monaco-spike')?.click();
        await flushPromises();

        // Starring does not pick the row or close the popover.
        expect(store.base).toBe('main');
        expect(commandInput()).not.toBeNull();
        expect(store.favoriteBranches).toEqual(['feat/monaco-spike']);

        // The favorite shows its full name under a static heading after the
        // recommendations, and leaves its prefix group so it is listed once.
        expect(headingTexts()).toEqual(['Recommended', 'Favorites']);
        expect(itemTitles().slice(0, 4)).toEqual([
            'origin/develop',
            'origin/main',
            'main',
            'feat/monaco-spike',
        ]);
        expect(commandItem('feat/monaco-spike')?.textContent).toContain('feat/monaco-spike');
        expect(itemTitles().filter((title) => title === 'feat/monaco-spike')).toHaveLength(1);
        expect(starButton('feat/monaco-spike')?.getAttribute('aria-pressed')).toBe('true');

        starButton('feat/monaco-spike')?.click();
        await flushPromises();
        expect(store.favoriteBranches).toEqual([]);
        expect(headingTexts()).toEqual(['Recommended']);
    });

    it('lists the same favorites in the head picker', async () => {
        const store = useComparisonStore();
        store.favoriteBranches = ['develop'];
        const wrapper = mountSide('head');
        await open(wrapper);

        expect(headingTexts()).toEqual(['Recommended', 'Favorites']);
        expect(itemTitles().slice(0, 3)).toEqual(['WORKING TREE', 'main', 'develop']);
        // The working tree is not a branch, so it cannot be starred.
        expect(starButton('WORKING TREE')).toBeNull();
    });

    it('keeps a starred recommendation in the recommendations and skips deleted favorites', async () => {
        const store = useComparisonStore();
        store.favoriteBranches = ['main', 'feature/gone'];
        const wrapper = mountSide('base');
        await open(wrapper);

        expect(headingTexts()).toEqual(['Recommended']);
        expect(starButton('main')?.getAttribute('aria-pressed')).toBe('true');
        expect(itemTitles()).not.toContain('feature/gone');
    });

    it('mounts a large branch list a page at a time, searching all of it', async () => {
        const store = useComparisonStore();
        const wrapper = mountSide('base');
        store.branches = [
            { name: 'main', kind: 'local', isCurrent: true },
            ...Array.from({ length: 500 }, (_, i) => ({
                name: `origin/team/branch-${i}`,
                kind: 'remote' as const,
            })),
        ];
        await open(wrapper);

        const rows = () => document.querySelectorAll('[data-slot="command-item"]').length;
        const shownBefore = rows();
        expect(shownBefore).toBeLessThan(80);
        expect(commandItem('origin/team/branch-499')).toBeFalsy();

        const list = document.querySelector('[data-slot="command-list"]') as HTMLElement;
        list.dispatchEvent(new Event('scroll'));
        await flushPromises();
        expect(rows()).toBeGreaterThan(shownBefore);

        const input = commandInput() as HTMLInputElement;
        input.value = 'branch-499';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await flushPromises();
        expect(itemTitles()).toEqual(['origin/team/branch-499']);
    });

    it('says so when no ref matches the search', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        const input = commandInput() as HTMLInputElement;
        input.value = 'no-such-ref';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await flushPromises();
        expect(document.querySelector('[data-slot="ref-empty"]')).not.toBeNull();
    });

    it('keeps the favorites visible when every group is collapsed', async () => {
        const store = useComparisonStore();
        store.favoriteBranches = ['develop'];
        const wrapper = mountSide('base');
        await open(wrapper);

        toggleAllButton()?.click();
        await flushPromises();
        expect(commandItem('develop')).toBeTruthy();
    });
});
