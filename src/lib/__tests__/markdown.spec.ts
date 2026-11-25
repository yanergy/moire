import { describe, it, expect } from 'vitest';
import {
    hasTaskList,
    isMarkdownFile,
    isRelativeUrl,
    renderMarkdown,
    renderMarkdownFile,
    toggleTask,
} from '@/lib/markdown';

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

    it('gives every code block a copy button, fenced or raw HTML', () => {
        const holder = document.createElement('div');
        holder.innerHTML = renderMarkdown('```bash\nls\n```\n\n<pre>raw</pre>\n\n`inline`');
        const blocks = holder.querySelectorAll('.pr-code-block');
        expect(blocks).toHaveLength(2);
        for (const block of blocks) {
            expect(block.querySelector('pre')).not.toBeNull();
            expect(block.querySelector('button.pr-copy-code')?.textContent).toBe('Copy');
        }
    });

    it('drops a button smuggled in through raw HTML', () => {
        expect(renderMarkdown('<button class="pr-copy-code">x</button>')).not.toContain('<button');
    });

    describe('tables', () => {
        const scrollBoxes = (html: string) => {
            const holder = document.createElement('div');
            holder.innerHTML = html;
            return [...holder.querySelectorAll('.pr-table-scroll')];
        };

        it('wraps a Markdown table in a horizontally scrolling box', () => {
            const boxes = scrollBoxes(renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |'));
            expect(boxes).toHaveLength(1);
            expect(boxes[0]!.firstElementChild?.tagName).toBe('TABLE');
            expect(boxes[0]!.children).toHaveLength(1);
        });

        it('wraps a raw HTML table the same way', () => {
            const boxes = scrollBoxes(renderMarkdown('<table><tr><td>1</td></tr></table>'));
            expect(boxes).toHaveLength(1);
            expect(boxes[0]!.firstElementChild?.tagName).toBe('TABLE');
        });

        it('wraps each table once, nested ones included', () => {
            const html = renderMarkdown(
                '<table><tr><td><table><tr><td>in</td></tr></table></td></tr></table>\n\n' +
                    '| a |\n| - |\n| 1 |'
            );
            expect(scrollBoxes(html)).toHaveLength(3);
        });

        it('keeps the text around a table in place', () => {
            const html = renderMarkdown('before\n\n| a |\n| - |\n| 1 |\n\nafter');
            expect(html.indexOf('before')).toBeLessThan(html.indexOf('pr-table-scroll'));
            expect(html.indexOf('after')).toBeGreaterThan(html.indexOf('</table>'));
        });

        it('still strips event handlers from a wrapped table', () => {
            const html = renderMarkdown('<table onclick="alert(1)"><tr><td>1</td></tr></table>');
            expect(html).not.toContain('onclick');
        });
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

    it('numbers task checkboxes by source order and renders them interactive on request', () => {
        // Read-only: every checkbox is disabled, and each carries its 0-based index.
        const readOnly = renderMarkdown('- [ ] a\n- [x] b');
        expect(readOnly).toContain('data-task-index="0"');
        expect(readOnly).toContain('data-task-index="1"');
        expect(readOnly).toContain('disabled');

        // Interactive: the disabled attribute is dropped so the box can be clicked.
        const interactive = renderMarkdown('- [ ] a\n- [x] b', { interactive: true });
        expect(interactive).toContain('data-task-index="0"');
        expect(interactive).not.toContain('disabled');
    });

    it('renders GitHub emoji shortcodes as emoji', () => {
        expect(renderMarkdown(':white_check_mark: passing')).toContain('✅');
        expect(renderMarkdown(':robot:')).toContain('🤖');
        expect(renderMarkdown(':arrow_up_small:')).toContain('🔼');
    });

    it('leaves unknown shortcodes and code-span shortcodes as literal text', () => {
        // A name outside the gemoji set is passed through unchanged.
        expect(renderMarkdown(':not_a_real_emoji:')).toContain(':not_a_real_emoji:');
        // Inside a code span the shortcode is code, not an emoji, as on GitHub.
        const code = renderMarkdown('`:white_check_mark:`');
        expect(code).toContain(':white_check_mark:');
        expect(code).not.toContain('✅');
    });

    it('leaves ordinary list items untouched', () => {
        const html = renderMarkdown('- just an item');
        expect(html).not.toContain('type="checkbox"');
        expect(html).toContain('<li>just an item</li>');
    });

    it("keeps an ordered list's start number, so the markers match the source", () => {
        expect(renderMarkdown('1. one\n2. two')).toContain('<ol>');
        expect(renderMarkdown('3. three\n4. four')).toContain('<ol start="3">');
    });

    it('returns an empty string for empty or missing input', () => {
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown(null)).toBe('');
        expect(renderMarkdown(undefined)).toBe('');
    });
});

