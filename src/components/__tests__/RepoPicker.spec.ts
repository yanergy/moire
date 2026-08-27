import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import RepoPicker from '@/components/controls/RepoPicker.vue';
import { useComparisonStore } from '@/stores/comparison';

const RECENTS = ['/repos/moire', '/work/api-service'];

// A partial window.api stub; RepoPicker only reaches the repo-opening methods.
function stubApi() {
    const api = {
        openRepoDialog: vi
            .fn<() => Promise<string | null>>()
            .mockResolvedValue('/repos/design-system'),
        openRepo: vi.fn<(path: string) => Promise<{ path: string; name: string }>>((path) =>
            Promise.resolve({ path, name: path.split('/').pop() ?? path })
        ),
        getRecentRepos: vi.fn<() => Promise<string[]>>().mockResolvedValue(RECENTS),
        removeRecentRepo: vi.fn<(path: string) => Promise<string[]>>((path) =>
            Promise.resolve(RECENTS.filter((entry) => entry !== path))
        ),
    };
    window.api = api as unknown as Window['api'];
    return api;
}

// The menu is a shadcn-vue Popover + Command teleported to document.body, so
// content assertions query the document rather than the wrapper.
async function open(wrapper: VueWrapper) {
    await wrapper.find('button').trigger('click');
    await flushPromises();
}

const items = () => [...document.querySelectorAll('[data-slot="command-item"]')] as HTMLElement[];
const bodyText = () => document.body.textContent ?? '';

describe('RepoPicker', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete window.api;
        vi.restoreAllMocks();
    });

    function mountPicker() {
        return mount(RepoPicker, { attachTo: document.body, global: { plugins: [pinia] } });
    }

    it('shows a placeholder, then lists recents plus an open action once opened', async () => {
        const api = stubApi();
        const wrapper = mountPicker();
        expect(wrapper.text()).toContain('Select a repository');
        expect(items()).toHaveLength(0);

        await open(wrapper);
        expect(api.getRecentRepos).toHaveBeenCalled();
        expect(bodyText()).toContain('Recent');
        expect(bodyText()).toContain('api-service');
        expect(bodyText()).toContain('Open folder');
    });

    it('opens a recent entry and updates the store', async () => {
        const api = stubApi();
        const store = useComparisonStore();
        const wrapper = mountPicker();
        await open(wrapper);

        items()
            .find((el) => el.textContent?.includes('api-service'))
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(api.openRepo).toHaveBeenCalledWith('/work/api-service');
        expect(store.repoName).toBe('api-service');
    });

    it('removes a recent entry without opening it', async () => {
        const api = stubApi();
        const store = useComparisonStore();
        const wrapper = mountPicker();
        await open(wrapper);

        const apiItem = items().find((el) => el.textContent?.includes('api-service'));
        const remove = apiItem?.querySelector<HTMLElement>(
            'button[aria-label="Remove from recents"]'
        );
        remove?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(api.removeRecentRepo).toHaveBeenCalledWith('/work/api-service');
        expect(api.openRepo).not.toHaveBeenCalled();
        expect(store.repoName).toBe('');
        expect(bodyText()).not.toContain('api-service');
    });

    it('runs the native picker from the open-folder item', async () => {
        const api = stubApi();
        const store = useComparisonStore();
        const wrapper = mountPicker();
        await open(wrapper);

        items()
            .find((el) => el.textContent?.includes('Open folder'))
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(api.openRepoDialog).toHaveBeenCalled();
        expect(api.openRepo).toHaveBeenCalledWith('/repos/design-system');
        expect(store.repoName).toBe('design-system');
    });
});
