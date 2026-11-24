import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { onCopyCodeClick } from '@/lib/copy-code';
import { renderMarkdown } from '@/lib/markdown';

describe('onCopyCodeClick', () => {
    let copyText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

    beforeEach(() => {
        vi.useFakeTimers();
        copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
        window.api = { copyText } as unknown as Window['api'];
        document.body.innerHTML = renderMarkdown('```bash\nnpm install\nnpm run dev\n```');
    });

    afterEach(() => {
        vi.useRealTimers();
        delete window.api;
        document.body.innerHTML = '';
    });

    const click = (target: Element) => {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return onCopyCodeClick(event);
    };

    it("copies the block's code and confirms on the button for a moment", async () => {
        const button = document.querySelector('button.pr-copy-code')!;

        expect(click(button)).toBe(true);
        await vi.waitFor(() => expect(button.textContent).toBe('Copied'));
        expect(copyText).toHaveBeenCalledWith('npm install\nnpm run dev');

        vi.advanceTimersByTime(1500);
        expect(button.textContent).toBe('Copy');
    });

    it('ignores clicks anywhere else', () => {
        expect(click(document.querySelector('pre')!)).toBe(false);
        expect(copyText).not.toHaveBeenCalled();
    });
});
