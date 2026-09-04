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

    it('escapes raw HTML in the source rather than passing it through', () => {
        const html = renderMarkdown('<script>alert(1)</script>');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('does not emit a javascript: link href', () => {
        const html = renderMarkdown('[click](javascript:alert(1))');
        expect(html).not.toContain('href="javascript:alert(1)"');
    });

    it('renders GitHub task lists as disabled checkboxes', () => {
        const html = renderMarkdown('- [ ] todo\n- [x] done');
        // An unchecked and a checked box, both read-only, with the marker stripped
        // from the visible text.
        expect(html).toContain('type="checkbox" disabled>');
        expect(html).toContain('type="checkbox" disabled checked>');
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
