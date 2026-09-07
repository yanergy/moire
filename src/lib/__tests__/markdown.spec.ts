import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

describe('renderMarkdown', () => {
    it('renders common Markdown constructs', () => {
        expect(renderMarkdown('## Summary')).toContain('<h2>Summary</h2>');
        expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
        expect(renderMarkdown('- one\n- two')).toContain('<li>one</li>');
        expect(renderMarkdown('`code`')).toContain('<code>code</code>');
        expect(renderMarkdown('```\nblock\n```')).toContain('<pre><code>');
    });

    it('links bare URLs and Markdown links', () => {
        expect(renderMarkdown('see https://example.com')).toContain('href="https://example.com"');
        expect(renderMarkdown('[docs](https://example.com/docs)')).toContain(
            '<a href="https://example.com/docs">docs</a>'
        );
    });

    it('renders the safe subset of raw HTML that GitHub allows', () => {
        // Collapsible sections, tables, and inline tags common in bot comments.
        expect(renderMarkdown('<details><summary>More</summary>body</details>')).toContain(
            '<summary>More</summary>'
        );
        expect(renderMarkdown('<sub>note</sub>')).toContain('<sub>note</sub>');
        expect(renderMarkdown('<b>Lines:</b>')).toContain('<b>Lines:</b>');
        // Table cell attributes the layout relies on are kept.
        expect(renderMarkdown('<table><tr><td align="right">1</td></tr></table>')).toContain(
            'align="right"'
        );
    });

    it('strips dangerous raw HTML: scripts, event handlers, and frames', () => {
        const script = renderMarkdown('<script>alert(1)</script>');
        expect(script).not.toContain('<script');
        expect(script).not.toContain('alert(1)');

        const onerror = renderMarkdown('<img src="x" onerror="alert(1)">');
        expect(onerror).toContain('<img');
        expect(onerror).not.toContain('onerror');

        expect(renderMarkdown('<iframe src="https://evil.test"></iframe>')).not.toContain(
            '<iframe'
        );
    });

    it('drops javascript: URLs from links', () => {
        // A Markdown link with a javascript: target is not turned into a link at
        // all; the text stays inert, so no anchor is emitted.
        expect(renderMarkdown('[click](javascript:alert(1))')).not.toContain('<a ');
        // A raw HTML anchor keeps the element but loses the unsafe href.
        const raw = renderMarkdown('<a href="javascript:alert(1)">x</a>');
        expect(raw).toContain('x');
        expect(raw).not.toContain('javascript:');
    });

    it('renders GitHub task lists as disabled checkboxes', () => {
        const html = renderMarkdown('- [ ] todo\n- [x] done');
        // Two read-only checkboxes survive sanitizing (DOMPurify serializes the
        // boolean attributes as disabled="" / checked="").
        expect(html.match(/class="pr-task-checkbox"/g)).toHaveLength(2);
        expect(html).toContain('type="checkbox"');
        expect(html).toContain('disabled');
        expect(html).toContain('checked');
        // The marker is stripped from the visible text.
        expect(html).toContain('todo');
        expect(html).toContain('done');
        expect(html).not.toContain('[ ]');
        expect(html).not.toContain('[x]');
        // The item is tagged so CSS can drop the bullet.
        expect(html).toContain('class="pr-task-item"');
    });

    it('leaves ordinary list items untouched', () => {
        const html = renderMarkdown('- just an item');
        expect(html).not.toContain('type="checkbox"');
        expect(html).toContain('<li>just an item</li>');
    });

    it('returns an empty string for empty or missing input', () => {
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown(null)).toBe('');
        expect(renderMarkdown(undefined)).toBe('');
    });
});