describe('toggleTask', () => {
    it('flips the nth marker (0-based, source order) both ways', () => {
        const src = '- [ ] a\n- [x] b';
        expect(toggleTask(src, 0)).toBe('- [x] a\n- [x] b');
        expect(toggleTask(src, 1)).toBe('- [ ] a\n- [ ] b');
    });

    it('counts markers across bullet styles and indentation, leaving the rest intact', () => {
        const src = 'intro\n* [ ] one\n    1. [x] two\n+ [ ] three';
        expect(toggleTask(src, 1)).toBe('intro\n* [ ] one\n    1. [ ] two\n+ [ ] three');
    });

    it('returns null when there is no marker at that index', () => {
        expect(toggleTask('- [ ] only', 1)).toBeNull();
        expect(toggleTask('plain text', 0)).toBeNull();
    });
});

describe('task checkboxes', () => {
    it('wraps each checkbox in a label that widens its click area', () => {
        const holder = document.createElement('div');
        holder.innerHTML = renderMarkdown('- [ ] todo');
        const box = holder.querySelector('input.pr-task-checkbox');
        expect(box?.parentElement?.matches('label.pr-task-hit')).toBe(true);
    });
});

describe('hasTaskList', () => {
    it('finds a task-list item the way toggleTask does', () => {
        expect(hasTaskList('- [ ] todo')).toBe(true);
        expect(hasTaskList('intro\n  * [x] done')).toBe(true);
        expect(hasTaskList('1. [ ] numbered')).toBe(true);
        expect(hasTaskList('- plain item\n[ ] not a list')).toBe(false);
        expect(hasTaskList('')).toBe(false);
    });
});

describe('renderMarkdownFile', () => {
    it('renders without hard line breaks, like a Markdown file on GitHub', () => {
        expect(renderMarkdownFile('one\ntwo')).not.toContain('<br');
        expect(renderMarkdown('one\ntwo')).toContain('<br');
    });

    it('keeps the shared plugins: emoji and task lists', () => {
        expect(renderMarkdownFile(':tada:')).toContain('🎉');
        expect(renderMarkdownFile('- [x] done')).toContain('pr-task-checkbox');
    });

    it('renders task list checkboxes read only', () => {
        expect(renderMarkdownFile('- [ ] todo')).toContain('disabled');
    });

    it('replaces a relative image with its alt text and keeps web images', () => {
        const html = renderMarkdownFile(
            '![Screenshot](./docs/shot.png) ![Badge](https://example.com/badge.svg)'
        );
        expect(html).not.toContain('docs/shot.png');
        expect(html).toContain('Screenshot');
        expect(html).toContain('src="https://example.com/badge.svg"');
    });

    it('returns an empty string for empty input', () => {
        expect(renderMarkdownFile('')).toBe('');
        expect(renderMarkdownFile(null)).toBe('');
    });
});

describe('isRelativeUrl', () => {
    it('tells repository paths from web URLs', () => {
        expect(isRelativeUrl('./docs/a.md')).toBe(true);
        expect(isRelativeUrl('docs/a.png')).toBe(true);
        expect(isRelativeUrl('/docs/a.png')).toBe(true);
        expect(isRelativeUrl('#section')).toBe(true);
        expect(isRelativeUrl('https://example.com')).toBe(false);
        expect(isRelativeUrl('mailto:a@b.c')).toBe(false);
        expect(isRelativeUrl('//cdn.example.com/a.png')).toBe(false);
    });
});

describe('isMarkdownFile', () => {
    it('matches .md and .markdown, case insensitively', () => {
        expect(isMarkdownFile('README.md')).toBe(true);
        expect(isMarkdownFile('docs/guide.markdown')).toBe(true);
        expect(isMarkdownFile('CHANGELOG.MD')).toBe(true);
        expect(isMarkdownFile('src/md.ts')).toBe(false);
        expect(isMarkdownFile('notes.mdx')).toBe(false);
    });
});
