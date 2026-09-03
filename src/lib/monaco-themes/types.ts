// Shape of the color data a code style contributes. Monaco color values must be
// hex (#RRGGBB or #RRGGBBAA), so these are flat maps of Monaco color key to hex
// string.
//
// index.ts layers each of these maps over the shared surface (surfaces.ts) for the
// matching mode, so a style normally provides just its diff palette but may also
// override any surface key it needs. The GitHub style overrides the dark canvas
// this way, since its diff colors are tuned to sit over GitHub's near-black
// background rather than Moiré's default --moire-code grey.
export type MonacoColors = Record<string, string>;

export interface CodeStyleTheme {
    dark: MonacoColors;
    light: MonacoColors;
}
