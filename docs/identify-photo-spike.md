# Identify by photo: Phase 0 spike report (issue 151)

Measured on 11 and 12 November 2026. The scripts are in `spike/identify-photo/`; its README says how to rerun
them. Nothing under `src/` was changed. Nothing cost money.

## Summary

- **Evaluation set.** 5,889 held-out iNaturalist photos covering all 493 species (12 each for 486 of them), 98%
  from Kruger or the rest of South Africa. None is a site reference photo, and no observer of a species'
  evaluation photos has a training photo of that species.
- **Option B (an existing model as is) cannot meet the targets.** No published on-device bird model covers our
  list. The best found knows 186 of our 493 species (38%); the popular compact one knows 26.
- **Option A (our own model) works and nearly meets the targets after one 40-minute training run.**
  A 9-million-parameter model, fine-tuned on 72,305 photos (at most 150 a species), puts the right species in
  the top three for **87.3%** of photos (target 80%: met) and names the right family for **87.4%** (target
  90%: missed by 2.6 points). Shown a larger picture, with no retraining, the same model reaches 89.4% and
  89.1%.
- **It fits the browser.** The exported file is **9.4 MB** (8-bit weights) or 17.5 MB (16-bit), against the
  20 MB aim. It runs on the LiteRT.js runtime the sound page already ships, under the headers the issue
  proposes, at **26 ms a photo in desktop Chrome and 32 ms in WebKit**, with the same answers as the Python
  reference. **No phone has been measured.**
- **Reference for option C.** BioCLIP 2, a 1.7 GB model that would have to run on a server, scores 93.6% and
  95.6% on the same photos with no training. It has very probably seen these photos, so that is an upper
  bound.
- **Recommendation.** Build option A. Before the page is built, train once more with more photos per species
  and a 256 or 288 pixel input, which is the cheapest way to close the family gap. Training on CC BY-NC
  photos is necessary: without them 88 species have fewer than 50 observations to learn from.

## 1. Data: what iNaturalist has for our list

`map-taxa.py` matches each species to an iNaturalist taxon on scientific name only. All 493 matched: 490 on
the same name and 3 through a synonym iNaturalist records (the buntings, which it files under *Fringillaria*
rather than *Emberiza*). Where BLSA lumps two forms (Common Reed Warbler, Black Kite, Bleating Camaroptera,
Common Bulbul, Great Cormorant), iNaturalist files the second form as a subspecies of the same taxon, so its
photos are included.

`fetch-observations.py` counts research-grade, non-captive observations that have at least one photo under
CC0, CC BY, CC BY-SA, CC BY-NC or CC BY-NC-SA. No ND and no all-rights-reserved photo is used.

| Observations per species | In Kruger | In South Africa | Anywhere | Anywhere, without the NC licences |
| --- | --- | --- | --- | --- |
| Median | 37 | 580 | 1,552 | 237 |
| Species with fewer than 20 | 207 | 23 | 1 | 42 |
| Species with fewer than 50 | 269 | 52 | 3 | 88 |
| Species with fewer than 150 | 336 | 112 | 39 | 190 |

56 species have no qualifying Kruger observation at all. The thinnest species anywhere are Striped Crake (13
observations), Böhm's Spinetail (32), Barratt's Warbler (38), Thick-billed Cuckoo (51), Red-chested Flufftail
(53), Bushveld Pipit (57) and Orange-winged Pytilia (58).

**Licences.** Of the 78,194 photos chosen, 84% are CC BY-NC, 11% CC BY, 2% CC BY-SA, 2% CC0 and 1%
CC BY-NC-SA. Dropping the NonCommercial licences would leave 42 species with fewer than 20 observations
anywhere (Bushveld Pipit, Lemon-breasted Canary and Grey-rumped Swallow would have 3 each). A model trained
this way should be treated as non-commercial, as the BirdNET model on the sound page already is.

### How the photos were split

- **Evaluation: 5,889 photos, 493 species, 1,067 observers.** Kruger first (4,209 photos), then the rest of
  South Africa (1,582), then elsewhere (98). One photo per observation and one observation per observer per
  species. Twelve photos for 486 species; Striped Crake has 2, and six others have 6 to 11.
