# Identify by sound: Phase 0 spike report (issue 150)

Measured on 11 November 2026. The scripts are in `spike/identify-sound/`; its README says how to rerun them.
Nothing under `src/` was changed.

## Summary

- **Coverage.** BirdNET V2.4 can recognise **362 of our 493 species (73%)**. A further 8 have only a broader
  label and are left unmapped for the owner to decide. **123 species are not in the model at all.**
- **Runtime.** Two runtimes run the model in desktop Chrome and WebKit under the exact headers the issue
  proposes, with no policy violations, at about 25 ms per 3-second window. It also runs on an iPhone and two iPads; an older iPad took
  **32 ms per window over HTTPS**. (Over plain HTTP, iOS Safari is 25 to 40 times slower, which does not
  apply to the real site.) **No Android device has been measured.**
- **Accuracy.** On one reference clip per covered species (359 clips), the right species was first for **81%**
  and in the top three for **92%**. These clips are probably in the model's training data, so this is an upper
  bound. **No field recordings were tested.**
- **Recommendation.** Continue with option A, using LiteRT.js and the official 25 MB model file, provided the
  owner accepts that a quarter of the list cannot be recognised. iOS speed is not a concern. Android is the remaining unknown.

## 1. Coverage

The model's 6,522 labels follow eBird/Clements names; ours follow IOC as adopted by BLSA 2026.
`scripts/map-birdnet-labels.mjs` matches on scientific name, then on the hand-checked table in
`data/identify/birdnet-synonyms.json`. It maps nothing else.

| Result | Species |
| --- | --- |
| Same scientific name | 334 |
| Renamed, hand-checked | 28 |
| **Covered** | **362** |
| Only a broader label exists (not mapped) | 8 |
| Not in the model | 123 |
| Total | 493 |

Three covered species need a note:

- **Common Reed Warbler** maps to two labels, because BLSA lumps African Reed Warbler into it and the model
  keeps them apart.
- **Bleating Camaroptera** and **Black Kite** are only partly covered. The model has Green-backed Camaroptera
  and Black Kite, but no label for Grey-backed Camaroptera or Yellow-billed Kite, which BLSA lumps into them.

The species that are missing are mostly quiet or rarely recorded birds (vultures, eagles, storks, ducks,
coursers), but the list also has birds people will hear: Magpie Shrike, Purple Roller, Southern Carmine
Bee-eater, Southern White-faced Owl, Pel's Fishing Owl, Marico Flycatcher, Coqui Francolin, Black Coucal.

### Renamed (28): same bird, different name in the model

