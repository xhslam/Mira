# mira launcher icon

`mira-launcher-source.png` is the user-supplied artwork. `mira-mark.png` is its
blue symbol isolated on a transparent canvas for Android's adaptive icon and
splash screen. Android supplies the launcher mask. Run
`node scripts/generate-mira-icons.mjs` to regenerate the packaged launcher,
adaptive, themed, splash and favicon resources.

## Agent avatars

`agent-avatars/` contains the ten pixel hedgehog looks from the supplied illustrations.
The transparent PNGs are rasterized at 160 × 160 from Auris's matching
`src/components/nia/nia-character.tsx` artwork.
