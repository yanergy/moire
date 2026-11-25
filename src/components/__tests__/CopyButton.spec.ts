import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CopyButton from '@/components/controls/CopyButton.vue';
import { stubTooltips } from './fixtures';

stubTooltips();

describe('CopyButton', () => {
    let copyText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

    beforeEach(() => {
        vi.useFakeTimers();
        copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
        window.api = { copyText } as unknown as Window['api'];
    });

    afterEach(() => {
        vi.useRealTimers();
        delete window.api;
    });

    it('copies its text and confirms for a moment', async () => {
        const wrapper = mount(CopyButton, {
            props: { text: 'feature/login', label: 'Copy branch name' },
        });
        const button = wrapper.get('[data-slot="copy-button"]');
        expect(button.attributes('aria-label')).toBe('Copy branch name');

        await button.trigger('click');
        await flushPromises();
        expect(copyText).toHaveBeenCalledWith('feature/login');
        expect(button.attributes('data-copied')).toBe('true');

        vi.advanceTimersByTime(1500);
        await flushPromises();
        expect(button.attributes('data-copied')).toBeUndefined();
    });
});