- **Training: 72,305 photos, 6,202 observers.** Southern African photos first, at most 150 a species. 460
  species reach 150; 33 have fewer (Striped Crake 19, Böhm's Spinetail 33, Orange-winged Pytilia 49). Where a
  species is short, up to three photos are taken from one observation.
- No training photo of a species comes from an observer who has an evaluation photo of that species.
  Observations that supply the site's own reference photographs are never used for evaluation.
- Photos are iNaturalist's "medium" size (longest side 500 pixels), 7.8 GB in all. They are not committed.
  `spike/identify-photo/manifest.csv.gz` lists every one with its observation, photo id, observer, licence
  and attribution.

**What the evaluation set does not show.** The hard cases the issue asks for (small bird in frame, back views,
females and juveniles, birds in flight) are present only as often as observers upload them; they are not
labelled, so they cannot be reported separately. iNaturalist photos are also often taken with long lenses and
cropped by the photographer. A phone photo of a distant bird will do worse than these numbers.

## 2. Option B: existing models, as they are

Scores are limited to our species list (the "Kruger filter"), as on the sound page.

| Model | Size | Our species it knows | Species first | In top three | Family correct |
| --- | --- | --- | --- | --- | --- |
| `chriamue/bird-species-classifier` (EfficientNet, 525 species, MIT) | 34 MB | 26 | 3.5% | 4.3% | 15.8% |
| `birder-project/resnet_v2_50_inat21` (ResNet-50, iNaturalist 2021, Apache-2.0) | 169 MB | 186 | 32.8% | 35.9% | 64.4% |

On only the species each model knows, the first scores 65.7% first and 81.7% in the top three (312 photos),
and the second 86.4% and 94.8% (2,232 photos). They are accurate where they have a label; they lack labels.

- The compact model was matched on exact English names. The iNaturalist 2021 model was matched on scientific
  name, plus the hand-checked renames in `data/identify/birdnet-synonyms.json` (176 same name, 10 renamed).
- Every model trained on the iNaturalist 2021 competition set shares the same 1,486 bird classes, so none of
  them can cover more than these 186. The 307 missing species include common Kruger birds: Little Swift,
  Chinspot Batis, Red-billed Buffalo Weaver, Yellow-billed Oxpecker, Trumpeter Hornbill, Sabota Lark.
- The second model is also far over the 20 MB aim.

No other openly licensed, on-device bird classifier with wider coverage was found.

## 3. Option A: our own model

### What was trained

- **Base model:** `mobilenetv4_conv_medium.e250_r384_in12k` from the timm library (MobileNetV4, Apache-2.0,
  pretrained on ImageNet-12k). 9.07 million parameters with our 493 outputs. It is all convolutions, which the
  LiteRT converter handles cleanly.
- **Training:** 12 passes over the 72,305 photos at 224 pixels, random crops of 25 to 100% of the photo, on
  the owner's Apple M5 Max. About 200 seconds a pass, **40 minutes in all, no cost**.
- **One thing to keep:** the pretrained layers need a very small learning rate (0.00005, with 0.002 for the
  new output layer). The first attempt used 0.001 throughout and scored at chance. `train.py` has the working
  settings.

### Accuracy on the 5,889 evaluation photos

| Model | File | Species first | In top three | In top five | Family correct |
| --- | --- | --- | --- | --- | --- |
| PyTorch, as trained | | 74.9% | 87.1% | 90.5% | 87.3% |
| Exported, 32-bit weights | 34.6 MB | 75.2% | 87.3% | 90.6% | 87.4% |
| **Exported, 16-bit weights** | **17.5 MB** | **75.2%** | **87.3%** | **90.6%** | **87.4%** |
| **Exported, 8-bit weights** | **9.4 MB** | **75.0%** | **87.1%** | **90.4%** | **87.2%** |
| Target | 20 MB or less | | 80% | | 90% |

"Family correct" sums the species scores by family and takes the highest, which is what the page would do.
Averaged over species rather than photos, top three is 87.2%, so rare species are not dragging behind.

**A larger picture helps without retraining.** The same weights, scored in PyTorch:

| Input | Part of the photo's shorter side | Species first | In top three | Family correct |
| --- | --- | --- | --- | --- |
| 224 px | all of it | 73.1% | 85.7% | 86.1% |
| 224 px | middle 88% | 74.9% | 87.1% | 87.3% |
| 256 px | middle 88% | 77.0% | 88.8% | 88.6% |
| 288 px | middle 88% | 77.7% | 89.4% | 88.9% |

At 288 pixels, taking the family of the top species instead of the summed score gives 89.1%. Cropping closer
also helps (first two rows), which is encouraging for the hand crop the issue asks for. A 288-pixel input
costs about 1.65 times the computation.

### Weak groups

Of 86 families, 74 reach 80% on species in the top three, and 28 reach 90% on family.

| The groups the issue names | Photos | Family correct | Species first | In top three |
| --- | --- | --- | --- | --- |
| Cisticolas and allies (Cisticolidae) | 252 | 85% | 62% | 77% |
| Larks (Alaudidae) | 108 | 87% | 81% | 87% |
| Wagtails and pipits (Motacillidae) | 131 | 87% | 72% | 86% |
| Reed warblers and allies (Acrocephalidae) | 96 | 65% | 43% | 71% |
| Grassbirds and allies (Locustellidae) | 43 | 67% | 67% | 81% |
| Leaf warblers (Phylloscopidae) | 24 | 96% | 96% | 96% |
| Sylviid warblers (Sylviidae) | 24 | 42% | 38% | 67% |
| Hawks, eagles and kites (Accipitridae) | 480 | 95% | 63% | 81% |
| Falcons and kestrels (Falconidae) | 108 | 81% | 70% | 80% |

Other families under 80% in the top three: honeyguides (75%), turacos (75%), tits (75%), pelicans (75%), Old
World sparrows (77%), gulls and terns (79%), swifts (79%). The full table is in
`spike/identify-photo/analysis-mnv4m.md`.

Species least often in the top three: Neddicky and White-winged Widowbird (42%, taken for cisticolas), Horus
Swift, Yellow-bellied Eremomela, Sooty Falcon, Olive-tree Warbler and Brown-backed Honeybird (50%), then
Barratt's Warbler, Marsh Warbler, African Goshawk, Steppe Eagle and Cape Eagle-Owl (57 to 58%).

### How far the score can be trusted

| Top species score at least | Photos | Top species correct |
| --- | --- | --- |
| 0.9 | 1,132 of 5,889 | 99.1% |
| 0.75 | 2,384 | 97.9% |
| 0.5 | 3,705 | 93.0% |
| 0.25 | 4,965 | 84.2% |
| 0.1 | 5,724 | 77.0% |

| Top family score at least | Photos | Family correct |
| --- | --- | --- |
| 0.9 | 1,736 of 5,889 | 99.8% |
| 0.75 | 3,305 | 99.5% |
| 0.5 | 4,525 | 97.4% |
| 0.25 | 5,477 | 91.7% |

- These are a starting point for the likely / possible / unlikely wording.
- **Family first when unsure works.** The species score is under 0.5 on 2,184 photos. On 820 of them the
  family score is at least 0.5, and that family is right 93.4% of the time. On the other 1,364 (23% of all
  photos) neither is confident, and the page should say "No confident match".
- **The month prior adds almost nothing here.** `monthsPresent` is set for 389 species, and only 19
  evaluation photos were taken in a month their species is listed as absent. Halving or quartering those
  scores moves top one from 75.2% to 75.3%. It is still worth showing as a note.
- The model always returns one of our 493 species. It has not been tested on photos of other birds or of
  things that are not birds.

## 4. In the browser

`export.py` converts the PyTorch model with `litert-torch` 0.10.0. Scaling and the final softmax are inside
the file: the page hands over 224 × 224 RGB pixels as numbers from 0 to 255 and gets back 493 probabilities.

The bench (`run-bench.mjs`) serves the page with `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
connect-src 'self'; img-src 'self' https: blob:` and runs the model in a classic Web Worker with LiteRT.js
2.6.0, single-threaded. No console errors or policy violations in either browser. Apple M5 Max.

| File | Browser | Model load | First run | Median per photo | Decode and shrink a 12 MP photo |
| --- | --- | --- | --- | --- | --- |
| 16-bit, 17.5 MB | Chrome 158 | 59 ms | 33 ms | 26 ms | 16 ms |
| 8-bit, 9.4 MB | Chrome 158 | 70 ms | 33 ms | 26 ms | 16 ms |
| 16-bit, 17.5 MB | WebKit 27.2 | 81 ms | 38 ms | 32 ms | 71 ms |
| 8-bit, 9.4 MB | WebKit 27.2 | 96 ms | 38 ms | 32 ms | 26 ms |

- Both browsers return the same top three as the Python reference for the same pixels (Lilac-breasted Roller,
  0.5514 with the 16-bit file in all three).
- The 8-bit file stores weights in 8 bits and computes in floating point, so it is no faster, only smaller.
- A visitor who has already used the sound page has the 11 MB runtime cached. The photo model is then the
  only new download.
- `createImageBitmap` and `OffscreenCanvas` in the worker are enough to decode and shrink a 4000 × 3000 JPEG.

**Phones: not measured.** No Android phone or iPhone was timed. The sound spike measured BirdNET, a larger
model, at 32 ms on an older iPad against 26 ms on a desktop, so this model should be quick on iOS, but that
is an inference, not a measurement. Mid-range Android is unknown for both pages. The README says how to run
the bench on a phone; it must be served over HTTPS.

## 5. Reference for option C

| Model | Size | Species first | In top three | Family correct |
| --- | --- | --- | --- | --- |
| BioCLIP 2 (`imageomics/bioclip-2`, MIT), given our 493 names, no training | 1.7 GB | 84.2% | 93.6% | 95.6% |

- It meets both targets, and is strongest where our model is weakest (cisticolas 95% in the top three, reed
  warblers 91%, pipits 98%). Its own weak spots are cuckooshrikes (58%) and grassbirds (63%).
- Its training set includes iNaturalist's research-grade photos, so it has very probably seen these
  evaluation photos. Treat the figures as an upper bound.
- It is far too large for a phone, so it would need a hosted server: a monthly cost, a live connection, and
  photos leaving the device. No hosting price was gathered, because nothing here needs the owner to spend.
- It could instead be used offline as a teacher when training our small model, at no running cost. That was
  not tried.

## 6. Limits of this spike

- **One training run.** No second seed, no comparison of base models, no tuning beyond the learning rate.
- **150 photos a species was a cap chosen for speed**, not a limit of the data: the median species has 1,552
  qualifying observations. More photos, a larger input and longer training are untested and likely to help.
- **Evaluation photos are iNaturalist uploads**, not phone photos from a vehicle. See section 1.
- **Sex, age and plumage** are not separated. A species is one class.
- **Research-grade identifications can be wrong.** No photo was checked by hand.
- **The base model's ImageNet-12k weights** are published by timm under Apache-2.0. ImageNet's own terms
  are for non-commercial research; the site is non-commercial.

## 7. Decisions for the owner

1. **Go ahead with option A?** Recommended: yes. It is the only option that covers the whole list on the
   device, it is free to train and run, and one short run is already within three points of both targets.
2. **Accuracy targets.** Species in the top three (80%) is met. Family (90%) is not yet: 87.4% as trained,
   about 89% with a larger input. Recommended: keep both targets and do one more training run (more photos a
   species, 256 or 288 pixel input) before building the page. If it still falls short, decide then whether
   88 to 89% with a "family first when unsure" result is acceptable.
3. **Training on CC BY-NC photos.** Recommended: yes, with the manifest published. Without them the model
   cannot learn 88 of the species properly.
4. **Paid server fallback (options C or D).** Not needed on these numbers. Recommended: do not budget for it
   now.
5. **New: which file to ship.** Recommended: the 8-bit file (9.4 MB). It loses 0.2 points against the
   16-bit file (17.5 MB).
6. **New: phone timings.** Someone needs to run the bench on a mid-range Android phone and an iPhone before
   the input size is fixed.
