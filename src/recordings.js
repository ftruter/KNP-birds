import overlayFile from '../data/audio/recordings.json' with { type: 'json' }
import { safeHttpUrl } from './escape.js'
import { licenceForbidsDerivatives } from './guide.js'

/** Same sentence on HTML, Markdown, and JSON when a file was filtered. */
export const MODIFIED_NOTE =
  'Wind noise reduced (high-pass filter and noise reduction)'

/** A is best. Unrated recordings are omitted rather than given a grade. */
export const QUALITY_RANK = { A: 5, B: 4, C: 3, D: 2, E: 1 }

const SOUTHERN_AFRICA = [
  'south africa',
  'mozambique',
  'zimbabwe',
  'botswana',
  'namibia',
  'eswatini',
  'swaziland',
  'lesotho',
  'zambia',
  'malawi',
]

const KRUGER =
  /kruger|skukuza|satara|letaba|shingwedzi|pafuri|lower sabie|crocodile bridge|berg-en-dal|pretoriuskop|orpen|malelane|phalaborwa|hoedspruit|klaserie|timbavati|sabi sand|mpumalanga|limpopo/i

const LICENCE_DEED = {
  by: 'BY',
  'by-sa': 'BY-SA',
  'by-nc': 'BY-NC',
  'by-nc-sa': 'BY-NC-SA',
  'by-nd': 'BY-ND',
  'by-nc-nd': 'BY-NC-ND',
}

const defaultOverlay = overlayFile

export const recordingOverlay = defaultOverlay

const decodeHtml = (value) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )

const cellText = (html) =>
  decodeHtml(
    html
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim(),
  )

const cellsOf = (row) => {
  const cells = []
  const marks = row.matchAll(/<td\b[^>]*>|<\/td>/gi)
  let depth = 0
  let start = -1
  for (const mark of marks) {
    if (mark[0].toLowerCase().startsWith('<td')) {
      if (depth === 0) start = mark.index + mark[0].length
      depth += 1
    } else {
      depth -= 1
      if (depth === 0 && start >= 0) cells.push(row.slice(start, mark.index))
    }
  }
  return cells
}

/**
 * Creative Commons deeds this non-commercial guide can attribute.
 * ND stays link-only and is never filtered. CC0 is accepted because it is
 * already less restrictive than the attribution licences.
 */
export const licenceFromUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const href = raw.startsWith('//') ? `https:${raw}` : raw
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const path = url.pathname.toLowerCase()
  const zero = path.match(/\/publicdomain\/zero\/(\d+\.\d+)\//)
  if (zero)
    return {
      license: `CC0 ${zero[1]}`,
      licenceUrl: `https://creativecommons.org/publicdomain/zero/${zero[1]}/`,
    }
  const deed = path.match(
    /\/licenses\/(by-nc-nd|by-nc-sa|by-nd|by-sa|by-nc|by)\/(\d+\.\d+)\//,
  )
  if (!deed || !LICENCE_DEED[deed[1]]) return null
  return {
    license: `CC ${LICENCE_DEED[deed[1]]} ${deed[2]}`,
    licenceUrl: `https://creativecommons.org/licenses/${deed[1]}/${deed[2]}/`,
  }
}

export const catalogueId = (recording) => {
  const key = String(recording?.key || '')
  const fromKey = key.match(/(?:^|\/)XC(\d+)/i)
  if (fromKey) return fromKey[1]
  const fromSource = String(recording?.source || '').match(
    /xeno-canto\.org\/(\d+)/i,
  )
  return fromSource ? fromSource[1] : ''
}

/** 3 Kruger, 2 rest of South Africa, 1 other southern Africa, 0 elsewhere. */
export const regionScore = (recording) => {
  const place = `${recording?.loc || ''} ${recording?.cnt || ''}`
  if (KRUGER.test(place)) return 3
  const lower = place.toLowerCase()
  if (lower.includes('south africa')) return 2
  return SOUTHERN_AFRICA.some((name) => lower.includes(name)) ? 1 : 0
}