| Our species | Model label | Source |
| --- | --- | --- |
| African Goshawk (*Aerospiza tachiro*) | Accipiter tachiro — African Goshawk | `docs/species-sources.md` |
| Flappet Lark (*Amirafra rufocinnamomea*) | Mirafra rufocinnamomea — Flappet Lark | `docs/species-sources.md` |
| Lemon Dove (*Aplopelia larvata*) | Columba larvata — Lemon Dove | `docs/species-sources.md` |
| Black Sparrowhawk (*Astur melanoleucus*) | Accipiter melanoleucus — Black Goshawk | `docs/species-sources.md` |
| Little Bittern (*Botaurus minutus*) | Ixobrychus minutus — Little Bittern | `docs/species-sources.md` |
| Red-billed Oxpecker (*Buphagus erythroryncha*) | Buphagus erythrorynchus — Red-billed Oxpecker | `docs/species-sources.md` |
| Grey Cuckooshrike (*Ceblepyris caesius*) | Coracina caesia — Gray Cuckooshrike | Same English name and epithet |
| White-breasted Cuckooshrike (*Ceblepyris pectoralis*) | Coracina pectoralis — White-breasted Cuckooshrike | Same English name and epithet |
| Black-fronted Bush-shrike (*Chlorophoneus nigrifrons*) | Telophorus nigrifrons — Black-fronted Bushshrike | Same English name and epithet |
| Olive Bush-Shrike (*Chlorophoneus olivaceus*) | Telophorus olivaceus — Olive Bushshrike | Same English name and epithet |
| Orange-breasted Bush-Shrike (*Chlorophoneus sulfureopectus*) | Telophorus sulfureopectus — Sulphur-breasted Bushshrike | English names differ: please confirm |
| Grey Go-away-bird (*Crinifer concolor*) | Corythaixoides concolor — Gray Go-away-bird | `docs/species-sources.md` |
| Cardinal Woodpecker (*Dendropicos fuscescens*) | Chloropicus fuscescens — Cardinal Woodpecker | Same English name and epithet |
| Olive Woodpecker (*Dendropicos griseocephalus*) | Chloropicus griseocephalus — Olive Woodpecker | Same English name and epithet |
| Cape Robin-chat (*Dessonornis caffer*) | Cossypha caffra — Cape Robin-Chat | `docs/species-sources.md` |
| White-throated Robin-chat (*Dessonornis humeralis*) | Cossypha humeralis — White-throated Robin-Chat | `docs/species-sources.md` |
| African Fish Eagle (*Icthyophaga vocifer*) | Haliaeetus vocifer — African Fish-Eagle | `docs/species-sources.md` |
| Verreaux’s Eagle-Owl (*Ketupa lactea*) | Bubo lacteus — Verreaux's Eagle-Owl | `docs/species-sources.md` |
| Red-crested Korhaan (*Lophotis ruficrista*) | Eupodotis ruficrista — Red-crested Bustard | English names differ: please confirm |
| Fiscal Flycatcher (*Sigelus silens*) | Melaenornis silens — Fiscal Flycatcher | `docs/species-sources.md` |
| Laughing Dove (*Spilopelia senegalensis*) | Streptopelia senegalensis — Laughing Dove | Same English name and epithet |
| Alpine Swift (*Tachymarptis melba*) | Apus melba — Alpine Swift | Same English name and epithet |
| Shikra (*Tachyspiza badia*) | Accipiter badius — Shikra | `docs/species-sources.md` |
| Little Sparrowhawk (*Tachyspiza minulla*) | Accipiter minullus — Little Sparrowhawk | `docs/species-sources.md` |
| Three-banded Plover (*Thinornis tricollaris*) | Charadrius tricollaris — Three-banded Plover | `docs/species-sources.md` |
| Groundscraper Thrush (*Turdus litsitsirupa*) | Psophocichla litsitsirupa — Groundscraper Thrush | Same English name and epithet |
| Bearded Scrub Robin (*Tychaedon quadrivirgata*) | Cercotrichas quadrivirgata — Bearded Scrub-Robin | `docs/species-sources.md` |
| Brown Scrub Robin (*Tychaedon signata*) | Cercotrichas signata — Brown Scrub-Robin | `docs/species-sources.md` |

### Broader label only (8): not mapped, your call

| Our species | Only candidate label | Why it is not a clean match | Reference clip result if accepted |
| --- | --- | --- | --- |
| Nicholson’s Pipit | *Anthus similis* | The model has only Long-billed Pipit, from which IOC splits Nicholson’s Pipit | rank 1 |
| Yellow-billed Egret | *Ardea intermedia* | The model has only Intermediate Egret, which also covers the Asian and Australasian forms | no clip |
| Western Cattle Egret | *Bubulcus ibis* | The model has one Cattle Egret, which also covers Eastern Cattle Egret | rank 1 |
| Little Heron | *Butorides striata* | The model has only Striated Heron, from which IOC splits Little Heron | rank 3 |
| Burchell’s Coucal | *Centropus superciliosus* | The model has only White-browed Coucal, which Clements treats as including Burchell’s | rank 1 |
| Rufous-naped Lark | *Mirafra africana* | The model label predates the split of the Rufous-naped Lark complex | rank 1 |
| Rock Kestrel | *Falco tinnunculus* | The model has only Eurasian Kestrel, which Clements treats as including Rock Kestrel | rank 1 |
| Southern Crested Guineafowl | *Guttera pucherani* | The model has one Crested Guineafowl, which predates the split into Southern, Eastern and Western | rank 1 |

### Not in the model (123)

