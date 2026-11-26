import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useStickyHeaderHeights } from '@/composables/useStickyHeaderHeights';

// A ResizeObserver that records what is observed and lets a test fire a resize.
let fire: (target: Element) => void = () => {};
let observed = new Set<Element>();

class FakeResizeObserver {
    constructor(callback: (entries: { target: Element }[]) => void) {
        fire = (target) => callback([{ target }]);
    }
    observe(el: Element) {
        observed.add(el);
    }
    unobserve(el: Element) {
        observed.delete(el);
    }
    disconnect() {
        observed = new Set();
    }
}

function headerOf(height: number): HTMLElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
    return el;
}

function setup() {
    let api!: ReturnType<typeof useStickyHeaderHeights>;
    const wrapper = mount(
        defineComponent({
            setup() {
                api = useStickyHeaderHeights();
                return () => h('div');
            },
        })
    );
    return { api, wrapper };
}

describe('useStickyHeaderHeights', () => {
    beforeEach(() => {
        observed = new Set();
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports zero for a header that is not tracked yet', () => {
        const { api } = setup();
        expect(api.heightOf('comment-1')).toBe(0);
    });

    it('reports a tracked header at its rendered height, and follows a resize', () => {
        const { api } = setup();
        const el = headerOf(40);
        api.track('comment-1')(el);
        fire(el);
        expect(api.heightOf('comment-1')).toBe(40);

        Object.defineProperty(el, 'offsetHeight', { value: 64, configurable: true });
        fire(el);
        expect(api.heightOf('comment-1')).toBe(64);
    });

    it('keeps observing an element through a null ref call, as Vue makes one before each render', () => {
        const { api } = setup();
        const el = headerOf(40);
        api.track('comment-1')(el);
        api.track('comment-1')(null);
        expect(observed.has(el)).toBe(true);
    });

    it('drops the old element when a key is given a new one', () => {
        const { api } = setup();
        const first = headerOf(40);
        const second = headerOf(50);
        api.track('comment-1')(first);
        api.track('comment-1')(second);
        expect(observed.has(first)).toBe(false);
        expect(observed.has(second)).toBe(true);
    });

    it('stops observing when its component unmounts', () => {
        const { api, wrapper } = setup();
        api.track('comment-1')(headerOf(40));
        expect(observed.size).toBe(1);
        wrapper.unmount();
        expect(observed.size).toBe(0);
    });
});
