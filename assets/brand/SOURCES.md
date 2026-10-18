# Brand assets: sources

Fetched from the race partners' public websites for this private, non-commercial build. The marks are the trademarks
of their owners (see CREDITS.md). Nothing here is redrawn except where noted.

## Lumi (https://www.trylumi.co)

| File | Source | Notes |
| --- | --- | --- |
| `lumi-logo.png` | https://www.trylumi.co/brand/logo.png | The header logo as served (96 x 98). Used at small sizes in the HTML UI. |
| `lumi-mark.svg` | traced from https://www.trylumi.co/apple-icon.png (180 x 180) and `/brand/logo.png` | The site only serves the mark as a small raster, so its shapes were fitted to the official artwork (quarter ellipses and a circle, colours sampled from it: `#73cc9b`, `#d1a7f2`, `#270b41`) to get a resolution-independent copy. |
| `lumi-mark.png` | rasterised from `lumi-mark.svg` at 512 x 512 | Used by the canvas painters (boards, cars). |

The wordmark is not an image on the site: it is the word "lumi" set in Plus Jakarta Sans 700, letter-spacing -0.05em, colour
`#5e3a5f` (from the site's header markup and CSS). The game sets it the same way with the vendored font.

## Intake (https://www.intake.ink)

| File | Source | Notes |
| --- | --- | --- |
| `intake-icon.svg` | https://intake.ink/icon.svg | The site icon (also inlined in the site header). |
| `intake-icon.png` | https://intake.ink/icon | The 512 x 512 PNG icon the site's web manifest lists. |

The wordmark is the word "intake" set in Unbounded 700, letter-spacing -0.04em, colour `#2b211c` next to the icon (site header
markup and CSS). `assets/fonts/Unbounded-latin-var.woff2` is the latin subset of the variable Unbounded the site serves
(https://intake.ink/site-assets/_next/static/immutable/media/b59689b1142d37ce-s.p.3tqbdkkdqajd-.woff2, SIL OFL 1.1).

## Employer logos (shown on intake.ink's programme cards and logo marquee)

Each SVG is the file intake.ink serves at `https://intake.ink/logos/<name>.svg`; each PNG is that SVG rasterised (transparent,
trimmed, 160 px tall) for canvas drawing.

| Files | Source |
| --- | --- |
| `employers/goldman-sachs.svg` / `.png` | https://intake.ink/logos/goldman-sachs.svg |
| `employers/kpmg.svg` / `.png` | https://intake.ink/logos/kpmg.svg |
| `employers/rolls-royce.svg` / `.png` | https://intake.ink/logos/rolls-royce.svg |
| `employers/bank-of-england.svg` / `.png` | https://intake.ink/logos/bank-of-england.svg |
| `employers/jp-morgan.svg` / `.png` | https://intake.ink/logos/jp-morgan.svg |
| `employers/lloyds-banking-group.svg` / `.png` | https://intake.ink/logos/lloyds-banking-group.svg |
| `employers/bae-systems.svg` / `.png` | https://intake.ink/logos/bae-systems.svg |
| `employers/barclays.svg` / `.png` | https://intake.ink/logos/barclays.svg |
| `employers/deloitte.svg` / `.png` | https://intake.ink/logos/deloitte.svg |
| `employers/pwc.svg` / `.png` | https://intake.ink/logos/pwc.svg |
| `employers/ibm.svg` / `.png` | https://intake.ink/logos/ibm.svg |
| `employers/microsoft.svg` / `.png` | https://intake.ink/logos/microsoft.svg |

The site serves about 140 more employer logos under `/logos/`; these twelve are the ones its home and tracker pages feature
(preloaded hero cards and tracker highlights).

## Formula 1 (loading screen, start gantry)

| File | Source | Notes |
| --- | --- | --- |
| `f1/f1-logo.svg` | [File:F1.svg](https://commons.wikimedia.org/wiki/File:F1.svg) via https://commons.wikimedia.org/wiki/Special:FilePath/F1.svg | The official Formula 1 logo (2018-), red `#EE0000`, unmodified. |
| `f1/Saira-wdth.woff2` + `f1/Saira-OFL.txt` | npm `@fontsource-variable/saira@5.3.0` (`files/saira-latin-wdth-normal.woff2`), Saira by Omnibus-Type, SIL OFL 1.1 | The official Formula1 Display face is not freely licensed; Saira at its widest setting (wdth 125) is the closest open face. Declared as "F1 Wide" (css/style.css for the loading screen, a FontFace in js/ads.js for the canvases). |

## Race and team partners (trackside boards, car liveries)

Official logos from Wikimedia Commons, found through each company's Wikidata "logo image" (P154) and downloaded from the Commons file
(the Special:FilePath URL redirects to the same upload). Each file is sanitised (no scripts, metadata or external references) and its
`viewBox` trimmed to the painted bounds with an explicit width/height, so the game can fit it in a box by its true aspect; the artwork
itself is unchanged. Partners with no clean vector on Commons (e.g. the current Aramco wordmark, Crypto.com, INEOS, Snapdragon,
Allwyn, OKX, BWT, TGR, MoneyGram ...) are set as wordmarks in code (js/ads.js `PARTNERS[id].word`).

<!--PARTNER-TABLE-->