Ovambo Sparrowhawk, Striped Crake, Pale Flycatcher, Half-collared Kingfisher, Red-headed Finch, Cut-throat Finch, Orange-breasted Waxbill, Caspian Plover, White-fronted Plover, Chestnut-banded Plover, Kittlitz’s Plover, Cape Teal, Red-billed Teal, African Black Duck, African Openbill, African Darter, Cuckoo Finch, Grey Penduline-tit, Bushveld Pipit, Buffy Pipit, African Black Swift, Horus Swift, Tawny Eagle, African Hawk Eagle, Verreaux’s Eagle, Goliath Heron, Kori Bustard, African Cuckoo Hawk, Dwarf Bittern, Marico Flycatcher, Black-faced Waxbill, Cape Eagle-Owl, Jackal Buzzard, Forest Buzzard, White-backed Night Heron, Bennett’s Woodpecker, Coqui Francolin, Pennant-winged Nightjar, Broad-tailed Warbler (Fan-tailed Grassbird), Mosque Swallow, Black Coucal, Abdim’s Stork, African Woolly-necked Stork, Brown Snake Eagle, Black-chested Snake Eagle, African Marsh Harrier, Rufous-winged Cisticola, Purple Roller, Racket-tailed Roller, African Crake, Lemon-breasted Canary, Temminck’s Courser, Black Heron, Saddle-billed Stork, Burnt-necked Eremomela, Chestnut-backed Sparrow-Lark, Grey-backed Sparrow-lark, White-winged Widowbird, Fan-tailed Widowbird, Southern White-crowned Shrike, Lanner Falcon, Sooty Falcon, Dickinson’s Kestrel, African Snipe, Southern Bald Ibis, Black-winged Pratincole, Violet-eared Waxbill, Palm-nut Vulture, White-backed Vulture, Cape Vulture, Wahlberg’s Eagle, White-throated Swallow, Pearl-breasted Swallow, Pink-throated Twinspot, African Pygmy Kingfisher, Black-bellied Bustard, Dark Chanting Goshawk, Southern Carmine Bee-eater, Reed Cormorant, Lesser Jacana, Yellow-billed Stork, Böhm’s Spinetail, Hooded Vulture, Banded Martin, Southern Pochard, African Pygmy Goose, Thick-billed Cuckoo, Lesser Moorhen, Great White Pelican, Pink-backed Pelican, Dusky Lark, African Spoonbill, Spur-winged Goose, African Finfoot, Martial Eagle, Allen’s Gallinule, Brown-backed Honeybird, Grey-rumped Swallow, Double-banded Sandgrouse, Southern White-faced Owl, Orange-winged Pytilia, Bronze-winged Courser, Three-banded Courser, African Skimmer, Secretarybird, Knob-billed Duck, Pel’s Fishing Owl, Blue-billed Teal, Red-backed Mannikin, Magpie Mannikin, Common Ostrich, Mottled Spinetail, Bateleur, White-backed Duck, African Sacred Ibis, Lappet-faced Vulture, White-headed Vulture, Magpie Shrike, White-crowned Lapwing, Senegal Lapwing, Long-tailed Paradise Whydah, Purple Indigobird, Shaft-tailed Whydah.

## 2. Runtime

### What was tried

| | A. ONNX Runtime Web 1.31.1 | B. LiteRT.js 2.6.0 |
| --- | --- | --- |
| Model file | Community ONNX conversion, FP32 | **Official** TFLite, FP16 or FP32 |
| Model size (gzip) | 52.3 MB (48.4 MB) | FP16 25.9 MB (23.5 MB); FP32 51.7 MB (47.4 MB) |
| Runtime wasm (gzip) | 14.8 MB (3.8 MB) | 11.1 MB (3.1 MB) |
| Runtime JavaScript | 78 KB | 380 KB |
| **Total download, raw** | **about 67 MB** | **about 37 MB with FP16** |
| Runtime licence | MIT | Apache-2.0 |
| Matches the official model | Yes: same top five on 33 of 33 windows, largest logit gap 0.0007 | FP32 identical to the Python reference; FP16 within 0.02 |

The official model could not be converted to ONNX here. `tf2onnx` 1.16.1 fails on the model's FFT step from
both the TFLite file and the SavedModel. Option A therefore depends on a third-party conversion
(`tphakala/BirdNET-v2.4` on Hugging Face, SHA-256 checked against its published sum). Option B uses the file
the BirdNET team published, unchanged, and is half the download. TensorFlow.js was ruled out earlier: BirdNET's
own build only runs on WebGL.

### Desktop results (Apple silicon Mac, Playwright)

Served with `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'` and
`permissions-policy: microphone=(self)`. No console errors or policy violations in either browser.

| Candidate | Browser | Model load | First run | Median per 3 s window |
| --- | --- | --- | --- | --- |
| A, ONNX FP32 | Chrome 158 | 143 ms | 44 ms | 26 ms |
| A, ONNX FP32 | WebKit 27.2 | 155 ms | 34 ms | 26 ms |
| B, TFLite FP16 | Chrome 158 | 67 ms | 58 ms | 23 ms |
| B, TFLite FP16 | WebKit 27.2 | 77 ms | 59 ms | 26 ms |
| B, TFLite FP32 | Chrome 158 | 62 ms | 46 ms | 23 ms |
| B, TFLite FP32 | WebKit 27.2 | 72 ms | 47 ms | 26 ms |

