# Mira app icon

Created with the built-in imagegen tool on 2026-09-10. The transparent source is
`mira-mark.png`. Run `node scripts/generate-mira-icons.mjs` to package the source
into the launcher, adaptive foreground/background, monochrome, splash and favicon
assets. Android themed icons use the foreground alpha mask. The opaque background
is warm off-white (`#F7F5F0`).

Generation prompt:

> Use case: logo-brand. Create one final production Android app icon for an app
> named mira, a personal learning and notes app. Minimal refined monoline design:
> a single elegant continuous rounded stroke forming an abstract lowercase m,
> with two softly arched peaks, balanced geometric proportions and a memorable
> silhouette. Dark ink charcoal line on a uniform warm off-white background.
> Center the symbol within the middle 55 percent of a square 1024x1024 canvas,
> ample negative space, medium strong stroke that remains readable at launcher
> size, round line caps. Flat vector-like crisp edges. No letters beyond the
> abstract m symbol, no wordmark, no border, no rounded-square container, no
> shadows, no gradient, no texture, no extra objects. Deliver the actual icon
> artwork, no device mockup.

The display name is **Mira**. The existing package ID, scheme, signing key and
persisted workspace identifiers are retained to support in-place updates.
