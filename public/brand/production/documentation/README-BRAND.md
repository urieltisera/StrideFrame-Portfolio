# StrideFrame — Brand Pack v1  (HUMAN GATE — not released to engineering)

Copy and integrate only after sign-off. Do not redraw, retype or recolor.

## Canonical assets
- Logo (symbol + wordmark): `vector/logos/strideframe-logo-primary-dark.svg` (dark backgrounds), `...-primary-light.svg` (light backgrounds)
- Wordmark only: `vector/wordmarks/` (dark = white STRIDE + orange FRAME, light = black STRIDE + orange FRAME, white, black). Master = traced Reference B section 02.
- Symbol: `vector/symbols/strideframe-symbol-color.svg` (canonical), `-white`, `-black`
- Watermarks: `vector/watermark/` (full lockup, single colour)
- No compact lockup. Below the minimum logo size, use the symbol alone.

## Symbol
Each frame is a clean, complete quadrilateral ring. No notch, tooth or spur is part of the symbol. Slant follows the approved artwork (~18 deg), not the nominal 12 deg. The white back frame is occluded by the orange front frame silhouette.

## Dark / light
Dark UI (#0F0F0F / #1A1A1A): primary-dark. Light UI: primary-light. Single colour: white or black versions only.

## Monochrome (decision pending)
`strideframe-symbol-white/black.svg` and the watermarks currently use option A (exact master geometry, no gap). Option B (0.2 S separation) is in `vector/symbols/mono-options/` and `vector/watermark/mono-options/`. Record the human choice before shipping.

## Minimum sizes
Symbol 16 px wide. Logo 120 px wide. Wordmark alone 96 px wide.

## Clear space
Symbol: 2 S on all sides (S = frame stroke; see `strideframe-symbol-safe-area.svg`). Logo: 0.5 x wordmark cap height.

## Colors
FRAME ORANGE #FF5500 (frozen) · STRIDE WHITE #FFFFFF · CORE BLACK #0F0F0F · SURFACE DARK #1A1A1A
Contrast: orange on #0F0F0F 5.98:1, on #1A1A1A 5.43:1, on white 3.21:1 (logo/graphics only, never small text). Text on orange buttons: #0F0F0F (5.98:1), not white (3.21:1).

## Favicon / icons
`icons/favicon/favicon.svg` + `favicon.ico` (16/32/48) + PNGs. Apple touch icon is opaque full-bleed. Android/PWA "any" icons are rounded squares. `maskable-icon-512x512.png` keeps the symbol inside the 80% safe circle. Icons use the symbol only, on #0F0F0F. No optical small-size variant; only padding is reduced at 16/32/48 px.

## Wordmark restrictions
Vector paths only. No `<text>`, no fonts, no raster.

## DO NOT
- recreate the wordmark with CSS
- substitute a font for the wordmark
- recolor individual letters
- alter symbol offset
- alter slant
- stretch assets
- change spacing between symbol and wordmark
- redraw the F
- redraw the A
- simplify the symbol without an approved small-size variant

## Known deviations
See `notes.deviations` in `strideframe-brand-manifest.json`.
