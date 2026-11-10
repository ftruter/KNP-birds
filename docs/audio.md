# Call recordings

Species files keep the field notes. The recording played on a call slot comes from `data/audio/recordings.json`, merged in the Worker when HTML, Markdown, and JSON are rendered. A family edit to plumage or call prose does not have to touch that file.

```sh
node scripts/process-recordings.mjs
```

`npm run audio` is the same command. It reads every species that already has a `calls` array. It does not invent a call slot, a grade, a recordist, a place, or a licence.

## Where the metadata comes from

Xeno-canto API v3 (`https://xeno-canto.org/api/3/recordings`) is used when `XENO_CANTO_API_KEY` is set. The key is a member key from the xeno-canto account page. Do not commit it.

Without a key, the script reads the public explore catalogue and normalises each row to the API v3 recording fields: `id`, `q`, `rec`, `cnt`, `loc`, `type`, `file`, `lic`, `url`, and `also`. Pages are cached under `data/audio/.cache/`, which is gitignored.

## How a slot is chosen

A recording the site can play comes first. ND licences can only be linked, so the page shows no player for them, and a playable file ranks ahead of any ND file whatever its grade. Within each of those two groups, quality decides: A, then B, then C, then D, then E. Unrated recordings are skipped. Then a recording whose type matches the slot (song, call, alarm, contact, duet, other) ranks ahead of a mismatched type. After that, Kruger-region and Mpumalanga or Limpopo recordings rank ahead of the rest of South Africa, then the rest of southern Africa, then anywhere else.

Accepted licences are CC BY, BY-SA, BY-NC, BY-NC-SA, BY-ND, BY-NC-ND, and CC0, each with its version taken from the licence URL. Anything else is not selected. A slot whose current recording is already grade A is not replaced. A lower grade is replaced only when a strictly higher grade exists, and a slot that can already be played is never swapped for an ND file. An empty slot, or one holding only an ND file, takes the best candidate by the order above. A slot for a male or female call is never filled or swapped: catalogue cuts are rarely labelled by sex, so those recordings are chosen by hand in the species file and the run only records their grade. The grade is stored on the recording as `quality`.

ND licences may be linked. They are never edited.

## Permission requests

When an ND recording is graded above the file a slot keeps or takes, the run lists it under `permissionRequests` in `data/audio/report.json`, with the recordist, the xeno-canto page, the grade, and the file it would replace. Those are the recordists to write to, politely, asking whether the guide may play or host that file. Until a recordist agrees, the slot keeps its playable file.

## Cleaning

A file is filtered only when the best recording still available for that slot is grade C or worse, and the licence allows derivatives. The European Roller recording XC634335 is in that set when no A or B replacement is found. The filter is a high-pass below the call's low edge (500 Hz when the call sits above about 550 Hz, 300 Hz when it sits above about 400 Hz, otherwise lower so the call itself is kept) and a light `afftdn` noise reduction (`nr=6`). If the result loses more than half the level of the original, it is discarded.

The cleaned mp3 is uploaded to the existing R2 bucket `knp-birds-images`. That upload needs `CLOUDFLARE_API_TOKEN` with access to the bucket. Without the token the script still writes the selection, leaves the derivative under `data/audio/files/` (gitignored), and does not set `hosted` or the edit note, so the page does not claim a filter it cannot play. When the upload succeeds, the recording has `hosted: true`, the original xeno-canto page in `source`, the original recordist in `author`, the same licence, and:

```text
Wind noise reduced (high-pass filter and noise reduction)
```

That note is shown on the species HTML, Markdown, and JSON pages, and on the credits page. Local downloads under `data/audio/files/` are gitignored. The script does not publish KV and does not deploy the Worker. `npm run kv:dry-run` refreshes `data/index/credits.json` from the overlay.

`data/audio/report.json` is the run log: swapped, added, kept, cleaned, and slots that still have no usable recording.
