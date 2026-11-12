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
- File: 9,799,040 bytes (9.3 MiB), weights stored as 8-bit integers, in LiteRT (`.tflite`) format.
- It runs on the visitor's device with LiteRT.js (WebAssembly). No photo leaves the device.

## Training photos

- 180,892 photos from iNaturalist research-grade observations of wild birds, at most 400 a species.
- Where they were taken: 31,551 in Kruger, 107,021 elsewhere in South Africa, 42,320 elsewhere in the world.
  Southern African photos are taken first; photos from elsewhere fill the gap for species with few.
- Licences: CC BY-NC 152,367; CC BY 19,474; CC0 3,670; CC BY-SA 3,615; CC BY-NC-SA 1,766. No ND and no
  all-rights-reserved photo was used.
- Every photo is listed in `training/identify-photo/manifest.csv.gz` with its observation, photo id,
  observer, licence and attribution line. `/credits` links to that file.
- Because most training photos are CC BY-NC and some are share-alike, the weights are offered under
  CC BY-NC-SA 4.0. `scripts/huggingface.mjs` derives that from the licence counts, so a model trained on
  other photos gets the licence its photos allow.
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

## Finding the bird and cropping to it (issue 180)

The page no longer asks the visitor to put a square on the bird first. A second, smaller model finds the bird,
the page crops to it and goes straight to recognition. The crop that was used is shown beside every result,
and "Change the crop" opens the crop view on it. When no bird is found the crop view opens as before, with a
line saying so.

### The detector

- EfficientDet-Lite0 (Tan, Pang and Le, 2020), Google's 8-bit file from TensorFlow Hub
  (`efficientdet/lite0/detection/metadata/1`), trained on COCO 2017, which has a "bird" class. The publisher
  gives its licence as Apache 2.0. It is a general object detector and was not trained here.
- Input: a 320 × 320 pixel square. The whole photo is drawn into it in its own shape, against the top left
  corner, with mid grey filling the rest.
- **One change to the file.** Its last step picks the best 25 boxes, and the size of that step's outputs is
  not fixed, which LiteRT.js cannot run (it fails with "Insufficient buffer size"). `strip-detector.py`
  removes that step and nothing else. The file then returns, for each of 19,206 fixed anchor boxes, a score
  for each of 90 classes and four numbers that move and resize the anchor. The page does the picking
  (`birdBoxes` in `src/client/identify-photo.js`): anchors that score at least 0.3 as "bird"; where two boxes
  overlap by more than half, the better one. The weights are untouched. `strip-detector.py` also checks that
  the anchors the page works out are the ones stored in Google's file.
- File: 4,562,456 bytes (4.4 MiB), `models/efficientdet-lite0-coco-raw-1/bird-detector.tflite` in R2. It is
  not republished on Hugging Face.
- The crop: the largest bird box, widened to a square, with 35% of the box's longer side added all round,
  kept inside the photo.

### The comparison

`training/identify-photo/score-detect.py` ran detector-then-recogniser over the same 5,889 test photos, with
the box picking written as the page does it. Results are in `training/identify-photo/detect-*.json`.

