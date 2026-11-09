import { describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ScrollJumpButtons from '@/components/pr/ScrollJumpButtons.vue';
import { stubTooltips } from './fixtures';

stubTooltips();

// A scrolling element: a 500px tall view over 3000px of content, scrolled to `top`.
function scroller(top: number, height = 3000) {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', { value: 500 });
    Object.defineProperty(el, 'scrollHeight', { value: height });
    el.scrollTop = top;
    el.scrollTo = vi.fn<(options?: ScrollToOptions) => void>() as unknown as typeof el.scrollTo;
    return el;
}

async function scrollTo(el: HTMLElement, top: number) {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
}

function button(wrapper: VueWrapper, to: 'top' | 'bottom') {
    return wrapper.get(`[data-slot="scroll-to-${to}"]`);
}

// The buttons that are enabled.
function enabled(wrapper: VueWrapper) {
    return (['top', 'bottom'] as const).filter(
        (to) => button(wrapper, to).attributes('disabled') === undefined
    );
}

function mountButtons(target: HTMLElement | null) {
    return mount(ScrollJumpButtons, { props: { target, column: 1040 } });
}

describe('ScrollJumpButtons', () => {
    it('keeps both buttons, enabling each while its end is more than one screen away', async () => {
        const el = scroller(0);
        const wrapper = mountButtons(el);
        expect(enabled(wrapper)).toEqual(['bottom']);

        await scrollTo(el, 400);
        expect(enabled(wrapper)).toEqual(['bottom']);

        await scrollTo(el, 1200);
        expect(enabled(wrapper)).toEqual(['top', 'bottom']);

        // 300px from the bottom (3000 - 2200 - 500).
        await scrollTo(el, 2200);
        expect(enabled(wrapper)).toEqual(['top']);
    });

    it('leaves the buttons out on a view too short for either to be enabled', () => {
        const wrapper = mountButtons(scroller(0, 800));
        expect(wrapper.find('[data-slot="scroll-to-top"]').exists()).toBe(false);
    });

    it('picks up the position of a new target', async () => {
        const wrapper = mountButtons(null);
        expect(wrapper.find('[data-slot="scroll-to-top"]').exists()).toBe(false);

        await wrapper.setProps({ target: scroller(2500) });
        expect(enabled(wrapper)).toEqual(['top']);
    });

    it('scrolls the target to the top and to the bottom', async () => {
        const el = scroller(1200);
        const wrapper = mountButtons(el);
        await scrollTo(el, 1200);

        await button(wrapper, 'top').trigger('click');
        expect(el.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));

        await button(wrapper, 'bottom').trigger('click');
        expect(el.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 3000 }));
    });

    it('labels both buttons', () => {
        const wrapper = mountButtons(scroller(0));
        expect(button(wrapper, 'top').attributes('aria-label')).toBe('Back to top');
        expect(button(wrapper, 'bottom').attributes('aria-label')).toBe('Jump to bottom');
    });
});
