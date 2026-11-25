// The click behind the "Copy" button rendered on every Markdown code block (see
// addCopyButtons in lib/markdown). The Markdown is inserted with v-html, so the
// button has no Vue handler of its own; one listener on the window handles them all.

const COPIED_MS = 1500;

// Copy the code block next to a clicked copy button through the preload bridge and
// show "Copied" on the button for a moment. Returns whether the click was on a copy
// button, so a caller can stop treating it as anything else.
export function onCopyCodeClick(event: MouseEvent): boolean {
    const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>(
        'button.pr-copy-code'
    );
    if (!button) {
        return false;
    }

    event.preventDefault();
    const code = button.parentElement?.querySelector('pre')?.textContent ?? '';
    void window.api?.copyText(code.replace(/\n$/, '')).then(() => {
        button.textContent = 'Copied';
        button.dataset.copied = 'true';
        setTimeout(() => {
            button.textContent = 'Copy';
            delete button.dataset.copied;
        }, COPIED_MS);
    });

    return true;
}