Download times are not shown because the files came from the same machine. Memory was not measured: WebKit
does not expose it to a page, and Chrome's figure excludes the WebAssembly heap in the worker.

Both ran single-threaded, with no cross-origin isolation headers.

### Things the build must handle for LiteRT.js

- It needs a **classic** Web Worker. It loads its wasm glue with `importScripts()`, which module workers lack.
- In a worker it looks for its `.wasm` beside the worker script unless `self.Module.locateFile` is set first.
- Its published file imports another package by bare name, so it must be bundled into one file once
  (100 KB). The site has no build step today, so that file would be vendored or built by a small script.
- The 11 MB wasm and the model cannot be Worker text modules. Both need the new R2-backed route with
  `application/wasm` and immutable caching.

### iOS results (measured by the owner, Safari 27.3)

**Over HTTPS, as the site would be served:**

| Device | Candidate | First run | Median per 3 s window |
| --- | --- | --- | --- |
| Older iPad | B, TFLite FP16 | 107 ms | **32 ms** |

That is close to the desktop's 26 ms. A 10-second recording needs well under half a second of work, and
live, as-you-record results are feasible. The answer matched the desktop (same top label, logits identical to
three decimals). The iPad reports a desktop user agent, so its model is not recorded here. The iPhone 17 Pro
Max (A3526, iOS 27.3) was not timed on the model over HTTPS, because the download through the tunnel was too
slow, but its speed probe over HTTPS matched the desktop (see below). Memory is not exposed by Safari.

**Over plain HTTP from a LAN address, which is not how the site is served:**

| Device | A, ONNX FP32 | B, TFLite FP16 | B, TFLite FP32 |
| --- | --- | --- | --- |
| iPhone 17 Pro Max, iOS 27.3 | 1,206 ms | 979 ms | 985 ms |
| Older iPad | 933 ms | 856 ms | 856 ms |
| Newer iPad | 920 ms | 792 ms | 792 ms |

These figures are 25 to 40 times slower and **do not describe the real site**. They are kept because they
show three useful things: all three candidates load and run on all three devices, no tab was killed while
loading a model, and LiteRT.js is 7 to 19% faster than ONNX Runtime Web with FP16 no slower than FP32.

Why plain HTTP is slow was narrowed down with a probe (a fixed 20-million-step loop):

| | JavaScript loop | wasm loop | Model, per window |
| --- | --- | --- | --- |
| Desktop | 57 ms | 25 ms | 26 ms |
| iPhone, plain HTTP | 350 ms | 115 ms | 980 ms |
| iPhone, HTTPS | 93 ms | 27 ms | not measured |
| Older iPad, plain HTTP | not measured | not measured | 856 ms |
| Older iPad, HTTPS | 55 ms | 24 ms | 32 ms |

Lockdown Mode and Low Power Mode were off, wasm SIMD was available, and the main thread was no faster than
the worker. The only thing that changed the result was HTTPS. Safari evidently runs code from a plain-HTTP
LAN page far more slowly; the mechanism was not established. **Any future phone test must be served over
HTTPS.**

### Android: not measured

No Android device was available. This is the remaining gap, since mid-range Android phones are the slowest
devices the page is likely to meet. Serve the bench with `node spike/identify-sound/serve.mjs` behind an
HTTPS tunnel, open it, tap a **Run** button, then **Copy results**.

## 3. Accuracy on our reference recordings

`score.py` runs the **official FP32 TFLite model** in Python, so these numbers do not depend on a browser
runtime. One clip per species, the best-graded xeno-canto recording that is not ND-licensed; the first 60
seconds; 3-second windows every 1.5 seconds (median 19 windows per clip); scores limited to our mapped labels.

