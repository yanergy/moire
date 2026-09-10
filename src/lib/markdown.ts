import MarkdownIt from 'markdown-it';
import { full as emojiPlugin } from 'markdown-it-emoji';
import DOMPurify from 'dompurify';

// One configured Markdown renderer for pull-request descriptions and comments.
//
// GitHub renders a subset of raw HTML in comments (bot output leans on it heavily:
// <details>/<summary>, tables, <sub>, <b>, ...), so `html: true` passes it through
// rather than dumping the tags as literal text. That HTML is untrusted, so the
// rendered output is run through DOMPurify before any v-html insertion: DOMPurify
// keeps only the allow-listed tags and attributes below and drops everything else
// (script/style/iframe, event handlers, javascript: URLs), which is what makes the
// result safe to insert into the Electron renderer.
//
// `linkify` turns bare URLs into links (common in PR bodies) and `breaks`
// renders single newlines as line breaks, matching how GitHub shows PR text.
const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    typographer: false,
});

// GitHub renders emoji shortcodes (:white_check_mark:, :robot:, :tada:, ...) as
// their emoji, and bot comments lean on them heavily. markdown-it-emoji's `full`
// dataset mirrors GitHub's gemoji set. As an inline rule it only rewrites plain
// text, so a shortcode inside a code span or fenced block stays literal, matching
// GitHub; an unknown shortcode is left untouched. It emits Unicode characters, not
// tags, so the sanitizer allow-list below is unaffected.
md.use(emojiPlugin);

// The HTML the viewer keeps after sanitizing: GitHub's comment formatting set
// (text, lists, tables, collapsible <details>, the usual inline tags) plus the
// disabled <input> the task-list plugin emits. Anything not here is dropped, its
// text kept. Deliberately excludes script/style/iframe/form and svg/math.
const ALLOWED_TAGS = [
    'p',
    'br',
    'hr',
    'div',
    'span',
    'blockquote',
    'pre',
    'code',
    'kbd',
    'samp',
    'var',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'strike',
    'del',
    'ins',
    'mark',
    'small',
    'sub',
    'sup',
    'abbr',
    'cite',
    'dfn',
    'q',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'colgroup',
    'col',
    'details',
    'summary',
    'input',
];

// Attributes kept on the tags above. Links and images carry href/src/title/alt;
// tables use align/colspan/rowspan; the task-list checkbox needs type/checked/
// disabled/class; <details> may be open. DOMPurify still validates href/src URLs
// (javascript:/vbscript: are rejected) and strips every on* event handler.
const ALLOWED_ATTR = [
    'href',
    'title',
    'src',
    'alt',
    'align',
    'colspan',
    'rowspan',
    'span',
    'class',
    'type',
    'checked',
    'disabled',
    'open',
    'start',
    'width',
    'height',
];

// Sanitize rendered HTML down to the allow-list. Kept in one place so every
// v-html string in the PR view goes through the same policy.
function sanitize(html: string): string {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// GitHub task-list support: render "- [ ] item" and "- [x] item" as a checkbox
// plus the item text, the way GitHub shows PR checklists. markdown-it has no
// built-in rule for this. A core rule runs after inline parsing and, for any list
// item whose text begins with the [ ]/[x] marker, strips the marker and prepends
// a checkbox token; the <li> is tagged so the bullet can be dropped in CSS.
//
// The checkbox is always `disabled`, so it is display-only: it cannot be toggled
// or submit anything (the PR view is read-only). Its <input> is on the allow-list
// above, so it survives sanitizing along with the rest of the rendered HTML.
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

// Render Markdown source to a sanitized HTML string. Empty or missing input
// yields an empty string so callers can treat "no description" uniformly.
export function renderMarkdown(source: string | null | undefined): string {
    return source ? sanitize(md.render(source)) : '';
}
