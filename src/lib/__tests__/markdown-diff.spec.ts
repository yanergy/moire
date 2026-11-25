import { describe, it, expect } from 'vitest';
import { highlightBlockChanges } from '@/lib/markdown-diff';
import { renderMarkdownFile } from '@/lib/markdown';

// The text of the blocks tagged with a class, in order.
function tagged(html: string, cls: string): string[] {
    const holder = document.createElement('template');
    holder.innerHTML = html;
    return [...holder.content.querySelectorAll(`.${cls}`)].map((el) => el.textContent!.trim());
}

function diff(oldSource: string, newSource: string) {
    return highlightBlockChanges(renderMarkdownFile(oldSource), renderMarkdownFile(newSource));
}

describe('highlightBlockChanges', () => {
    it('marks an edited paragraph removed on the left and added on the right', () => {
        const { oldHtml, newHtml } = diff(
            '# Title\n\nOld text.\n\nSame.',
            '# Title\n\nNew text.\n\nSame.'
        );
        expect(tagged(oldHtml, 'pr-md-removed')).toEqual(['Old text.']);
        expect(tagged(newHtml, 'pr-md-added')).toEqual(['New text.']);
    });

    it('marks only an inserted block, not the ones after it', () => {
        const { oldHtml, newHtml } = diff('One.\n\nTwo.', 'One.\n\nInserted.\n\nTwo.');
        expect(tagged(oldHtml, 'pr-md-removed')).toEqual([]);
        expect(tagged(newHtml, 'pr-md-added')).toEqual(['Inserted.']);
    });

    it('compares list items one by one', () => {
        const { oldHtml, newHtml } = diff('- a\n- b\n- c', '- a\n- B\n- c');
        expect(tagged(oldHtml, 'pr-md-removed')).toEqual(['b']);
        expect(tagged(newHtml, 'pr-md-added')).toEqual(['B']);
    });

    it('ignores the shifted task index after an inserted task', () => {
        const { newHtml } = diff('- [ ] one\n- [ ] two', '- [ ] new\n- [ ] one\n- [ ] two');
        expect(tagged(newHtml, 'pr-md-added')).toEqual(['new']);
    });

    it('marks nothing when the versions are the same', () => {
        const { oldHtml, newHtml } = diff('# Same\n\ntext', '# Same\n\ntext');
        expect(tagged(oldHtml, 'pr-md-removed')).toEqual([]);
        expect(tagged(newHtml, 'pr-md-added')).toEqual([]);
    });

    it('numbers each run of changes on both sides', () => {
        const result = diff('A.\n\nb.\n\nC.\n\nd.\n\ne.', 'A.\n\nB.\n\nC.\n\nD.');
        expect(result.changeCount).toBe(2);

        const runs = (html: string) => {
            const holder = document.createElement('template');
            holder.innerHTML = html;
            return [...holder.content.querySelectorAll('[data-change]')].map(
                (el) => `${el.textContent!.trim()}:${el.getAttribute('data-change')}`
            );
        };
        expect(runs(result.oldHtml)).toEqual(['b.:0', 'd.:1', 'e.:1']);
        expect(runs(result.newHtml)).toEqual(['B.:0', 'D.:1']);
    });
});