**There are no hand-crop results to compare with.** Nobody cropped the test photos to the bird (see "Test
photos"). The two crops the comparison is made against use no detector: the middle 88% of the frame, which
the published results use, and the whole middle square, which is what the page did when the visitor pressed
Identify without moving the square. Where the detector finds no bird, the automatic figure uses the whole
middle square, because on the page the visitor is then asked to crop.

| Crop | Right species first | In the top three | Right family |
| --- | --- | --- | --- |
| Whole middle square (the page before, square not moved) | 81.3% | 91.3% | 91.0% |
| Middle 88% (as the published results) | 82.7% | 92.5% | 92.2% |
| **Automatic: EfficientDet-Lite0, score 0.3, margin 35%** | **83.8%** | **92.6%** | **92.6%** |

Automatic cropping is not worse on any measure, so it is the default and the manual step is the fallback.
(The middle-88% row is 0.3 to 0.4 points off the published 82.3%, 92.2% and 92.4% because this script
shrinks the crop in one step, as the page does, where `score-tflite.py` shrinks the photo and then crops.)

The detector found a bird in 5,325 of the 5,889 photos (90.4%). On the 564 where it found none, the whole
middle square is right first time for 58.5%, in the top three for 72.7%, and on family for 71.6%: these are
the hard photos, and they are the ones where the visitor is still asked to crop.

### Small and distant birds

By how much of the photo the detected bird's box covers. The gain is almost all in the smallest group.

| Bird's box covers | Photos | First, automatic | First, whole square | First, middle 88% | Top three, automatic | Top three, whole square |
| --- | --- | --- | --- | --- | --- | --- |
| Under 5% of the photo | 939 | 76.8% | 65.8% | 71.1% | 87.9% | 82.5% |
| 5% to 20% | 2,267 | 86.9% | 85.0% | 86.3% | 95.4% | 94.4% |
| 20% to 50% | 1,835 | 90.1% | 89.9% | 89.7% | 96.9% | 96.6% |
| 50% or more | 284 | 91.9% | 91.9% | 91.9% | 97.9% | 97.5% |
| No bird found | 564 | (58.5%) | 58.5% | not split out | (72.7%) | 72.7% |

The groups are made from the detector's own boxes, so a small bird it missed is in the last row, not the
first. There is no independent count of small birds in the test photos.

### Choices measured

Score cut-off and margin, EfficientDet-Lite0, all 5,889 photos (species first / top three / family):

| Score at least | Photos with a bird found | Margin 0 | Margin 10% | Margin 20% | Margin 35% | Margin 50% |
| --- | --- | --- | --- | --- | --- | --- |
| 0.2 | 93.4% | 82.5 / 91.6 / 91.7 | 83.0 / 92.4 / 92.5 | 83.6 / 92.7 / 92.8 | 83.7 / 92.9 / 92.9 | 83.2 / 92.9 / 92.8 |
| 0.3 | 90.4% | 82.7 / 91.6 / 91.8 | 83.1 / 92.4 / 92.3 | 83.5 / 92.7 / 92.5 | 83.8 / 92.6 / 92.6 | 83.3 / 92.7 / 92.6 |
| 0.4 | 86.3% | 82.8 / 91.8 / 92.0 | 83.0 / 92.6 / 92.5 | 83.5 / 92.8 / 92.6 | 83.8 / 92.6 / 92.7 | 83.3 / 92.5 / 92.6 |
| 0.5 | 81.1% | 82.6 / 91.7 / 91.9 | 82.8 / 92.4 / 92.3 | 83.2 / 92.7 / 92.4 | 83.4 / 92.5 / 92.5 | 82.8 / 92.3 / 92.3 |

A tight box (no margin) is worse than the middle 88%: the recogniser was trained on photos with some
surroundings. The differences between cut-offs are within a few tenths of a point; 0.3 was taken as the
middle of the flat part.

Larger detectors from the same family, at score 0.3 and margin 35%:

| Detector | File | Input | Bird found | Species first | Top three | Family |
| --- | --- | --- | --- | --- | --- | --- |
| EfficientDet-Lite0 (shipped) | 4.4 MiB | 320 | 90.4% | 83.8% | 92.6% | 92.6% |
| EfficientDet-Lite1 | 5.8 MiB | 384 | 92.5% | 84.0% | 93.1% | 92.8% |
| EfficientDet-Lite2 | 7.2 MiB | 448 | 93.7% | 84.1% | 93.3% | 93.0% |

Lite2 gains 0.3 points on species first for 2.8 MiB more download and about twice the work per photo
(Google's published phone figures: 36 ms for Lite0, 69 ms for Lite2). Lite0 was chosen. If phone photos show that small
birds are missed too often, Lite2 is a drop-in change: `strip-detector.py efficientdet-lite2`.

### Several birds

The page crops to the largest bird box. Other boxes are offered through "Another bird in this photo", but only
those that score at least 0.5, because fainter ones are often leaves or stones: on the test photos, 15.2% have
two or more boxes at 0.3 and 5.9% at 0.5, and most of those photos show one bird. That count was not checked
by eye.

### Cost

- Download: 4.4 MiB more, once. The page now quotes 24.6 MiB (9.3 MiB recogniser, 4.4 MiB detector, 10.9 MiB
  runtime). A visitor who already has the recogniser is not sent the detector unasked: the page works as
  before and offers it as a separate download. The "Photo recognition model" option of the installed app
  includes it and shows as an update.
- Time: one more run of a model per photo. In desktop Chromium on the development machine (Apple M5 Max) the
  page reported 49 ms to find the bird and 48 ms to recognise it. The page shows both figures (issue 178).
  **No phone has been measured.**

### What was not measured

- **Phone photos.** The test photos are at most 500 pixels on the longer side and most are already framed on
  the bird. On a phone photo the bird is often far smaller in the frame; that is where the detector is most
  likely to miss, and where cropping matters most. The detector sees the whole photo at 320 pixels, so a bird
  under about a twentieth of the frame's width is only a few pixels to it.
- Whether a wrong box (a different bird, or not a bird) is worse than no box. The results above include those
  cases but do not count them.
- Birds the COCO "bird" class knows poorly. It was trained on everyday photographs; an ostrich, a nightjar on
  the ground or a bird in flight far off may not be found. Not split out by family.

## Permissive-only comparison (for issue 158)

The owner wants the published weights to be as permissive as possible. A second model was trained on CC0 and
CC BY photos only: same base model, same settings, same 5,889 test photos, none of them in its training set.
Its photo list is `training/identify-photo/manifest-permissive.csv.gz`.

**Decision (owner, 2026-11-12): the permissive-only model is too weak and is dropped.** It is not shipped and
not published. The model trained on all five licences is the one the site uses and the one that goes to
Hugging Face, under a non-commercial licence; its Hugging Face model card must say that a permissive-only
model was tried and why it was dropped, with the numbers below.

| | All five licences (shipped) | CC0 and CC BY only |
| --- | --- | --- |
| Training photos | 180,892 | 124,882 |
| Median training photos per species | 400 | 289 |
| Median observers per species | 225 | 77 |
| Species with fewer than 50 training photos | 3 | 78 |
| Right species first | 82.3% | 73.3% |
| Right species in the top three (target 80%) | 92.2% | 85.8% |
| Right family (target 90%) | 92.4% | 87.5% |
| Families reaching 90% on family, of 86 | 57 | 41 |
| Families reaching 80% on species in the top three, of 86 | 83 | 69 |
| Test photos where neither species nor family is confident | 1,231 | 2,027 |

Both files are the 8-bit export at 288 pixels. The permissive-only model meets the top-three target and
misses the family target.

The loss falls almost entirely on species with few permissive photos:

| CC0 and CC BY training photos | Species | Top three, shipped | Top three, permissive | Family, shipped | Family, permissive |
| --- | --- | --- | --- | --- | --- |
| 0 to 9 | 11 | 84% | 27% | 86% | 57% |
| 10 to 49 | 67 | 87% | 63% | 89% | 73% |
| 50 to 99 | 40 | 95% | 85% | 94% | 87% |
| 100 to 199 | 78 | 93% | 89% | 94% | 90% |
| 200 to 399 | 91 | 94% | 92% | 94% | 92% |
| 400 | 206 | 92% | 92% | 92% | 91% |

Bushveld Pipit has no CC0 or CC BY photo at all, so the permissive model can never return it. Grey-rumped
Swallow has one, Barratt's Warbler and Orange-winged Pytilia two, Lemon-breasted Canary three. The look-alike
groups suffer most: cisticolas fall from 87% to 70% in the top three, pipits and wagtails from 94% to 76%,
grassbirds from 84% to 58%.

Which licence the weights could carry, read cautiously (this is not legal advice, and whether model weights
are a derivative of their training photos is not settled law):

- **All five licences:** non-commercial, because 85% of the photos are CC BY-NC or CC BY-NC-SA, and arguably
  share-alike, because CC BY-SA and CC BY-NC-SA photos are in the set. CC BY-NC-SA 4.0 is the safe choice.
- **CC0 and CC BY only:** a permissive licence that keeps attribution, such as Apache 2.0 or CC BY 4.0, with
  the photo list published beside the weights as the attribution. The base model's weights are Apache 2.0.

## Limits

- **Not measured on a phone.** Speed and memory were measured on a desktop computer and in desktop Chromium
  and WebKit only. No Android phone or iPhone has run it.
- **The test photos are iNaturalist photos.** Many are taken with long lenses by practised observers. A phone
  photo of a small, distant bird will do worse than these numbers; the page crops to the bird to help (see
  "Finding the bird and cropping to it").
- **The cut-offs are a starting point.** They come from the test photos above and should be reset once phone
  photos have been scored.
- **Twelve test photos a species is few.** A per-species figure moves 8 points with one photo.
- **Month of the year** changes almost nothing (82.3% to 82.4% species first). Only 19 test photos were taken
  in a month their species is listed as absent, so the out-of-season weight of 0.5 is not really tested.
- It knows only adult and young birds as they appear in the training photos. It was not told sex, age or
  plumage, and nests, eggs, feathers and tracks were not separated out.
- A species added to the guide later is listed on the page as not covered until the model is retrained.

## Published copy (issue 158)

The model is also published at https://huggingface.co/FTruter/knp-birds-photo for people who want to build
on it. The site never downloads from there; R2 stays its source. Each revision is tagged with the model
version, which is the `models/<version>/` folder in R2, so a version on the site can be traced to its weights.

It holds the `.tflite` file R2 serves (same SHA-256), the PyTorch weights it was converted from
(`photo-model.safetensors`), a model card written from `data/identify/photo-model.json` by
`scripts/huggingface.mjs`, the class list, the list of every training photo with its source URL, author and
licence, the 5,889 test photos with the same details, `training/identify-photo/`, and the BirdNET label
mapping the sound page uses. BirdNET itself is not republished.

Licences there: the weights CC BY-NC-SA 4.0, bounded by the training photos; the training code 0BSD; the
model card, labels and mapping CC0 1.0; each test photo under its photographer's own licence.

`pnpm run models:publish -- --only photo` uploads to R2 and then to Hugging Face. `--dry-run` shows both.

## Rebuilding it

`training/identify-photo/README.md` has the steps. Nothing in them costs money.
