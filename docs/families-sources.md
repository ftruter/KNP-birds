# KNP bird families — research notes

**Date:** 2026-10-30 (Africa/Johannesburg)  
**Deliverable:** `data/index/families.json`  
**Scope:** Bird families that regularly occur in Kruger National Park (and Marloth Park / south of the Crocodile River): residents, regular migrants, and regular visitors. Families represented only by rare/accidental vagrants are excluded. Population counts are `0` for every family (to be derived later from species).

## Family count

**86 families** under current **IOC / BirdLife South Africa** taxonomy.

That is slightly above the “about 70–80” figure often quoted for Kruger. The difference is mostly **IOC splits** of groups that older Roberts / field-guide lists treated as one family (warblers, flycatchers/chats, helmetshrikes, babblers, etc.). Under a Roberts-VII-style lumping the same avifauna collapses closer to ~75–80 family headings.

## Format

Keyed dictionary (scientific family name → `{ en, af, population }`), keys sorted alphabetically, 2-space indent. Matches `data/index/families.json` in [ftruter/KNP-birds](https://github.com/ftruter/KNP-birds).

### Agreement with sample entries

| Family | Sample `en` / `af` | This file |
| --- | --- | --- |
| Accipitridae | Hawks, eagles and kites / `null` | same |
| Bucorvidae | Ground-hornbills / Bromvoëls | same |
| Coraciidae | Rollers / Troupante | same |

`population` is `0` here (sample had `null`); per product request for this seed step.

## Sources

1. **Birda / SABAP2 Kruger checklist** (observation counts per species, IOC English groups) — primary filter for “regular” vs extreme vagrant:  
   https://birda.org/kruger-national-park-birding-checklist/  
   Underlying GBIF download cited there: https://doi.org/10.15468/dl.9k98vu  

2. **BirdLife South Africa Checklist of Birds in South Africa 2026** (official national list / IOC-based taxonomy):  
   https://birdlife.org.za/resource/birdlife-south-africa-checklist-of-birds-in-south-africa/  
   PDF: https://birdlife.org.za/wp-content/uploads/BLSA-Checklist-2026-v3.pdf  

3. **SANParks Kruger birds checklist** (546 species listed for the park):  
   https://www.sanparks.org/parks/kruger/explore/fauna-flora/birds/checklist  

4. **Avibase — Kruger National Park** (family-ordered checklist; Clements default, IOC option):  
   https://avibase.bsc-eoc.org/checklist.jsp?region=ZA000003  

5. **Wikipedia — List of birds of South Africa** (family structure cross-check; Clements presentation, BLSA status notes):  
   https://en.wikipedia.org/wiki/List_of_birds_of_South_Africa  

6. **Waterberg Bioquest — Voëls** (Afrikaans **family headings** + scientific names used as the main verified Afrikaans group-name source; Waterberg is outside KNP but the Afrikaans family vocabulary is standard southern African birding Afrikaans):  
   http://www.waterberg-bioquest.co.za/voels.html  

7. **Repo sample** (format + three seed families):  
   https://raw.githubusercontent.com/ftruter/KNP-birds/main/data/index/families.json  

Direct fetches of Avibase and the SANParks HTML/PDF from this environment returned HTTP 403; those URLs are still cited from search/index metadata and secondary quotings. Birda, BLSA PDF, Wikipedia, and Waterberg content were retrieved successfully.

## Inclusion rule used

A family is **included** if Birda’s SABAP2 Kruger table shows at least one species with a non-trivial Kruger observation count (typically dozens to thousands), consistent with resident / regular migrant / regular visitor status on SANParks / Avibase (i.e. not marked only as rare/accidental).

A family is **excluded** if Kruger records are only rare/accidental, coastal/pelagic-only, introduced-only, or absent from the SABAP2 Kruger summary.

## Borderline inclusions (kept)

| Family | Reason kept | Caveat |
| --- | --- | --- |
| Phoenicopteridae | Greater & Lesser Flamingo both in Birda Kruger counts (tens of records) | Irregular pan visitors, not everyday Kruger birds |
| Pelecanidae | Great White & Pink-backed Pelican present in Birda Kruger counts | Scarce visitors to larger waters |
| Laridae | Grey-headed Gull, Whiskered & White-winged Tern, African Skimmer | Inland/freshwater subset only; no marine-only gulls |
| Trogonidae | Narina Trogon (~90 SABAP2 Kruger records) | Scarce riverine/forest-edge |
| Sylviidae | Garden Warbler & Common Whitethroat as Palearctic migrants | Uncommon; family kept because they are regular (not accidental) migrants |
| Locustellidae | Little Rush Warbler common; River Warbler scarce migrant | Family presence driven by Little Rush Warbler |
| Nicatoridae | Eastern Nicator regular in suitable thicket (hundreds of records) | Local |
| Remizidae | Grey Penduline Tit regular | — |
| Heliornithidae | African Finfoot scarce but regular on rivers | — |
| Rostratulidae | Greater Painted-snipe regular at wetlands | — |
| Sarothruridae | Buff-spotted & Red-chested Flufftail recorded | Under-detected; low counts expected |
| Turnicidae | Common Buttonquail regular | — |

## Exclusions (not in `families.json`)

| Family | Reason |
| --- | --- |
| Gruidae (cranes) | No meaningful SABAP2 Kruger presence in Birda table; not a regular Kruger family |
| Calyptomenidae (African Broadbill) | Only a handful of Kruger atlas records → treat as rare |
| Hyliotidae (Southern Hyliota) | Vagrant-level Kruger counts |
| Stenostiridae (Fairy Flycatcher) | Vagrant-level Kruger counts |
| Pittidae (African Pitta) | Treated as vagrant on national lists; not a regular Kruger bird |
| Salpornithidae / Certhiidae (African Spotted Creeper) | Vagrant in South Africa / not regular in KNP |
| Promeropidae (sugarbirds) | Outside Kruger habitat/range |
| Chaetopidae (rockjumpers) | Drakensberg/Cape, not Kruger |
| Haematopodidae, Stercorariidae, Diomedeidae, Procellariidae, Oceanitidae, Hydrobatidae, Spheniscidae, Phaethontidae, Fregatidae, Sulidae, Chionidae, Dromadidae | Marine / coastal / pelagic — not Kruger inland avifauna |
| Psittaculidae (e.g. Rose-ringed Parakeet) | Introduced / not part of natural KNP avifauna |
| “New World Warblers” / Blackpoll Warbler in Birda | Obvious SABAP2 data error; ignored |

Species-only vagrants **inside** included families (e.g. Egyptian Vulture in Accipitridae, Senegal Coucal in Cuculidae, Racket-tailed Roller often scarce) do **not** remove the family; those species will be filtered at species-seed time.

## Taxonomy notes (IOC / BLSA vs older Roberts)

- **Helmetshrikes:** IOC/BLSA → **Vangidae**; older Roberts → Prionopidae. We use **Vangidae**. Afrikaans group name **Helmlaksmanne** (Waterberg) retained.
- **Babblers (Arrow-marked Babbler):** IOC → **Leiothrichidae**; older lists → Timaliidae. Afrikaans **Katlagters**.
- **Warbler splits:** old broad “Sylviidae” → **Acrocephalidae**, **Locustellidae**, **Macrosphenidae**, **Phylloscopidae**, **Cisticolidae**, **Sylviidae** s.s. Afrikaans family headings for the new IOC families are often unverified → several `af: null` (see below).
- **Chats vs thrushes:** chats/robin-chats/flycatchers → **Muscicapidae**; true thrushes → **Turdidae** (IOC). Waterberg still listed many chats under Turdidae (older arrangement).
- **Kingfishers:** kept as single family **Alcedinidae** (IOC / BLSA practice for SA lists; not split into Halcyonidae/Cerylidae).
- **Buffalo-weaver / sparrow-weavers:** IOC → **Ploceidae** (not Passeridae). **Passeridae** here = true sparrows (*Passer*, *Gymnoris*).
- **Cuckoo-finch (*Anomalospiza*):** IOC places with **Viduidae**; older lists sometimes with weavers.
- **Ground-hornbills:** separate family **Bucorvidae** (not inside Bucerotidae) — matches sample and IOC.

## Unverified / null Afrikaans group names

Set to `null` when no stable southern African **family** heading could be verified from Waterberg / sample (species Afrikaans names exist but are not used as invented family labels):

- **Accipitridae** — intentionally `null` (matches repo sample; Waterberg uses a long descriptive phrase, not a short group name)
- **Acrocephalidae**
- **Locustellidae**
- **Macrosphenidae**
- **Phylloscopidae**
- **Monarchidae** (Waterberg nested paradise-flycatchers under a broader flycatcher heading)
- **Nicatoridae** (species Afrikaans known; family heading not verified here)

Singular Waterberg headings (e.g. Hamerkop, Volstruis, Watertrapper, Bosloerie) are kept as published rather than inventing plurals.

## Next steps (out of scope here)

1. Seed `index/families` KV from this file (population still 0).  
2. Species research → fill `population` midpoints → roll up into family totals / `iconicSpecies`.  
3. Optionally replace `null` Afrikaans entries after checking Roberts VII names database / BLSA Afrikaans checklist family headers.
