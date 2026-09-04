import MarkdownIt from 'markdown-it';

// One configured Markdown renderer for pull-request descriptions.
//
// PR bodies are untrusted, so the output must be safe to insert with v-html:
//   - `html: false` makes markdown-it escape any raw HTML tags in the source
//     (they render as text) rather than pass them through, so an embedded
//     <script> or <img onerror> can never reach the DOM.
//   - markdown-it's default link validation rejects javascript:, vbscript:,
//     file:, and non-image data: URLs, so a crafted link cannot run code.
// Together these mean no separate sanitizer (DOMPurify, etc.) is needed.
//
// `linkify` turns bare URLs into links (common in PR bodies) and `breaks`
// renders single newlines as line breaks, matching how GitHub shows PR text.
const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
});

// GitHub task-list support: render "- [ ] item" and "- [x] item" as a checkbox
// plus the item text, the way GitHub shows PR checklists. markdown-it has no
// built-in rule for this. A core rule runs after inline parsing and, for any list
// item whose text begins with the [ ]/[x] marker, strips the marker and prepends
// a checkbox token; the <li> is tagged so the bullet can be dropped in CSS.
//
// The checkbox is always `disabled`, so it is display-only: it cannot be toggled
// or submit anything (the PR view is read-only). Its HTML is fixed here and never
// built from the source, so this adds no injection surface over `html: false`.
md.use((markdown) => {
    markdown.core.ruler.after('inline', 'task-lists', (state) => {
        const { tokens } = state;
        for (let i = 0; i < tokens.length; i++) {
            const inline = tokens[i]!;
            if (
                inline.type !== 'inline' ||
                tokens[i - 1]?.type !== 'paragraph_open' ||
                tokens[i - 2]?.type !== 'list_item_open'
            ) {
                continue;
            }

            const first = inline.children?.[0];
            if (!first || first.type !== 'text') {
                continue;
            }

            const marker = /^\[([ xX])\](\s+|$)/.exec(first.content);
            if (!marker) {
                continue;
            }

            first.content = first.content.slice(marker[0].length);

            const checkbox = new state.Token('task_checkbox', '', 0);
            checkbox.meta = { checked: marker[1]!.toLowerCase() === 'x' };
            inline.children!.unshift(checkbox);

            tokens[i - 2]!.attrJoin('class', 'pr-task-item');
        }

        return true;
    });

    markdown.renderer.rules.task_checkbox = (tokens, idx) =>
        `<input class="pr-task-checkbox" type="checkbox" disabled${
            tokens[idx]!.meta?.checked ? ' checked' : ''
        }> `;
});

// Render Markdown source to an HTML string. Empty or missing input yields an
// empty string so callers can treat "no description" uniformly.
export function renderMarkdown(source: string | null | undefined): string {
    return source ? md.render(source) : '';
}
