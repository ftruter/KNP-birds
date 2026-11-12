# Model card: the photo model behind /identify/photo

Version `knp-photo-1-mnv4m-288-int8` (issue 151). This page says what the model is, what it was trained and
tested on, how well it does, and where it is weak. The numbers are copied from
`data/identify/photo-model.json`, which `training/identify-photo/describe.py` writes; if the two disagree, the
JSON file is right.

## What it is

- An image classifier with 493 outputs, one for each species in this guide. It can return nothing else: a
  bird that is not on the Kruger list, or a photo with no bird in it, still gets the nearest of the 493.
- Base model: MobileNetV4 conv-medium (`mobilenetv4_conv_medium.e250_r384_in12k` from the `timm` library,
  Apache 2.0), pretrained on ImageNet-12k, then fine-tuned here for ten passes at 256 pixels.
- Input: a 288 × 288 pixel square. Output: a score per species; the scores sum to 1.
- File: 9,799,040 bytes (9.3 MB), weights stored as 8-bit integers, in LiteRT (`.tflite`) format.
- It runs on the visitor's device with LiteRT.js (WebAssembly). No photo leaves the device.

## Training photos

- 180,892 photos from iNaturalist research-grade observations of wild birds, at most 400 a species.
- Where they were taken: 31,551 in Kruger, 107,021 elsewhere in South Africa, 42,320 elsewhere in the world.
  Southern African photos are taken first; photos from elsewhere fill the gap for species with few.
- Licences: CC BY-NC 152,367; CC BY 19,474; CC0 3,670; CC BY-SA 3,615; CC BY-NC-SA 1,766. No ND and no
  all-rights-reserved photo was used.
- Every photo is listed in `training/identify-photo/manifest.csv.gz` with its observation, photo id,
  observer, licence and attribution line. `/credits` links to that file.
- Because most training photos are CC BY-NC, the model is offered for non-commercial use only.
- Three species have fewer than 50 training photos and 14 have fewer than 100; the fewest is 19.

## Test photos

- 5,889 photos, up to 12 a species, held out before any training. They are the same photos the Phase 0 spike
  used, so the two models can be compared.
- 4,209 were taken in Kruger, 1,582 elsewhere in South Africa and 98 elsewhere.
- One photo per observation and one observation per observer per species. No training photo of a species
  comes from an observer who has a test photo of it, and no test photo is a training photo of any species.
- Each photo is scored once, on the middle 88% of its frame. Nobody cropped the test photos to the bird.

## Results

The shipped 8-bit file, on the 5,889 test photos:

| Measure | Result | Target in the issue |
| --- | --- | --- |
| Right species first | 82.3% | none |
| Right species in the top three | 92.2% | 80% |
| Right species in the top five | 94.4% | none |
| Right family (species scores summed by family) | 92.4% | 90% |
| Top three, mean over species | 92.1% | none |

Both targets are met. The Phase 0 spike model (72,305 photos, 224 pixels) scored 87.3% and 87.4% on the same
photos.

How the scores relate to being right, which is where the page's "Likely" and "Possible" cut-offs come from:

| Top species score at least | Share of test photos | Top species right |
| --- | --- | --- |
| 0.5 ("Likely") | 64% | 95.6% |
| 0.25 ("Possible") | 86% | 89.4% |

| Top family score at least | Share of test photos | Family right |
| --- | --- | --- |
| 0.5 | 79% | 98.6% |

On 2,128 test photos the top species score is under 0.5. For 897 of them the family score is at least 0.5 and
the family is right 96.4% of the time; the page then names the family. On the other 1,231 neither is
confident and the page says it is unsure.

Other choices measured on the same weights (32-bit, before export):

| Input size | Top three | Family |
| --- | --- | --- |
| 224 | 90.5% | 90.2% |
| 256 | 91.9% | 91.8% |
| 288 | 93.1% | 92.5% |
| 320 | 93.5% | 93.2% |

288 was chosen: 320 gains 0.4 points for about a quarter more work per photo. Storing the weights as 8-bit
integers instead of 16-bit floats halves the download and costs 0.7 points in the top three (92.9% to 92.2%).

## Where it is weak

Of 86 families with at least 12 test photos, 57 reach 90% on family and 83 reach 80% on species in the top
three. The weakest:

| Family | Test photos | Family right | Species in top three |
| --- | --- | --- | --- |
| Sylviid warblers | 24 | 62% | 75% |
| Old World sparrows | 48 | 73% | 77% |
| Swifts | 102 | 93% | 79% |
| Flufftails | 22 | 77% | 82% |
| Reed warblers and allies | 96 | 80% | 82% |
| Penduline tits | 12 | 58% | 83% |
| Indigobirds and whydahs | 84 | 87% | 83% |
| Grassbirds and allies | 43 | 70% | 84% |

The look-alike groups the issue names: cisticolas 87% species in the top three (95% family), larks 94% (94%),
pipits and wagtails 94% (95%), hawks and eagles 90% (99%), falcons 87% (87%).

Species least often in the top three include Barratt's Warbler (29%), Horus Swift, Forest Buzzard, Amethyst
Sunbird, Sooty Falcon, Southern Grey-headed Sparrow and Grey-rumped Swallow (58% each). The full tables are
written by `training/identify-photo/analyse.py`.

## Limits

- **Not measured on a phone.** Speed and memory were measured on a desktop computer and in desktop Chromium
  and WebKit only. No Android phone or iPhone has run it.
- **The test photos are iNaturalist photos.** Many are taken with long lenses by practised observers. A phone
  photo of a small, distant bird will do worse than these numbers; the crop square on the page exists to help.
- **The cut-offs are a starting point.** They come from the test photos above and should be reset once phone
  photos have been scored.
- **Twelve test photos a species is few.** A per-species figure moves 8 points with one photo.
- **Month of the year** changes almost nothing (82.3% to 82.4% species first). Only 19 test photos were taken
  in a month their species is listed as absent, so the out-of-season weight of 0.5 is not really tested.
- It knows only adult and young birds as they appear in the training photos. It was not told sex, age or
  plumage, and nests, eggs, feathers and tracks were not separated out.
- A species added to the guide later is listed on the page as not covered until the model is retrained.

## Rebuilding it

`training/identify-photo/README.md` has the steps. Nothing in them costs money.