/** Higher means the xeno-canto type fits the call slot. */
export const typeScore = (slotType, xcType) => {
  const text = String(xcType || '')
  const has = (word) => new RegExp(`\\b${word}s?\\b`, 'i').test(text)
  if (slotType === 'other') return text.trim() ? 1 : 0
  if (slotType === 'song') return has('song') ? 2 : 0
  if (slotType === 'duet') return has('duet') ? 2 : 0
  if (slotType === 'alarm') return has('alarm') ? 2 : has('call') ? 1 : 0
  if (slotType === 'contact') return has('contact') ? 2 : has('call') ? 1 : 0
  if (slotType !== 'call') return 0
  if (has('alarm') || has('song') || has('duet') || has('contact'))
    return has('call') ? 1 : 0
  return has('call') ? 2 : 0
}

const playableRank = (item) => {
  const licence = licenceFromUrl(item?.lic)
  return licence && !licenceForbidsDerivatives(licence.license) ? 1 : 0
}

/**
 * A file the site can play ranks ahead of an ND file, which is only linked.
 * Grade decides within each of those two groups.
 */
export const compareCatalogue = (a, b, slotType) => {
  const playable = playableRank(b) - playableRank(a)
  if (playable) return playable
  const quality = (QUALITY_RANK[b?.q] || 0) - (QUALITY_RANK[a?.q] || 0)
  if (quality) return quality
  const type = typeScore(slotType, b?.type) - typeScore(slotType, a?.type)
  if (type) return type
  const region = regionScore(b) - regionScore(a)
  if (region) return region
  const background = (a?.also?.length ? 1 : 0) - (b?.also?.length ? 1 : 0)
  if (background) return background
  return Number(a?.id) - Number(b?.id)
}

export const recordingFromCatalogue = (item) => {
  const licence = licenceFromUrl(item?.lic)
  const author = String(item?.rec || '').trim()
  const id = String(item?.id || '')
  if (!licence || !author || !/^\d+$/.test(id) || !QUALITY_RANK[item?.q])
    return null
  const fileUrl = safeHttpUrl(item?.file)
  const source = safeHttpUrl(item?.url) || `https://xeno-canto.org/${id}`
  return {
    key: `xeno-canto/XC${id}`,
    source,
    author,
    license: licence.license,
    licenceUrl: licence.licenceUrl,
    aiGenerated: false,
    ...(fileUrl ? { fileUrl } : {}),
    hosted: false,
    quality: item.q,
  }
}

export const bestCatalogueRecording = (items, slotType) => {
  const ranked = (Array.isArray(items) ? items : [])
    .filter((item) => recordingFromCatalogue(item))
    .sort((a, b) => compareCatalogue(a, b, slotType))
  return ranked.length ? recordingFromCatalogue(ranked[0]) : null
}

const withQuality = (recording, byId) => {
  const found = byId?.get?.(catalogueId(recording))
  return found?.q && QUALITY_RANK[found.q]
    ? { ...recording, quality: found.q }
    : recording
}

const canPlay = (recording) =>
  Boolean(recording?.license) && !licenceForbidsDerivatives(recording.license)

/**
 * Keep a slot whose best recording is already grade A.
 * Replace it only when the catalogue has a strictly higher grade.
 * A slot that can already be played is never swapped for an ND file.
 * An empty slot takes the best accepted recording, playable first.
 * `permission` is the best ND recording graded above the one kept or chosen:
 * the file worth asking its recordist to let the site play.
 */
