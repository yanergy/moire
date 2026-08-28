import { vi } from 'vitest';

// jsdom is missing a few browser APIs that reka-ui's floating and portal
// primitives (Popover, Command, Tooltip, ScrollArea) reach for when they mount
// or open their content. Stubbing them lets the component tests drive the real
// shadcn-vue primitives instead of mocking them away.

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

if (!globalThis.matchMedia) {
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
    })) as unknown as typeof globalThis.matchMedia;
}

const proto = Element.prototype as unknown as Record<string, unknown>;
proto.scrollIntoView = vi.fn<() => void>();
proto.hasPointerCapture = vi.fn<() => boolean>(() => false);
proto.setPointerCapture = vi.fn<() => void>();
proto.releasePointerCapture = vi.fn<() => void>();

// vue-virtual-scroller decides which rows are on screen from its own clientHeight;
// jsdom does no layout and reports 0, which would render an empty tree. Report a
// tall viewport for the scroller element only, so the whole change set renders in
// tests, and leave every other element at jsdom's default 0.
Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get(this: Element): number {
        return this.classList?.contains('vue-recycle-scroller') ? 1000 : 0;
    },
});