359 of the 362 covered species were scored. Three were skipped because their clip is over the 15 MB download
limit (European Nightjar, Montagu's Harrier, Thrush Nightingale).

| Pooling across windows | Top 1 | Top 3 | Top 5 | Family of top result correct |
| --- | --- | --- | --- | --- |
| Highest window | 79.9% | 91.6% | 92.5% | 85.0% |
| **Mean of the three highest windows** | **81.3%** | **91.9%** | **92.5%** | **86.4%** |

- Without the Kruger filter (all 6,522 labels), top 1 falls to 70.2%. The filter is worth 11 points.
- The 28 renamed species did worse than the rest: 19 of 28 were top 1.
- Counting the 8 broader-label species as covered barely changes the totals (80.6% top 1 over 366 clips).
  Six of the seven that have a clip were ranked first.

**How far the score can be trusted** (mean of the three highest windows):

| Top score at least | Clips | Top result correct |
| --- | --- | --- |
| 0.75 | 226 of 359 | 94.2% |
| 0.50 | 265 | 91.7% |
| 0.25 | 301 | 88.7% |
| 0.10 | 323 | 86.7% |

For 36 clips the top score was under 0.10. These figures are a starting point for the likely / possible /
unlikely wording, to be reset once field recordings exist.

### Covered species whose reference clip was not in the top three (29)

Yellow-breasted Apalis (model said Southern Black Tit), Steppe Eagle (model said Black Kite), Scarlet-chested Sunbird (model said Three-banded Plover), Black-fronted Bush-shrike (model said Tropical Boubou), Orange-breasted Bush-Shrike (model said Brown-crowned Tchagra), Bearded Woodpecker (model said Cape (Glossy) Starling), Collared Palm Thrush (model said Black-crowned Tchagra), White Stork (model said Grey Heron), Violet-backed Starling (model said Common (Dark-capped) Bulbul), White-bellied Sunbird (model said Marico Sunbird), Lesser Spotted Eagle (model said Pied Avocet), European Roller (model said Black-collared Barbet), Pied Crow (model said Little Bittern), White-throated Robin-chat (model said Jacobin Cuckoo), Southern Red Bishop (model said Green-winged Pytilia), Wire-tailed Swallow (model said Western House Martin), African Firefinch (model said Jameson’s Firefinch), Cape (Glossy) Starling (model said White-browed Sparrow-Weaver), Marabou Stork (model said Common Moorhen), Cape Wagtail (model said House Sparrow), Cape Sparrow (model said Yellow-throated Petronia), Southern Masked Weaver (model said House Sparrow), Yellow-rumped Tinkerbird (model said Olive Sunbird), African Harrier-Hawk (model said Black Kite), Large Rock Martin (model said White-browed Sparrow-Weaver), Green-winged Pytilia (model said Red-backed Shrike), Brown-throated Martin (model said Scaly-throated Honeyguide), Shikra (model said Little Sparrowhawk), Brown-crowned Tchagra (model said Black-backed Puffback).

### Limits of this test

- **Training overlap.** xeno-canto is a main source of BirdNET's training audio. Real phone recordings, with
  wind, vehicles and distance, will score lower.
- **Field recordings: not done.** None were available. Put phone recordings in
  `spike/identify-sound/field/<slug>/` and run `score.py --field`.
- **One clip per species** is a small sample; a single odd recording decides that species' result.
- **FP16 was not scored on the full set.** It was checked against FP32 on one clip only.
- **The month prior** (`monthsPresent`) was not applied. It is missing for 104 species.

## 4. Licence and credit

- Model weights: the BirdNET documentation says CC BY-NC-SA 4.0; the Zenodo record's metadata says
  CC BY-NC 4.0. Both allow a non-commercial site. Treat it as BY-NC-SA.
- Citation: Kahl, S., Wood, C. M., Eibl, M., & Klinck, H. (2021). BirdNET: A deep learning solution for avian
  diversity monitoring. *Ecological Informatics* 61, 101236.
- Source: <https://zenodo.org/records/15050749> (MD5 sums of the downloaded archives matched the record).
- BirdNET+ V3 exists only as developer previews with conflicting licence statements, so it was not tested.

## 5. Decisions for the owner

1. **Go ahead with on-device BirdNET?** Recommended: yes. It is free to run, keeps audio on the device, and
   works under the proposed headers, including on iOS. An older iPad needs 32 ms per 3-second window. Android is
   unmeasured. The cost is that 123 species (131 if the
   broader labels are rejected) can never be returned, and the page must say so.
2. **Is the download acceptable?** With LiteRT.js and the FP16 file it is about 37 MB once (about 27 MB if
   the wasm is served compressed). With ONNX it is about 67 MB.
3. **Nav label.** Recommended: one **Identify** entry, with sound and photo (#151) as tabs. Both need the
   same per-route header mechanism.
4. **New: the 8 broader labels.** Accept them (each is the only Kruger member of the broader species) or
   leave them as not covered.
5. **New: three renames to confirm**, where the English names differ: Orange-breasted Bush-Shrike,
   Black Sparrowhawk, Red-crested Korhaan.
