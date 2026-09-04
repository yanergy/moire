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

// Render Markdown source to an HTML string. Empty or missing input yields an
// empty string so callers can treat "no description" uniformly.
export function renderMarkdown(source: string | null | undefined): string {
    return source ? md.render(source) : '';
}