export const decideSlot = (call, byId, candidates) => {
  const existing = Array.isArray(call?.recordings) ? call.recordings : []
  const annotated = existing.map((recording) => withQuality(recording, byId))
  const best = annotated.reduce(
    (rank, recording) => Math.max(rank, QUALITY_RANK[recording.quality] || 0),
    0,
  )
  if (best >= QUALITY_RANK.A) return { action: 'kept', recordings: annotated }
  const list = Array.isArray(candidates) ? candidates : []
  const higher = list.filter((item) => (QUALITY_RANK[item?.q] || 0) > best)
  const playableNow = annotated.some(canPlay)
  const eligible = playableNow
    ? higher.filter((item) => playableRank(item))
    : higher
  const pick = bestCatalogueRecording(eligible, call?.type)
  const pickRank = QUALITY_RANK[pick?.quality] || 0
  const swap = Boolean(pick) && pickRank > best
  const chosenRank = swap ? pickRank : best
  const permission = bestCatalogueRecording(
    list.filter(
      (item) =>
        !playableRank(item) && (QUALITY_RANK[item?.q] || 0) > chosenRank,
    ),
    call?.type,
  )
  const extra = permission ? { permission } : {}
  if (swap)
    return {
      action: existing.length ? 'swapped' : 'added',
      recordings: [pick],
      ...extra,
    }
  return {
    action: existing.length ? 'kept' : 'none',
    recordings: annotated,
    ...extra,
  }
}

/** Clean only when the best remaining grade is C or worse, and ND is out. */
export const recordingsToClean = (recordings) => {
  const list = Array.isArray(recordings) ? recordings : []
  const best = list.reduce(
    (rank, recording) => Math.max(rank, QUALITY_RANK[recording?.quality] || 0),
    0,
  )
  if (best >= QUALITY_RANK.B || best === 0) return []
  return list.filter((recording) => {
    const rank = QUALITY_RANK[recording?.quality] || 0
    const poor = rank > 0 && rank < QUALITY_RANK.B
    const flagged = catalogueId(recording) === '634335' && best < QUALITY_RANK.B
    return (
      (poor || flagged) &&
      !licenceForbidsDerivatives(recording?.license) &&
      Boolean(safeHttpUrl(recording?.fileUrl))
    )
  })
}

/**
 * Stay under the call's low edge. Use 300–500 Hz when the call allows it,
 * and a lower cutoff when the call itself reaches down there.
 */
export const highpassForCall = (lowHz) => {
  if (!Number.isFinite(lowHz) || lowHz <= 0) return 400
  if (lowHz >= 550) return 500
  if (lowHz >= 400) return 300
  const below = Math.round(lowHz * 0.75)
  return Math.max(80, Math.min(280, below))
}

const fftMagnitude = (frame) => {
  const n = frame.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
    re[i] = frame[i] * hann
  }
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      const swap = re[i]
      re[i] = re[j]
      re[j] = swap
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const half = length >> 1
    const step = (-2 * Math.PI) / length
    for (let offset = 0; offset < n; offset += length) {
      for (let bin = 0; bin < half; bin += 1) {
        const angle = step * bin
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const even = offset + bin
        const odd = even + half
        const rotatedRe = re[odd] * cos - im[odd] * sin
        const rotatedIm = re[odd] * sin + im[odd] * cos
        re[odd] = re[even] - rotatedRe
        im[odd] = im[even] - rotatedIm
        re[even] += rotatedRe
        im[even] += rotatedIm
      }
    }
  }
  const magnitude = new Float64Array(n / 2)
  for (let i = 0; i < magnitude.length; i += 1)
    magnitude[i] = Math.hypot(re[i], im[i])
  return magnitude
}

/**
 * Low edge of the strongest band, in hertz. Wind below the call is ignored
 * by walking down from the peak until the energy falls away.
 */
export const estimateCallLowHz = (samples, sampleRate) => {
  const width = 2048
  if (!samples || samples.length < width || !sampleRate) return null
  const average = new Float64Array(width / 2)
  let frames = 0
  for (let offset = 0; offset + width <= samples.length; offset += width) {
    const frame = samples.subarray(offset, offset + width)
    let energy = 0
    for (const sample of frame) energy += sample * sample
    if (energy / width < 0.0001) continue
    const magnitude = fftMagnitude(frame)
    for (let i = 0; i < average.length; i += 1) average[i] += magnitude[i]
    frames += 1
  }
  if (!frames) return null
  const minBin = Math.max(1, Math.ceil((150 / sampleRate) * width))
  const maxBin = Math.min(
    average.length - 1,
    Math.floor((8000 / sampleRate) * width),
  )
  let peakBin = minBin
  for (let bin = minBin; bin <= maxBin; bin += 1)
    if (average[bin] > average[peakBin]) peakBin = bin
  if (average[peakBin] <= 0) return null
  const floor = average[peakBin] * 10 ** (-18 / 20)
  let lowBin = peakBin
  for (let bin = peakBin; bin >= minBin; bin -= 1) {
    if (average[bin] < floor) break
    lowBin = bin
  }
  return (lowBin * sampleRate) / width
}

