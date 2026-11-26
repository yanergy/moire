import { onBeforeUnmount, reactive } from 'vue';

// Keeps the rendered height of each tracked sticky header, by key, live as its size
// changes. A header that sticks inside another sticky card (a review thread inside
// its comment) uses this to stick below that card's header rather than under it.
//
// Headers are tracked through a template ref function: `track(key)` returns one.
// Vue calls a ref function with null before each re-render, so a null is ignored
// here; the element stays observed until a different one takes its key.
export function useStickyHeaderHeights() {
    const heights = reactive(new Map<string, number>());
    const elements = new Map<string, Element>();
    const keys = new WeakMap<Element, string>();

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const key = keys.get(entry.target);
            if (key === undefined) {
                continue;
            }

            heights.set(key, (entry.target as HTMLElement).offsetHeight);
        }
    });

    function track(key: string) {
        return (el: unknown) => {
            if (!(el instanceof Element) || elements.get(key) === el) {
                return;
            }

            const previous = elements.get(key);
            if (previous) {
                observer.unobserve(previous);
            }

            elements.set(key, el);
            keys.set(el, key);
            observer.observe(el);
        };
    }

    function heightOf(key: string): number {
        return heights.get(key) ?? 0;
    }

    function stop() {
        observer.disconnect();
        elements.clear();
    }

    onBeforeUnmount(stop);

    return { track, heightOf };
}
