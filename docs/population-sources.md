# Kruger population estimates

**Date:** 2026-11-06  
**Deliverable:** `population` on each species document, plus family totals and index midpoints derived by `scripts/seed.mjs`.

This site cites numeric facts. It does not host the Kemp et al. 2001 PDF and it does not reproduce the appendix.

## Citation

Kemp A.C., Herholdt J.J., Whyte I. & Harrison J. (2001). Birds of the two largest national parks in South Africa: a method to generate estimates of population size for all species and assess their conservation ecology. South African Journal of Science 97: 393–403.

- Journal PDF: https://journals.co.za/doi/pdf/10.10520/EJC97367
- Sabinet archive PDF: http://reference.sabinet.co.za/webx/access/electronic_journals/sajsci/sajsci_v97_n9_a16.pdf

The 2001 article sits in the journal’s pre-CC archive. Copyright covers the paper’s expression, not the isolated numbers. Each species page cites the threshold that applies to that species. The licence of the article is left unknown on the credits page.

## Method and units

Kemp et al. estimated the number of **mature individuals** capable of reproduction, and snapped that estimate to a power of two. For a published threshold T = 2^n, the proportional band used here is **T/2 to 2T** (half to double). That is the only interval applied to Kemp rows.

A page leads with the threshold itself, written `± T`, and gives the band in the detail under it (`Range: T/2 to 2T`). Tables on a page show `T`. The Markdown and JSON forms give the band. An estimate that is not a Kemp band (an exact count, or a measured range) is shown as it is stored, because a midpoint would be a figure no source gives.

Status codes on `population.kemp.status`:

| Code | Meaning | How Kemp placed the threshold |
| --- | --- | --- |
| `RB` | Resident breeder | Lower of the two neighbouring thresholds (conservative). |
| `VB` | Visiting breeder | Upper neighbouring threshold (optimistic peak). |
| `NB` | Non-breeding visitor | Upper neighbouring threshold (optimistic peak). |

The extracted threshold is stored as published. This site does not recompute it. Kemp rows use `unit: "matureIndividuals"`, `confidence: "low"`, `asOf: 2001`, and `trend: "unknown"`. `tierApplied` is `D`.

A family total, the families index, the species index, and `iconicSpecies` use only those mature-individual figures. The index value is the midpoint `(low + high) / 2`. Groups, breeding pairs, and territories are not converted and are not added. If any species is left out, `population.complete` is false and the page says the total is incomplete.

## What was copied

The extract has **517** Kruger rows.

| Class | Count | What this guide stores |
| --- | --- | --- |
| Mapped rows | 455 | One Kemp threshold where the scientific name is unique. |
| Ambiguous paper rows | 7 | No number. |
| Species in this guide with no Kemp row | 40 | No number. |

455 mapped rows collapse to **453** scientific names. Two names were each attached to two different paper species:

- `Acrocephalus palustris` keeps **European Marsh Warbler** (explicit match, threshold 1 024, non-breeding visitor). The African Marsh Warbler row is a different taxon and is not used.
- `Circus ranivorus` keeps **African Marsh Harrier** (English-name match, threshold 4, non-breeding visitor). The European Marsh Harrier row is a different taxon and is not used.

Those two rejected rows are why 455 mapped rows become 453 species documents. The thresholds were not added together.

**449** species keep the Kemp range as the estimate (`tierApplied: "D"`). **4** species replace it with a later park survey and keep the Kemp range on `kempBaseline` (`tierApplied: "A"`):

| Species | Unit | Estimate | As of | Source |
| --- | --- | --- | --- | --- |
| Southern Ground-Hornbill, `Bucorvus leadbeateri` | `groups` | 180–180 | 2023 | SANParks Scientific Services, citizen monitoring |
| Saddle-billed Stork, `Ephippiorhynchus senegalensis` | `breedingPairs` | 25–30 | 2015 | SANParks, Kruger’s Big 6 |
| White-backed Vulture, `Gyps africanus` | `breedingPairs` | 742–1066 | 2015 | Murn et al. 2013; Murn & Botha 2016 |
| Martial Eagle, `Polemaetus bellicosus` | `territories` | 100–100 | 2023 | BirdLife South Africa Red List 2025 |

No other Tier A figure was added.

The 7 ambiguous rows were not copied. Five of them point at a name in this guide (`Tockus rufirostris`, `Anthoscopus caroli`, `Buteo buteo`, `Ardea brachyrhyncha`, and the Yellow-billed Kite row beside `Milvus migrans`). Cape Parrot and Black-rumped Buttonquail are not in the 493. `Milvus migrans` does receive the separate **Black Kite** row. It does not receive the Yellow-billed Kite threshold.

The 40 species with no Kemp row, and the four ambiguous names that are already in that set, keep `estimate.low` and `estimate.high` null. The note is: “No sourced Kruger estimate is currently available; taxonomy or later records require separate research.”

453 species with a cited figure and 40 without one are the 493 species in this guide. 7 ambiguous rows + 40 absent species are the 47 gaps in the extract. They are not 47 extra species files.
