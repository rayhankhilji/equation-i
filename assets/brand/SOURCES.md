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
| File | Wikimedia Commons source |
| --- | --- |
| `partners/adidas.svg` | [File:Adidas 2022 logo.svg](https://commons.wikimedia.org/wiki/File:Adidas_2022_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Adidas_2022_logo.svg) |
| `partners/americanexpress.svg` | [File:American Express logo (2018).svg](https://commons.wikimedia.org/wiki/File:American_Express_logo_%282018%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/American_Express_logo_%282018%29.svg) |
| `partners/atlassian.svg` | [File:Atlassian-logo.svg](https://commons.wikimedia.org/wiki/File:Atlassian-logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Atlassian-logo.svg) |
| `partners/att.svg` | [File:AT&T logo 2016.svg](https://commons.wikimedia.org/wiki/File:AT%26T_logo_2016.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/AT%26T_logo_2016.svg) |
| `partners/audi.svg` | [File:Audi-Logo 2016.svg](https://commons.wikimedia.org/wiki/File:Audi-Logo_2016.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Audi-Logo_2016.svg) |
| `partners/aws.svg` | [File:Amazon Web Services Logo.svg](https://commons.wikimedia.org/wiki/File:Amazon_Web_Services_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Amazon_Web_Services_Logo.svg) |
| `partners/bp.svg` | [File:Bp textlogo.svg](https://commons.wikimedia.org/wiki/File:Bp_textlogo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Bp_textlogo.svg) |
| `partners/bwt.svg` | [File:BWT Logo 2024.svg](https://commons.wikimedia.org/wiki/File:BWT_Logo_2024.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/BWT_Logo_2024.svg) |
| `partners/cashapp.svg` | [File:Square Cash app logo.svg](https://commons.wikimedia.org/wiki/File:Square_Cash_app_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Square_Cash_app_logo.svg) |
| `partners/castrol.svg` | [File:Castrol logo 2023.svg](https://commons.wikimedia.org/wiki/File:Castrol_logo_2023.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Castrol_logo_2023.svg) |
| `partners/cevalogistics.svg` | [File:Logo of CEVA Logistics (2023).svg](https://commons.wikimedia.org/wiki/File:Logo_of_CEVA_Logistics_%282023%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Logo_of_CEVA_Logistics_%282023%29.svg) |
| `partners/claro.svg` | [File:Claro logo (2017).svg](https://commons.wikimedia.org/wiki/File:Claro_logo_%282017%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Claro_logo_%282017%29.svg) |
| `partners/claude.svg` | [File:Claude AI logo.svg](https://commons.wikimedia.org/wiki/File:Claude_AI_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Claude_AI_logo.svg) |
| `partners/cognizant.svg` | [File:Cognizant logo 2022.svg](https://commons.wikimedia.org/wiki/File:Cognizant_logo_2022.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Cognizant_logo_2022.svg) |
| `partners/coinbase.svg` | [File:Coinbase.svg](https://commons.wikimedia.org/wiki/File:Coinbase.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Coinbase.svg) |
| `partners/corescientific.svg` | [File:Core Scientific logo.svg](https://commons.wikimedia.org/wiki/File:Core_Scientific_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Core_Scientific_logo.svg) |
| `partners/coreweave.svg` | [File:CoreWeave logo.svg](https://commons.wikimedia.org/wiki/File:CoreWeave_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/CoreWeave_logo.svg) |
| `partners/crowdstrike.svg` | [File:CrowdStrike logo.svg](https://commons.wikimedia.org/wiki/File:CrowdStrike_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/CrowdStrike_logo.svg) |
| `partners/dell.svg` | [File:Dell logo 2016.svg](https://commons.wikimedia.org/wiki/File:Dell_logo_2016.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Dell_logo_2016.svg) |
| `partners/deloitte.svg` | [File:Logo of Deloitte.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Deloitte.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Logo_of_Deloitte.svg) |
| `partners/dhl.svg` | [File:DHL Logo.svg](https://commons.wikimedia.org/wiki/File:DHL_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/DHL_Logo.svg) |
| `partners/dpworld.svg` | [File:DP World 2021 logo.svg](https://commons.wikimedia.org/wiki/File:DP_World_2021_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/DP_World_2021_logo.svg) |
| `partners/duracell.svg` | [File:Duracell logo.svg](https://commons.wikimedia.org/wiki/File:Duracell_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Duracell_logo.svg) |
| `partners/eni.svg` | [File:Eni wordmark.svg](https://commons.wikimedia.org/wiki/File:Eni_wordmark.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Eni_wordmark.svg) |
| `partners/etihadairways.svg` | [File:Etihad-airways-logo.svg](https://commons.wikimedia.org/wiki/File:Etihad-airways-logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Etihad-airways-logo.svg) |
| `partners/ferrari.svg` | [File:Ferrari wordmark.svg](https://commons.wikimedia.org/wiki/File:Ferrari_wordmark.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Ferrari_wordmark.svg) |
| `partners/ford.svg` | [File:Ford logo flat.svg](https://commons.wikimedia.org/wiki/File:Ford_logo_flat.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Ford_logo_flat.svg) |
| `partners/globant.svg` | [File:Globant Logo.svg](https://commons.wikimedia.org/wiki/File:Globant_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Globant_Logo.svg) |
| `partners/googlegemini.svg` | [File:Google Gemini logo 2025.svg](https://commons.wikimedia.org/wiki/File:Google_Gemini_logo_2025.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Google_Gemini_logo_2025.svg) |
| `partners/gulf.svg` | [File:Gulf Oil logo.svg](https://commons.wikimedia.org/wiki/File:Gulf_Oil_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Gulf_Oil_logo.svg) |
| `partners/hardrock.svg` | [File:Hard Rock Cafe Logo.svg](https://commons.wikimedia.org/wiki/File:Hard_Rock_Cafe_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Hard_Rock_Cafe_Logo.svg) |
| `partners/heineken.svg` | [File:Heineken logo.svg](https://commons.wikimedia.org/wiki/File:Heineken_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Heineken_logo.svg) |
| `partners/honda.svg` | [File:Honda logo.svg](https://commons.wikimedia.org/wiki/File:Honda_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Honda_logo.svg) |
| `partners/hp.svg` | [File:HP logo 2025.svg](https://commons.wikimedia.org/wiki/File:HP_logo_2025.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/HP_logo_2025.svg) |
| `partners/ibm.svg` | [File:IBM logo.svg](https://commons.wikimedia.org/wiki/File:IBM_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/IBM_logo.svg) |
| `partners/ineos.svg` | [File:INEOS logo.svg](https://commons.wikimedia.org/wiki/File:INEOS_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/INEOS_logo.svg) |
| `partners/kitkat.svg` | [File:Logo of the KitKat.svg](https://commons.wikimedia.org/wiki/File:Logo_of_the_KitKat.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Logo_of_the_KitKat.svg) |
| `partners/komatsu.svg` | [File:Komatsu company logos.svg](https://commons.wikimedia.org/wiki/File:Komatsu_company_logos.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Komatsu_company_logos.svg) |
| `partners/lenovo.svg` | [File:Lenovo logo (2015 onwards) 2.svg](https://commons.wikimedia.org/wiki/File:Lenovo_logo_%282015_onwards%29_2.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Lenovo_logo_%282015_onwards%29_2.svg) |
| `partners/liquimoly.svg` | [File:Liqui-moly.svg](https://commons.wikimedia.org/wiki/File:Liqui-moly.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Liqui-moly.svg) |
| `partners/louisvuitton.svg` | [File:Louis Vuitton logo.svg](https://commons.wikimedia.org/wiki/File:Louis_Vuitton_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Louis_Vuitton_logo.svg) |
| `partners/lvmh.svg` | [File:LVMH wordmark.svg](https://commons.wikimedia.org/wiki/File:LVMH_wordmark.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/LVMH_wordmark.svg) |
| `partners/mastercard.svg` | [File:Mastercard 2019 logo.svg](https://commons.wikimedia.org/wiki/File:Mastercard_2019_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Mastercard_2019_logo.svg) |
| `partners/mercadolibre.svg` | [File:Mercado Libre wordmark (Spanish version).svg](https://commons.wikimedia.org/wiki/File:Mercado_Libre_wordmark_%28Spanish_version%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Mercado_Libre_wordmark_%28Spanish_version%29.svg) |
| `partners/mercedes.svg` | [File:Mercedes-Benz Logo 2010.svg](https://commons.wikimedia.org/wiki/File:Mercedes-Benz_Logo_2010.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Mercedes-Benz_Logo_2010.svg) |
| `partners/microsoft.svg` | [File:Microsoft logo (2012).svg](https://commons.wikimedia.org/wiki/File:Microsoft_logo_%282012%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_logo_%282012%29.svg) |
| `partners/okx.svg` | [File:OKX Logo.svg](https://commons.wikimedia.org/wiki/File:OKX_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/OKX_Logo.svg) |
| `partners/oracle.svg` | [File:Oracle logo.svg](https://commons.wikimedia.org/wiki/File:Oracle_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Oracle_logo.svg) |
| `partners/paramountplus.svg` | [File:Paramount Plus.svg](https://commons.wikimedia.org/wiki/File:Paramount_Plus.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Paramount_Plus.svg) |
| `partners/pepsico.svg` | [File:PepsiCo (2025, wordmark).svg](https://commons.wikimedia.org/wiki/File:PepsiCo_%282025%2C_wordmark%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/PepsiCo_%282025%2C_wordmark%29.svg) |
| `partners/petronas.svg` | [File:PETRONAS-logo.svg](https://commons.wikimedia.org/wiki/File:PETRONAS-logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/PETRONAS-logo.svg) |
| `partners/pirelli.svg` | [File:Pirelli - logo full (Italy, 1997).svg](https://commons.wikimedia.org/wiki/File:Pirelli_-_logo_full_%28Italy%2C_1997%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Pirelli_-_logo_full_%28Italy%2C_1997%29.svg) |
| `partners/puma.svg` | [File:Puma-logo-(text).svg](https://commons.wikimedia.org/wiki/File:Puma-logo-%28text%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Puma-logo-%28text%29.svg) |
| `partners/qatarairways.svg` | [File:Qatar Airways logo.svg](https://commons.wikimedia.org/wiki/File:Qatar_Airways_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Qatar_Airways_logo.svg) |
| `partners/qualcomm.svg` | [File:Qualcomm-Logo.svg](https://commons.wikimedia.org/wiki/File:Qualcomm-Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Qualcomm-Logo.svg) |
| `partners/redbull.svg` | [File:Logo of Red bull.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Red_bull.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Logo_of_Red_bull.svg) |
| `partners/revolut.svg` | [File:Revolut logo.svg](https://commons.wikimedia.org/wiki/File:Revolut_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Revolut_logo.svg) |
| `partners/salesforce.svg` | [File:Salesforce.com logo.svg](https://commons.wikimedia.org/wiki/File:Salesforce.com_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Salesforce.com_logo.svg) |
| `partners/santander.svg` | [File:Banco Santander Logotipo.svg](https://commons.wikimedia.org/wiki/File:Banco_Santander_Logotipo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Banco_Santander_Logotipo.svg) |
| `partners/shell.svg` | [File:Shell wordmark 2019.svg](https://commons.wikimedia.org/wiki/File:Shell_wordmark_2019.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Shell_wordmark_2019.svg) |
| `partners/standardchartered.svg` | [File:Standard Chartered (2021).svg](https://commons.wikimedia.org/wiki/File:Standard_Chartered_%282021%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Standard_Chartered_%282021%29.svg) |
| `partners/tagheuer.svg` | [File:TAG Heuer logo.svg](https://commons.wikimedia.org/wiki/File:TAG_Heuer_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/TAG_Heuer_logo.svg) |
| `partners/tenneco.svg` | [File:Tenneco Logo 2024.svg](https://commons.wikimedia.org/wiki/File:Tenneco_Logo_2024.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Tenneco_Logo_2024.svg) |
| `partners/unicredit.svg` | [File:Unicredit logo.svg](https://commons.wikimedia.org/wiki/File:Unicredit_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Unicredit_logo.svg) |
| `partners/valvoline.svg` | [File:Valvoline company logo.svg](https://commons.wikimedia.org/wiki/File:Valvoline_company_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Valvoline_company_logo.svg) |
| `partners/visa.svg` | [File:Visa Inc. logo (2021–present).svg](https://commons.wikimedia.org/wiki/File:Visa_Inc._logo_%282021%E2%80%93present%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Visa_Inc._logo_%282021%E2%80%93present%29.svg) |
| `partners/tudor.svg` | [File:Tudor (Uhrenmarke) logo.svg](https://commons.wikimedia.org/wiki/File:Tudor_(Uhrenmarke)_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Tudor_(Uhrenmarke)_logo.svg) (LIVERY-B; shield over wordmark, the cars use the parts) |
| `partners/ninjaone.svg` | [File:NinjaOne logo.svg](https://commons.wikimedia.org/wiki/File:NinjaOne_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/NinjaOne_logo.svg) (LIVERY-B) |
| `partners/redbullbull.svg` | the charging bull of the Red Bull mark, from simple-icons 11.14.0 `icons/redbull.svg` (CC0 trace of the logo from redbull.com; https://cdn.jsdelivr.net/npm/simple-icons@11.14.0/icons/redbull.svg): only the bull sub-paths kept (sun strokes removed), filled Red Bull red `#db0a40` (LIVERY-B) |
| `partners/dynatrace.svg` | simple-icons 11.14.0 `icons/dynatrace.svg` (source given there: https://www.dynatrace.com/company/press-kit/), the mark only (LIVERY-B) |
| `partners/amd.svg` | [File:AMD Logo.svg](https://commons.wikimedia.org/wiki/File:AMD_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/AMD_Logo.svg) (LIVERY-A) |
| `partners/amg.svg` | [File:AMG logo.svg](https://commons.wikimedia.org/wiki/File:AMG_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/AMG_logo.svg) (LIVERY-A) |
| `partners/cisco.svg` | [File:Cisco logo blue 2016.svg](https://commons.wikimedia.org/wiki/File:Cisco_logo_blue_2016.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Cisco_logo_blue_2016.svg) (LIVERY-A) |
| `partners/dxc.svg` | [File:DXC-Logo-2025.svg](https://commons.wikimedia.org/wiki/File:DXC-Logo-2025.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/DXC-Logo-2025.svg) (LIVERY-A) |
| `partners/groq.svg` | [File:Groq logo.svg](https://commons.wikimedia.org/wiki/File:Groq_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Groq_logo.svg) (LIVERY-A) |
| `partners/mclarenspeedmark.svg` | [File:McLaren Speedmark.svg](https://commons.wikimedia.org/wiki/File:McLaren_Speedmark.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/McLaren_Speedmark.svg) (LIVERY-A) |
| `partners/nubank.svg` | [File:Nubank logo 2021.svg](https://commons.wikimedia.org/wiki/File:Nubank_logo_2021.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Nubank_logo_2021.svg) (LIVERY-A) |
| `partners/okta.svg` | [File:Okta logo (2023).svg](https://commons.wikimedia.org/wiki/File:Okta_logo_%282023%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Okta_logo_%282023%29.svg) (LIVERY-A) |
| `partners/snapdragon.svg` | [File:Snapdragon Logo.svg](https://commons.wikimedia.org/wiki/File:Snapdragon_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Snapdragon_Logo.svg) (LIVERY-A; viewBox trimmed to the mark + "Snapdragon", the stadium suffix cut off) |
| `partners/teamviewer.svg` | [File:TeamViewer logo new.svg](https://commons.wikimedia.org/wiki/File:TeamViewer_logo_new.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/TeamViewer_logo_new.svg) (LIVERY-A) |
| `partners/whoop.svg` | [File:WHOOP Logo Black.svg](https://commons.wikimedia.org/wiki/File:WHOOP_Logo_Black.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/WHOOP_Logo_Black.svg) (LIVERY-A) |
| `partners/workday.svg` | [File:Workday 2024 logo.svg](https://commons.wikimedia.org/wiki/File:Workday_2024_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Workday_2024_logo.svg) (LIVERY-A) |
| `partners/3m.svg` | Cadillac Formula 1 Team site (https://www.cadillacf1team.com/), the team's own partner logo file `Partner-3M.svg` (cadillacf1team.com/ctfassets) (LIVERY-C) |
| `partners/alpinestars.svg` | Cadillac Formula 1 Team site (https://www.cadillacf1team.com/), the team's own partner logo file `Partner-Apline_Stars.svg` (cadillacf1team.com/ctfassets) (LIVERY-C) |
| `partners/aramco.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Aramco-Mono-Black.svg` (assets.astonmartinf1.com); single-colour file filled with the Aramco blue `#0a7dc1` used by the trackside boards (tone it white/black on the cars) (LIVERY-C) |
| `partners/arm.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Arm-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/astonmartin.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `2025_AMF1_Team__logo_wide_black_RGB_BG.svg` (assets.astonmartinf1.com); viewBox trimmed to the Aston Martin wings badge (the aramco / FORMULA ONE TEAM part cut off) (LIVERY-C) |
| `partners/barclays.svg` | [File:Barclays-Logo.svg](https://commons.wikimedia.org/wiki/File:Barclays-Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Barclays-Logo.svg) (eagle + wordmark; viewBox trimmed to the painted art) (LIVERY-C) |
| `partners/betway.svg` | [File:Betway Logo (black).svg](https://commons.wikimedia.org/wiki/File:Betway_Logo_(black).svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Betway_Logo_(black).svg) (LIVERY-C) |
| `partners/boss.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Boss-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/breitling.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Breitling-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/cadillac.svg` | [File:Cadillac Logo 2021.svg](https://commons.wikimedia.org/wiki/File:Cadillac_Logo_2021.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Cadillac_Logo_2021.svg); viewBox trimmed to the CADILLAC wordmark under the crest (LIVERY-C) |
| `partners/cadillaccrest.svg` | [File:Cadillac Logo 2021.svg](https://commons.wikimedia.org/wiki/File:Cadillac_Logo_2021.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Cadillac_Logo_2021.svg); viewBox trimmed to the crest (LIVERY-C) |
| `partners/cognition.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Cognition-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/cohere.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Cohere-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/coinpayments.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Coinpayments-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/estrellagalicia.svg` | [File:Estrella Galicia escudo color vectorial HDJR.svg](https://commons.wikimedia.org/wiki/File:Estrella_Galicia_escudo_color_vectorial_HDJR.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Estrella_Galicia_escudo_color_vectorial_HDJR.svg) (LIVERY-C) |
| `partners/glenfiddich.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Glenfiddich_2026-Mono-Black__1_.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/ifs.svg` | Cadillac Formula 1 Team site (https://www.cadillacf1team.com/), the team's own partner logo file `Partner-IFS.svg` (cadillacf1team.com/ctfassets) (LIVERY-C) |
| `partners/jcb.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `JCB-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/jimbeam.svg` | Cadillac Formula 1 Team site (https://www.cadillacf1team.com/), the team's own partner logo file `Partner-Jim_Beam.svg` (cadillacf1team.com/ctfassets) (LIVERY-C) |
| `partners/keeper.svg` | Keeper Security site (https://www.keepersecurity.com/), its header logo `/assets/branding/keeper-logo-light.svg` (yellow mark + white wordmark, for dark bodywork) (LIVERY-C) |
| `partners/kraken.svg` | Kraken site (https://www.kraken.com/), its "kraken by PAYWARD" logo file (assets-cms.kraken.com); viewBox trimmed to the kraken wordmark (LIVERY-C) |
| `partners/maaden.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Maaden-Mono-Black_2.svg` (assets.astonmartinf1.com) (the current MAADEN identity) (LIVERY-C) |
| `partners/netapp.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Netapp-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/nexgen.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `NexGen-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/pepperstone.svg` | [File:Pepperstone.svg](https://commons.wikimedia.org/wiki/File:Pepperstone.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Pepperstone.svg) (horizontal mark + wordmark, as on the car) (LIVERY-C) |
| `partners/tommyhilfiger.svg` | Cadillac Formula 1 Team site (https://www.cadillacf1team.com/), the team's own partner logo file `Partner-Tommy.svg` (cadillacf1team.com/ctfassets) (LIVERY-C) |
| `partners/twgai.svg` | TWG AI site (https://www.twg.ai/), its menu logo file `Menu Logo.svg` (cdn.prod.website-files.com): TWG + the outlined AI diamond, as on the car (LIVERY-C) |
| `partners/vastdata.svg` | [File:VAST Data logo.svg](https://commons.wikimedia.org/wiki/File:VAST_Data_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/VAST_Data_logo.svg) (LIVERY-C) |
| `partners/williams.svg` | [File:Atlassian Williams F1 Team logo.svg](https://commons.wikimedia.org/wiki/File:Atlassian_Williams_F1_Team_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Atlassian_Williams_F1_Team_logo.svg); viewBox trimmed to the Williams wordmark (LIVERY-C) |
| `partners/xerox.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Xerox-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/mobil.svg` | [File:Mobil logo.svg](https://commons.wikimedia.org/wiki/File:Mobil_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Mobil_logo.svg) (LIVERY-B) |
| `partners/etoro.svg` | [File:EToro Logo 2026.svg](https://commons.wikimedia.org/wiki/File:EToro_Logo_2026.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/EToro_Logo_2026.svg) (LIVERY-B) |
| `partners/haasf1.svg` | [File:TGR Haas F1 Team Logo (2026).svg](https://commons.wikimedia.org/wiki/File:TGR_Haas_F1_Team_Logo_%282026%29.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/TGR_Haas_F1_Team_Logo_%282026%29.svg) (LIVERY-B) |
| `partners/clarowordmark.svg` | Cadillac Formula 1 Team site (https://www.cadillacf1team.com/), the team's own partner logo file `Partner-Claro.svg` (the Claro wordmark, one colour so it can be toned white like on the car) (LIVERY-C) |
| `partners/honda2026.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Honda_2026-Mono-Black__1_.svg` (assets.astonmartinf1.com) (the 2026 Honda H + wordmark) (LIVERY-C) |
| `partners/valvolinev.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Valvoline-Mono-Black.svg` (assets.astonmartinf1.com) (V mark + wordmark) (LIVERY-C) |
| `partners/indeed.svg` | [File:Indeed logo.svg](https://commons.wikimedia.org/wiki/File:Indeed_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Indeed_logo.svg) (LIVERY-A) |
| `partners/siemens.svg` | [File:Siemens AG logo.svg](https://commons.wikimedia.org/wiki/File:Siemens_AG_logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Siemens_AG_logo.svg) (LIVERY-A) |
| `partners/avolta.svg` | [File:Avolta Logo 2023.svg](https://commons.wikimedia.org/wiki/File:Avolta_Logo_2023.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Avolta_Logo_2023.svg) (LIVERY-A) |
| `partners/delltechnologies.svg` | [File:Dell Technologies logo black.svg](https://commons.wikimedia.org/wiki/File:Dell_Technologies_logo_black.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Dell_Technologies_logo_black.svg) (LIVERY-A) |
| `partners/dropbox.svg` | [File:Dropbox Logo 01.svg](https://commons.wikimedia.org/wiki/File:Dropbox_Logo_01.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Dropbox_Logo_01.svg) (LIVERY-A) |
| `partners/richardmille.svg` | [File:Richard Mille Logo.svg](https://commons.wikimedia.org/wiki/File:Richard_Mille_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Richard_Mille_Logo.svg) (LIVERY-A) |
| `partners/alpinef1.svg` | [File:Alpine F1 Team Logo.svg](https://commons.wikimedia.org/wiki/File:Alpine_F1_Team_Logo.svg) (https://commons.wikimedia.org/wiki/Special:FilePath/Alpine_F1_Team_Logo.svg) (LIVERY-B; the cars use the "A" mark part) |
| `partners/hondawordmark.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Honda_2026-Mono-Black__1_.svg` (assets.astonmartinf1.com); viewBox trimmed to the Honda wordmark (LIVERY-C) |
| `partners/valvolinemark.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Valvoline-Mono-Black.svg` (assets.astonmartinf1.com); viewBox trimmed to the V mark (LIVERY-C) |
| `partners/valvolinewordmark.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Valvoline-Mono-Black.svg` (assets.astonmartinf1.com); viewBox trimmed to the wordmark (LIVERY-C) |
| `partners/atlasair.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `AtlasAir-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/celsius.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Celsius-Mono-Black__1_.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/eightsleep.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `EightSleep-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/krown.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Krown-Mono-Black__1_.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/servicenow.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `ServiceNow-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/ukg.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `UKG-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/zscaler.svg` | Aston Martin F1 Team partners page (https://www.astonmartinf1.com/en-GB/partners), the team's own logo file `Zscaler-Mono-Black.svg` (assets.astonmartinf1.com) (LIVERY-C) |
| `partners/allwyn.svg` | allwyn.com header logo https://www.allwyn.com/img/allwyn.svg (staged by LOGO-HUNT-1; sanitised, trimmed viewBox; LIVERY-A) |
| `partners/shellpecten.svg` | simple-icons 11.14.0 `icons/shell.svg` https://cdn.jsdelivr.net/npm/simple-icons@11.14.0/icons/shell.svg (monochrome pecten; the livery colours it red over a yellow ground; staged by LOGO-HUNT-1; LIVERY-A) |
| `partners/1password.svg` | simple-icons 11.14.0 `icons/1password.svg` https://cdn.jsdelivr.net/npm/simple-icons@11.14.0/icons/1password.svg (the round "1" mark only; the livery sets the wordmark next to it; staged by LOGO-HUNT-1; LIVERY-A) |
| `partners/signify.svg` | signify.com header logo https://www.signify.com/content/dam/signify-multibrand/master/navigation/logo/signify-logo.svg (its gradient-filled clip path rebuilt as a solid #00a989 path so every renderer draws it; staged by LOGO-HUNT-1; LIVERY-A) |
| `partners/confluent.svg` | Confluent's own logo file, https://images.ctfassets.net/8vofjvai1hpv/3YxxHIezkZt1v5mroo76ym/47e73d34ed8b7218d172a1f79d2da2b3/Confluent__Inc._logo_1.svg (staged by LOGO-HUNT-1; LIVERY-B) |
| `partners/pumacat.svg` | simple-icons 11.14.0 `icons/puma.svg` https://cdn.jsdelivr.net/npm/simple-icons@11.14.0/icons/puma.svg (the PUMA leaping cat, single colour; staged by LOGO-HUNT; LIVERY-A) |
| `partners/solera.svg` | solera.com master logo https://www.solera.com/wp-content/uploads/2022/01/Solera_Logo_CMYK-master.svg (staged by LOGO-HUNT; sanitised, trimmed viewBox; LIVERY-A) |
| `partners/hugo.svg` | HUGO's own logo file, https://www.hugoboss.com/on/demandware.static/Sites-US-Site/-/default/dwe9f5759d/svg/output_files/hugo_logo.svg (staged by LOGO-HUNT; the HUGO line mark, not BOSS), filled HUGO red `#e4002b` as on the VCARB 03 (LIVERY-B) |
<!--/PARTNER-TABLE-->