export const recordingNotes = (recording) =>
  [
    /^[A-E]$/.test(recording?.quality || '')
      ? `Quality ${recording.quality}`
      : '',
    typeof recording?.modified === 'string' ? recording.modified.trim() : '',
  ].filter(Boolean)

/**
 * Public explore HTML, normalised to the API v3 recording fields the
 * selector reads: id, q, rec, cnt, loc, type, file, lic, url, also.
 */
export const parseExploreHtml = (html) => {
  const page = String(html || '')
  const rows = page.split(/<tr\b[^>]*>/i).slice(1)
  const recordings = []
  for (const chunk of rows) {
    const row = chunk.split(/<\/tr>/i)[0]
    const selected = row.match(
      /id=['"]rating-(\d+)-(\d)['"]\s+class=['"]selected['"]/i,
    )
    if (!selected) continue
    const cells = cellsOf(row)
    const grade = ['A', 'B', 'C', 'D', 'E'][Number(selected[2]) - 1]
    const file = row.match(/<audio\b[^>]*\ssrc=['"]([^'"]+)['"]/i)?.[1] || ''
    const licenceHref =
      row.match(/href=['"]([^'"]*creativecommons\.org\/[^'"]+)['"]/i)?.[1] || ''
    const scientific = row.match(/sci-name[^>]*>([^<]+)/i)?.[1] || ''
    const [genus, species] = cellText(scientific).split(/\s+/)
    const resolvedFile = file.startsWith('//') ? `https:${file}` : file
    recordings.push({
      id: selected[1],
      gen: genus || '',
      sp: species || '',
      rec: cellText(cells[3] || ''),
      cnt: cellText(cells[6] || ''),
      loc: cellText(cells[7] || ''),
      type: cellText(cells[9] || ''),
      q: grade || '',
      length: cellText(cells[2] || ''),
      file: resolvedFile,
      url: `https://xeno-canto.org/${selected[1]}`,
      lic: licenceHref,
      also: /Other Species|\[also\]/i.test(row) ? ['background'] : [],
    })
  }
  return recordings
}

export const explorePageCount = (html) => {
  const pages = [...String(html || '').matchAll(/[?&]pg=(\d+)/g)].map((match) =>
    Number(match[1]),
  )
  return pages.length ? Math.max(...pages) : 1
}

const slotReplacement = (chosen, index) =>
  (chosen?.calls || []).find((slot) => slot?.index === index)

/**
 * Species files stay untouched. A quality map annotates the file's own
 * recordings. A recordings array replaces the slot (a better grade, or a
 * cleaned derivative).
 */
export const applyRecordingOverlay = (species, overlay = defaultOverlay) => {
  const chosen = overlay?.species?.[species?.slug]
  if (!chosen || !Array.isArray(species?.calls)) return species
  let changed = false
  const calls = species.calls.map((call, index) => {
    const slot = slotReplacement(chosen, index)
    if (Array.isArray(slot?.recordings)) {
      changed = true
      return { ...call, recordings: slot.recordings }
    }
    const grades = slot?.quality
    if (!grades || !Array.isArray(call?.recordings)) return call
    const recordings = call.recordings.map((recording) => {
      const quality = grades[recording?.key]
      return /^[A-E]$/.test(quality || '')
        ? { ...recording, quality }
        : recording
    })
    const annotated = recordings.some(
      (recording, recordingIndex) =>
        recording !== call.recordings[recordingIndex],
    )
    if (!annotated) return call
    changed = true
    return { ...call, recordings }
  })
  return changed ? { ...species, calls } : species
}
