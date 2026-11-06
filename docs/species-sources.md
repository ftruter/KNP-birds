# KNP bird species — research notes

**Date:** 2026-11-02 (Africa/Johannesburg)  
**Deliverable:** `data/index/species.json`  
**Scope:** Bird species that regularly occur in Kruger National Park (and Marloth Park / south of the Crocodile River): residents, regular migrants, and regular visitors. Rare and accidental vagrants are excluded. Population figures are cited separately in [population-sources.md](population-sources.md). This note records how the species list was chosen. At the time of that list, every `population` value was still `null`.

The index is a keyed dictionary (scientific name → `{ en, af, population }`), keys sorted alphabetically, 2-space indent. It matches the species index shape in [ftruter/KNP-birds](https://github.com/ftruter/KNP-birds). `family` is not stored on the index. It lives on each species document, as a family slug. `population` is `null` here, not `0`. The families index uses `0` for an unknown total. A species index entry stays `null` until an estimate exists.

## Summary

- **Total species:** 493
- **Families represented:** 86 of 86 in `families.json`
- **Families with zero species:** 0 — none
- **Species whose family is not in the 86:** 0 — none (would have been flagged, not added)
- **Null Afrikaans names:** 0
- **Duplicate English names:** 0 — none
- **`population`:** null on this list when it was first written. Kemp et al. 2001 figures now live on the species documents. See [population-sources.md](population-sources.md).

## Sources

1. **Birda / SABAP2 Kruger National Park Birding Checklist** (Excel download from the Birda checklist page; 531 IOC rows with Kruger SABAP2 observation counts). Primary inclusion filter and abundance signal.  
   https://birda.org/kruger-national-park-birding-checklist/  
   Local copy: `Kruger-National-Park-Birding-Checklist.xlsx`.
2. **BirdLife South Africa Checklist of Birds in South Africa 2026** (v16.2 Excel, Names-list sheet). Authority for scientific names, English names, Afrikaans names, and vagrant (`V`) status.  
   https://birdlife.org.za/resource/birdlife-south-africa-checklist-of-birds-in-south-africa/  
   Local copy: `SA-Bird-Checklist-v16.2-2026.xlsx` (also `blsa-2026.pdf` / `blsa-2026.txt` from the families work).
3. **`data/index/families.json`** (86 keys, also live at https://birds.truter.world/families.json) — every species family must be one of these. The family is not copied onto the species index.
4. **SANParks Kruger birds checklist** and **Avibase — Kruger National Park** — consulted for context on regular vs vagrant. Earlier HTTP 403 blocked live fetches, so they informed borderline judgement rather than supplying the master list.  
   https://www.sanparks.org/parks/kruger/explore/fauna-flora/birds/checklist  
   https://avibase.bsc-eoc.org/checklist.jsp?region=ZA000003
5. **Marloth Park** treated as part of the KNP birding area (same as families workstream).

## Method

- Start from Birda SABAP2 Kruger rows; map IOC group → scientific family via the same mapping used for families research.
- **Include** if SABAP2 Kruger count ≥ 3, family ∈ `families.json`, not introduced / data-error / extra-limital, and not BLSA-`V` with count < 30.
- Resolve scientific / English names to BLSA 2026 via direct sci match, forced remaps (Kruger-aware taxonomy; see below), then English alias match.
- Afrikaans taken only from BLSA column 16 (`Af`).
- Merge Birda splits that BLSA lumps (e.g. Green-/Grey-backed Camaroptera → Bleating; Northern+Southern Red-billed Hornbill labels → Southern for Kruger).
- Sort keys alphabetically by scientific name; write pretty JSON.

## Taxonomy remaps (Birda / outdated → BLSA 2026)

These are intentional Kruger-aware corrections, not silent invents:

- African Crake (Crex egregia) → **African Crake (Crecopsis egregia)** (SABAP2 knp=44)
- African Fish Eagle (Haliaeetus vocifer) → **African Fish Eagle (Icthyophaga vocifer)** (SABAP2 knp=11310)
- African Goshawk (Accipiter tachiro) → **African Goshawk (Aerospiza tachiro)** (SABAP2 knp=1805)
- Woolly-necked Stork (Ciconia episcopus) → **African Woolly-necked Stork (Ciconia microscelis)** (SABAP2 knp=2389)
- Ashy flycatcher (Muscicapa caerulescens) → **Ashy Flycatcher (Fraseria caerulescens)** (SABAP2 knp=3151)
- Banded martin (Riparia cincta) → **Banded Martin (Neophedina cincta)** (SABAP2 knp=9)
- Bearded Scrub Robin (Cercotrichas quadrivirgata) → **Bearded Scrub Robin (Tychaedon quadrivirgata)** (SABAP2 knp=1581)
- Black crake (Amaurornis flavirostra) → **Black Crake (Zapornia flavirostra)** (SABAP2 knp=4877)
- Black Sparrowhawk (Accipiter melanoleucus) → **Black Sparrowhawk (Astur melanoleucus)** (SABAP2 knp=170)
- Black-faced Waxbill (Estrilda erythronotos) → **Black-faced Waxbill (Brunhilda erythronotos)** (SABAP2 knp=4)
- Grey-backed camaroptera (Camaroptera brevicaudata) → **Bleating Camaroptera (Camaroptera brachyura)** (SABAP2 knp=2066)
- Bronze mannikin (Lonchura cucullata) → **Bronze Mannikin (Spermestes cucullata)** (SABAP2 knp=3355)
- Brown scrub robin (Cercotrichas signata) → **Brown Scrub Robin (Tychaedon signata)** (SABAP2 knp=10)
- White-browed Coucal (Centropus superciliosus) → **Burchell’s Coucal (Centropus burchellii)** (SABAP2 knp=8531)
- Cape robin-chat (Cossypha caffra) → **Cape Robin-chat (Dessonornis caffer)** (SABAP2 knp=758)
- Caspian Plover (Charadrius asiaticus) → **Caspian Plover (Anarhynchus asiaticus)** (SABAP2 knp=15)
- Chestnut-banded Plover (Charadrius pallidus) → **Chestnut-banded Plover (Anarhynchus pallidus)** (SABAP2 knp=3)
- Dark-capped bulbul (Pycnonotus tricolor) → **Common (Dark-capped) Bulbul (Pycnonotus barbatus)** (SABAP2 knp=16330)
- African reed warbler (Acrocephalus baeticatus) → **Common Reed Warbler (Acrocephalus scirpaceus)** (SABAP2 knp=414)
- Common Whitethroat (Sylvia communis) → **Common Whitethroat (Curruca communis)** (SABAP2 knp=15)
- Coqui francolin (Peliperdix coqui) → **Coqui Francolin (Campocolinus coqui)** (SABAP2 knp=683)
- Crested Francolin (Dendroperdix sephaena) → **Crested Francolin (Ortygornis sephaena)** (SABAP2 knp=12137)
- Dwarf Bittern (Ixobrychus sturmii) → **Dwarf Bittern (Botaurus sturmii)** (SABAP2 knp=238)
- Fiscal flycatcher (Melaenornis silens) → **Fiscal Flycatcher (Sigelus silens)** (SABAP2 knp=187)
- Flappet Lark (Mirafra rufocinnamomea) → **Flappet Lark (Amirafra rufocinnamomea)** (SABAP2 knp=624)
- White-breasted cormorant (Phalacrocorax lucidus) → **Great (White-breasted) Cormorant (Phalacrocorax carbo)** (SABAP2 knp=1861)
- American Flamingo (Phoenicopterus ruber) → **Greater Flamingo (Phoenicopterus roseus)** (SABAP2 knp=56)
- Grey Go-away-bird (Corythaixoides concolor) → **Grey Go-away-bird (Crinifer concolor)** (SABAP2 knp=16946)
- Grey tit-flycatcher (Myioparus plumbeus) → **Grey Tit-flycatcher (Fraseria plumbea)** (SABAP2 knp=3044)
- Kittlitz's Plover (Charadrius pecuarius) → **Kittlitz’s Plover (Anarhynchus pecuarius)** (SABAP2 knp=656)
- Lemon dove (Columba larvata) → **Lemon Dove (Aplopelia larvata)** (SABAP2 knp=27)
- Little Bittern (Ixobrychus minutus) → **Little Bittern (Botaurus minutus)** (SABAP2 knp=137)
- Striated Heron (Butorides striata) → **Little Heron (Butorides atricapilla)** (SABAP2 knp=5366)
- Little Sparrowhawk (Accipiter minullus) → **Little Sparrowhawk (Tachyspiza minulla)** (SABAP2 knp=1382)
- Magpie Mannikin (Lonchura fringilloides) → **Magpie Mannikin (Spermestes fringilloides)** (SABAP2 knp=39)
- Marico Flycatcher (Melaenornis mariquensis) → **Marico Flycatcher (Bradornis mariquensis)** (SABAP2 knp=203)
- Long-billed Pipit (Anthus similis) → **Nicholson’s Pipit (Anthus nicholsoni)** (SABAP2 knp=9)
- Pale flycatcher (Melaenornis pallidus) → **Pale Flycatcher (Agricola pallidus)** (SABAP2 knp=860)
- Black-and-white Mannikin (Lonchura bicolor) → **Red-backed Mannikin (Spermestes bicolor)** (SABAP2 knp=264)
- Red-billed oxpecker (Buphagus erythrorynchus) → **Red-billed Oxpecker (Buphagus erythroryncha)** (SABAP2 knp=13974)
- Rufous-naped Lark (Mirafra africana) → **Rufous-naped Lark (Corypha africana)** (SABAP2 knp=2410)
- Shikra (Accipiter badius) → **Shikra (Tachyspiza badia)** (SABAP2 knp=771)
- Northern Carmine Bee-eater (Merops nubicus) → **Southern Carmine Bee-eater (Merops nubicoides)** (SABAP2 knp=2670)
- Crested Guineafowl (Guttera pucherani) → **Southern Crested Guineafowl (Guttera edouardi)** (SABAP2 knp=605)
- Northern Red-billed Hornbill (Tockus erythrorhynchus) → **Southern Red-billed Hornbill (Tockus rufirostris)** (SABAP2 knp=12974)
- Northern Yellow White-eye (Zosterops senegalensis) → **Southern Yellow White-eye (Zosterops anderssoni)** (SABAP2 knp=298)
- Three-banded Plover (Charadrius tricollaris) → **Three-banded Plover (Thinornis tricollaris)** (SABAP2 knp=9425)
- Ethiopian Boubou (Laniarius aethiopicus) → **Tropical Boubou (Laniarius major)** (SABAP2 knp=1504)
- Verreaux's Eagle-Owl (Bubo lacteus) → **Verreaux’s Eagle-Owl (Ketupa lactea)** (SABAP2 knp=2120)
- Violet-eared Waxbill (Uraeginthus granatinus) → **Violet-eared Waxbill (Granatina granatina)** (SABAP2 knp=199)
- Western Cattle Egret (Bubulcus ibis) → **Western Cattle Egret (Ardea ibis)** (SABAP2 knp=4644)
- White-backed night heron (Gorsachius leuconotus) → **White-backed Night Heron (Calherodius leuconotus)** (SABAP2 knp=100)
- White-fronted Plover (Charadrius marginatus) → **White-fronted Plover (Anarhynchus marginatus)** (SABAP2 knp=635)
- White-throated robin-chat (Cossypha humeralis) → **White-throated Robin-chat (Dessonornis humeralis)** (SABAP2 knp=3502)
- Intermediate egret (Ardea intermedia) → **Yellow-billed Egret (Ardea brachyrhyncha)** (SABAP2 knp=594)

Notable special cases:

- **Southern Carmine Bee-eater** — Birda listed only “Northern Carmine” (`Merops nubicus`, 2670 records) with no Southern row; Kruger birds are Southern (`Merops nubicoides`). Remapped.
- **Southern Red-billed Hornbill** — Birda’s “Northern Red-billed” (12974) + tiny “Southern” (15) collapsed to BLSA `Tockus rufirostris`; Damara form (13) excluded.
- **Yellow-billed Egret** — Birda “Intermediate Egret” (`Ardea intermedia`) → BLSA `Ardea brachyrhyncha`.
- **Black Kite** — BLSA 2026 lists only `Milvus migrans` (no separate Yellow-billed Kite); Birda likewise has a single Black Kite row. Kept as one species.

## Borderline species kept (SABAP2 Kruger count 3–19)

40 species kept with low but non-zero regular signal (count < 20). Full list:

| knp | English | Scientific | Family |
|----:|---------|------------|--------|
| 3 | Barratt’s Warbler | Bradypterus barratti | Locustellidae |
| 3 | Black-winged Pratincole | Glareola nordmanni | Glareolidae |
| 3 | Cape Crow | Corvus capensis | Corvidae |
| 3 | Chestnut-banded Plover | Anarhynchus pallidus | Charadriidae |
| 4 | Barred Wren-Warbler | Calamonastes fasciolatus | Cisticolidae |
| 4 | Black-faced Waxbill | Brunhilda erythronotos | Estrildidae |
| 4 | Black-fronted Bush-shrike | Chlorophoneus nigrifrons | Malaconotidae |
| 4 | Black-throated Canary | Crithagra atrogularis | Fringillidae |
| 5 | Malachite Sunbird | Nectarinia famosa | Nectariniidae |
| 5 | Pectoral Sandpiper | Calidris melanotos | Scolopacidae |
| 5 | Red-necked Spurfowl | Pternistis afer | Phasianidae |
| 5 | Yellow-streaked Greenbul | Phyllastrephus flavostriatus | Pycnonotidae |
| 6 | African Marsh Harrier | Circus ranivorus | Accipitridae |
| 6 | Black-chested Prinia | Prinia flavicans | Cisticolidae |
| 6 | Forest Buzzard | Buteo trizonatus | Accipitridae |
| 6 | Palm-nut Vulture | Gypohierax angolensis | Accipitridae |
| 6 | Striped Crake | Aenigmatolimnas marginalis | Rallidae |
| 7 | Cape Rock Thrush | Monticola rupestris | Muscicapidae |
| 7 | Red-footed Falcon | Falco vespertinus | Falconidae |
| 7 | White-necked Raven | Corvus albicollis | Corvidae |
| 7 | White-starred Robin | Pogonocichla stellata | Muscicapidae |
| 8 | Yellow-throated Woodland Warbler | Phylloscopus ruficapilla | Phylloscopidae |
| 9 | Banded Martin | Neophedina cincta | Hirundinidae |
| 9 | Blue-spotted Wood Dove | Turtur afer | Columbidae |
| 9 | Nicholson’s Pipit | Anthus nicholsoni | Motacillidae |
| 9 | River Warbler | Locustella fluviatilis | Locustellidae |
| 9 | Scaly-feathered Finch (Weaver) | Sporopipes squamifrons | Ploceidae |
| 9 | Western Yellow Wagtail | Motacilla flava | Motacillidae |
| 10 | Brown Scrub Robin | Tychaedon signata | Muscicapidae |
| 10 | Collared Palm Thrush | Cichladusa arquata | Muscicapidae |
| 12 | Corn Crake | Crex crex | Rallidae |
| 13 | Forest Canary | Crithagra scotops | Fringillidae |
| 15 | Caspian Plover | Anarhynchus asiaticus | Charadriidae |
| 15 | Common Whitethroat | Curruca communis | Sylviidae |
| 15 | Karoo Thrush | Turdus smithi | Turdidae |
| 16 | Rudd’s Apalis | Apalis ruddi | Cisticolidae |
| 17 | African Snipe | Gallinago nigripennis | Scolopacidae |
| 17 | Yellow (Eastern Golden) Weaver | Ploceus subaureus | Ploceidae |
| 18 | African Rail | Rallus caerulescens | Rallidae |
| 18 | Common Square-tailed Drongo | Dicrurus ludwigii | Dicruridae |

## Species / rows excluded

36 Birda rows excluded. Categories:

### Explicit exclude (introduced, data error, extra-limital, or not on BLSA) (12)

- Blackpoll Warbler (`Setophaga striata`), knp=4342 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Cape Parrot (`Poicephalus robustus`), knp=660 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Brown Firefinch (`Lagonosticta nitidula`), knp=160 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Mallard (`Anas platyrhynchos`), knp=42 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Damara Red-billed Hornbill (`Tockus damarensis`), knp=13 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Indian Peafowl (`Pavo cristatus`), knp=10 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Southern Hyliota (`Hyliota australis`), knp=5 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Rose-ringed Parakeet (`Psittacula krameri`), knp=4 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- African Broadbill (`Smithornis capensis`), knp=3 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Miombo Blue-eared Starling (`Lamprotornis elisabeth`), knp=3 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Northern Grey-headed Sparrow (`Passer griseus`), knp=3 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)
- Fairy Flycatcher (`Stenostira scita`), knp=2 — explicit exclude (introduced / data error / non-KNP / not on BLSA / excluded family)

### BLSA status V and low Kruger count (< 30) (3)

- Northern Wheatear (`Oenanthe oenanthe`), knp=12 — BLSA vagrant + low count (12)
- Madagascan Cuckoo (`Cuculus rochii`), knp=5 — BLSA vagrant + low count (5)
- Egyptian vulture (`Neophron percnopterus`), knp=4 — BLSA vagrant + low count (4)

### Extreme vagrant (SABAP2 Kruger count < 3) (21)

- Black-winged Lapwing (`Vanellus melanopterus`), knp=2 — extreme vagrant (SABAP2 Kruger count=2 < 3)
- Long-tailed Widowbird (`Euplectes progne`), knp=2 — extreme vagrant (SABAP2 Kruger count=2 < 3)
- Sooty tern (`Onychoprion fuscatus`), knp=2 — extreme vagrant (SABAP2 Kruger count=2 < 3)
- Southern Tchagra (`Tchagra tchagra`), knp=2 — extreme vagrant (SABAP2 Kruger count=2 < 3)
- Wailing Cisticola (`Cisticola lais`), knp=2 — extreme vagrant (SABAP2 Kruger count=2 < 3)
- African Grass Owl (`Tyto capensis`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- African Hobby (`Falco cuvierii`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Bar-tailed Godwit (`Limosa lapponica`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Cape Bunting (`Emberiza capensis`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Cape Shoveler (`Spatula smithii`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Common Tern (`Sterna hirundo`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Dark-backed Weaver (`Ploceus bicolor`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Double-banded courser (`Rhinoptilus africanus`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Grey Waxbill (`Estrilda perreini`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Red Phalarope (`Phalaropus fulicarius`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Red-winged francolin (`Scleroptila levaillantii`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Rufous-bellied Heron (`Ardeola rufiventris`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Slaty Egret (`Egretta vinaceigula`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- South African Cliff Swallow (`Petrochelidon spilodera`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Tree Pipit (`Anthus trivialis`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)
- Wing-snapping Cisticola (`Cisticola ayresii`), knp=1 — extreme vagrant (SABAP2 Kruger count=1 < 3)

### Explicit-exclude rationale (highlights)

- **Blackpoll Warbler** (`Setophaga striata`, knp=4342) — New World warbler; Birda data error / wrong group; family not in the 86.
- **Cape Parrot**, **Rose-ringed Parakeet**, **Indian Peafowl**, **Mallard** — introduced / not wild KNP regulars (Cape Parrot is a forest endemic elsewhere).
- **African Broadbill**, **Fairy Flycatcher**, **Southern Hyliota** — families deliberately omitted from the 86 (extra-limital / not Kruger regulars).
- **Brown Firefinch** — not on BLSA SA checklist.
- **Northern Grey-headed Sparrow**, **Miombo Blue-eared Starling** — not the Kruger forms / BLSA vagrant.
- **Damara Red-billed Hornbill** — not treated as a separate regular Kruger species (tiny count; form not used as BLSA key here).
- **Egyptian Vulture**, **Madagascan Cuckoo**, **Northern Wheatear** — BLSA `V` with very low Kruger counts.

## Counts per family

| Family | Species | English family (from families.json) |
|--------|--------:|-------------------------------------|
| Accipitridae | 40 | Hawks, eagles and kites |
| Muscicapidae | 24 | Chats and Old World flycatchers |
| Cisticolidae | 21 | Cisticolas and allies |
| Estrildidae | 18 | Waxbills and allies |
| Ploceidae | 18 | Weavers and widowbirds |
| Ardeidae | 15 | Herons, egrets and bitterns |
| Cuculidae | 14 | Cuckoos |
| Hirundinidae | 14 | Swallows and martins |
| Anatidae | 13 | Ducks, geese and swans |
| Columbidae | 13 | Pigeons and doves |
| Malaconotidae | 12 | Bushshrikes |
| Charadriidae | 11 | Plovers and lapwings |
| Motacillidae | 11 | Wagtails and pipits |
| Nectariniidae | 10 | Sunbirds |
| Rallidae | 10 | Rails, crakes and coots |
| Scolopacidae | 10 | Sandpipers and snipes |
| Alaudidae | 9 | Larks |
| Alcedinidae | 9 | Kingfishers |
| Apodidae | 9 | Swifts |
| Falconidae | 9 | Falcons and kestrels |
| Strigidae | 9 | Owls |
| Sturnidae | 9 | Starlings |
| Acrocephalidae | 8 | Reed warblers and allies |
| Ciconiidae | 8 | Storks |
| Phasianidae | 8 | Francolins, spurfowl and quails |
| Viduidae | 7 | Indigobirds and whydahs |
| Caprimulgidae | 6 | Nightjars |
| Fringillidae | 6 | Finches and canaries |
| Meropidae | 6 | Bee-eaters |
| Picidae | 6 | Woodpeckers |
| Bucerotidae | 5 | Hornbills |
| Coraciidae | 5 | Rollers |
| Glareolidae | 5 | Coursers and pratincoles |
| Laniidae | 5 | Shrikes |
| Lybiidae | 5 | African barbets |
| Pycnonotidae | 5 | Bulbuls |
| Threskiornithidae | 5 | Ibises and spoonbills |
| Indicatoridae | 4 | Honeyguides |
| Laridae | 4 | Gulls, terns and skimmers |
| Locustellidae | 4 | Grassbirds and allies |
| Passeridae | 4 | Old World sparrows |
| Turdidae | 4 | Thrushes |
| Campephagidae | 3 | Cuckooshrikes |
| Corvidae | 3 | Crows and ravens |
| Emberizidae | 3 | Buntings |
| Oriolidae | 3 | Orioles |
| Otididae | 3 | Bustards |
| Platysteiridae | 3 | Wattle-eyes and batises |
| Buphagidae | 2 | Oxpeckers |
| Burhinidae | 2 | Thick-knees |
| Coliidae | 2 | Mousebirds |
| Dicruridae | 2 | Drongos |
| Jacanidae | 2 | Jacanas |
| Macrosphenidae | 2 | African warblers |
| Monarchidae | 2 | Monarchs |
| Musophagidae | 2 | Turacos |
| Numididae | 2 | Guineafowl |
| Pelecanidae | 2 | Pelicans |
| Phalacrocoracidae | 2 | Cormorants |
| Phoenicopteridae | 2 | Flamingos |
| Phoeniculidae | 2 | Wood-hoopoes |
| Phylloscopidae | 2 | Leaf warblers |
| Psittacidae | 2 | African and New World parrots |
| Recurvirostridae | 2 | Stilts and avocets |
| Sarothruridae | 2 | Flufftails |
| Sylviidae | 2 | Sylviid warblers |
| Vangidae | 2 | Helmetshrikes |
| Anhingidae | 1 | Darters |
| Bucorvidae | 1 | Ground-hornbills |
| Heliornithidae | 1 | Finfoots |
| Leiothrichidae | 1 | Laughingthrushes and babblers |
| Nicatoridae | 1 | Nicators |
| Pandionidae | 1 | Ospreys |
| Paridae | 1 | Tits |
| Podicipedidae | 1 | Grebes |
| Pteroclidae | 1 | Sandgrouse |
| Remizidae | 1 | Penduline tits |
| Rostratulidae | 1 | Painted-snipes |
| Sagittariidae | 1 | Secretarybird |
| Scopidae | 1 | Hamerkop |
| Struthionidae | 1 | Ostriches |
| Trogonidae | 1 | Trogons |
| Turnicidae | 1 | Buttonquails |
| Tytonidae | 1 | Barn owls |
| Upupidae | 1 | Hoopoes |
| Zosteropidae | 1 | White-eyes |

Sum of per-family counts = 493 (matches total).

## Flags

- **Zero-species families:** none of the 86.
- **Species with family not in the 86:** none retained. Rows whose IOC group maps outside the 86 were excluded (see above).
- **Null Afrikaans:** none after remaps.
- **Count vs target band (500–540):** **493** after merging BLSA lumps and applying the ≥3 filter. Slightly under the band; raising the ceiling would mainly re-admit knp=1–2 vagrants (e.g. African Hobby, Rufous-bellied Heron, Grey Waxbill) that we treated as non-regular. Easy to revisit.

## Validation

- Valid JSON object in the species index shape `{ en, af, population }`
- Keys sorted A–Z by scientific name
- Every species family (held beside the index while the list was built, and later on the species document) is one of the 86 keys in `data/index/families.json`
- No duplicate English names
- All `af` non-null. Population values are no longer all null; see [population-sources.md](population-sources.md).

