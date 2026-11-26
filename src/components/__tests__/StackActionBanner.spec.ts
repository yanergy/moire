import { setActivePinia, createPinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import StackActionBanner from '@/components/pr/StackActionBanner.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useDashboardStore } from '@/stores/dashboard';
import type { StackAction, StackActionEntry } from '@/shared/types';

const entry = (number: number, head: string, base: string, over = {}): StackActionEntry => ({
    number,
    title: `PR ${number}`,
    url: `https://github.com/o/r/pull/${number}`,
    headRefName: head,
    baseRefName: base,
    isDraft: false,
    ...over,
});

const createAction: StackAction = {
    kind: 'create',
    trunk: 'main',
    entries: [entry(1, 'a', 'main'), entry(2, 'b', 'a'), entry(3, 'c', 'b')],
};

const addAction: StackAction = {
    kind: 'add',
    stackNumber: 7,
    top: { number: 10, title: 'PR 10' },
    entries: [entry(3, 'c', 'top')],
};

// The dialog teleports to document.body, so its content is queried there.
const body = () => document.body;

describe('StackActionBanner', () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(() => {
        body().innerHTML = '';
        vi.restoreAllMocks();
    });

    it('renders nothing when there is no stack action', () => {
        const wrapper = mount(StackActionBanner);
        expect(wrapper.find('[data-slot="stack-action"]').exists()).toBe(false);
    });

    it('offers to create a stack for a chain, with the count and the button', () => {
        const store = useComparisonStore();
        store.prStackAction = createAction;
        const wrapper = mount(StackActionBanner);

        expect(wrapper.text()).toContain('3 open PRs build on each other');
        expect(wrapper.find('[data-slot="stack-action-open"]').text()).toBe('Create stack');
    });

    it('previews the chain bottom to top from the trunk before anything is written', async () => {
        const store = useComparisonStore();
        store.prStackAction = createAction;
        store.pullRequest = { number: 2 } as typeof store.pullRequest;
        const apply = vi.spyOn(store, 'applyStackAction');
        const wrapper = mount(StackActionBanner);

        await wrapper.find('[data-slot="stack-action-open"]').trigger('click');
        await flushPromises();

        const preview = body().querySelector('[data-slot="stack-action-preview"]')!;
        expect(preview.textContent).toContain('trunk');
        expect(preview.textContent).toContain('main');
        const rows = [...body().querySelectorAll('[data-slot="stack-action-entry"]')];
        expect(rows.map((r) => r.textContent?.match(/#\d+/)?.[0])).toEqual(['#1', '#2', '#3']);
        expect(rows[1]!.textContent).toContain('This PR');
        expect(apply).not.toHaveBeenCalled();
    });

    it('creates the stack on confirm, then closes and refreshes the dashboard', async () => {
        const store = useComparisonStore();
        store.prStackAction = createAction;
        const dashboard = useDashboardStore();
        const refresh = vi.spyOn(dashboard, 'refresh').mockResolvedValue(true);
        const apply = vi.spyOn(store, 'applyStackAction').mockResolvedValue({ ok: true });
        const wrapper = mount(StackActionBanner);

        await wrapper.find('[data-slot="stack-action-open"]').trigger('click');
        await flushPromises();
        body().querySelector<HTMLButtonElement>('[data-slot="stack-action-confirm"]')!.click();
        await flushPromises();

        expect(apply).toHaveBeenCalledWith(createAction);
        expect(refresh).toHaveBeenCalled();
        expect(body().querySelector('[data-slot="stack-action-preview"]')).toBeNull();
    });

    it("shows GitHub's refusal in the dialog and keeps it open", async () => {
        const store = useComparisonStore();
        store.prStackAction = addAction;
        const dashboard = useDashboardStore();
        const refresh = vi.spyOn(dashboard, 'refresh').mockResolvedValue(true);
        vi.spyOn(store, 'applyStackAction').mockResolvedValue({
            ok: false,
            message: 'gh: Validation Failed (HTTP 422)',
        });
        const wrapper = mount(StackActionBanner);

        await wrapper.find('[data-slot="stack-action-open"]').trigger('click');
        await flushPromises();
        body().querySelector<HTMLButtonElement>('[data-slot="stack-action-confirm"]')!.click();
        await flushPromises();

        expect(body().querySelector('[data-slot="stack-action-error"]')!.textContent).toContain(
            'Validation Failed'
        );
        expect(body().querySelector('[data-slot="stack-action-preview"]')).not.toBeNull();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('offers to add to the stack below, naming the stack top', async () => {
        const store = useComparisonStore();
        store.prStackAction = addAction;
        const wrapper = mount(StackActionBanner);

        expect(wrapper.text()).toContain('can join the stack after #10');
        expect(wrapper.find('[data-slot="stack-action-open"]').text()).toBe('Add to stack');

        await wrapper.find('[data-slot="stack-action-open"]').trigger('click');
        await flushPromises();
        expect(body().textContent).toContain('append these 1 pull requests to the top of stack #7');
        expect(body().querySelector('[data-slot="stack-action-preview"]')!.textContent).toContain(
            '#10'
        );
    });
});
