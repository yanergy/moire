// Lighten a channel so a dark label color stays legible as text on its own tint.
const lighten = (c: number) => Math.min(c + 45, 235);

// A label pill, tinted from its GitHub color the way the design tones labels: the
// color drives a faint fill, a stronger border, and a lightened, legible text.
// The per-label colors are data, not theme tokens, so they are applied inline.
export function labelStyle(color: string): Record<string, string> {
    const hex = /^[0-9a-f]{6}$/i.test(color) ? color : '888888';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.14)`,
        borderColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
        color: `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`,
    };
}
