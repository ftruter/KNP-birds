import { escapeHtml, safeHttpUrl } from './escape.js'

/**
 * The credit shown beside a photograph or a recording: a closed disclosure
 * that names the author, with the licence and storage details inside.
 *
 * `creditModel` decides what is said and in what order. It returns plain
 * data, so the server (`creditHtml`) and the recogniser pages (`creditNode`
 * in src/client/identify.js and identify-photo.js, which cannot import
 * this file) only walk it and cannot drift apart.
 */

/**
 * Summary names that the automatic rule gets wrong, by the name as recorded.
 * Organisations and channels stay whole; a trailing place is dropped.
 */
export const CREDIT_NAME_OVERRIDES = {
  'African Bioacoustics Community': 'African Bioacoustics Community',
  'Ken Harris EntSocVic': 'K Harris',
  "Mike's Birds from Riverside, CA, US": "Mike's Birds",
  'NJR ZA': 'NJR ZA',
  'Sonothèque ADVL': 'Sonothèque ADVL',
}

const PARTICLES = new Set([
  'da',
  'de',
  'del',
  'den',
  'der',
  'di',
  'dos',
  'du',
  'la',
  'le',
  'ten',
  'ter',
  'van',
  'von',
])

const SUFFIXES = new Set(['ii', 'iii', 'iv', 'jr', 'jr.', 'sr', 'sr.'])

const ORGANISATION =
  /\b(association|birding|club|community|foundation|group|images|institute|library|museum|photography|project|safaris|society|team|tours|trust|university)\b/i

/** A word of a personal name: starts with a capital, letters only. */
const NAME_WORD = /^\p{Lu}[\p{L}.'’-]*$/u
const INITIALS = /^(\p{Lu}\.?)+$/u

/**
 * The shortest form that still names the author: initials and surname for
 * a personal name ("Fred Truter" becomes "F Truter"), anything else as it
 * is recorded. A username, an organisation, a name in lower case and a
 * name with the surname first cannot be told apart safely, so they stay.
 */
export const shortAuthor = (recorded, overrides = CREDIT_NAME_OVERRIDES) => {
  const full = typeof recorded === 'string' ? recorded.trim() : ''
  if (!full) return ''
  if (Object.hasOwn(overrides, full)) return overrides[full]
  // "Derek Keats from Johannesburg, South Africa", "X at English Wikipedia".
  const name = full
    .replace(/\s+from\s+.+$/u, '')
    .replace(/\s+at\s+.*Wikipedia$/u, '')
  if (/[\d_@,()&/]|\s-\s|\sand\s/u.test(name) || ORGANISATION.test(name))
    return name
  const words = name.split(/\s+/)
  const suffix =
    words.length > 2 && SUFFIXES.has(words.at(-1).toLowerCase())
      ? words.pop()
      : ''
  if (words.length < 2) return name
  const particle = words.findIndex(
    (word, index) => index > 0 && PARTICLES.has(word.toLowerCase()),
  )
  const split = particle > 0 ? particle : words.length - 1
  const given = words.slice(0, split)
  const surname = words.slice(split)
  const last = surname.at(-1)
  if (
    !given.every((word) => NAME_WORD.test(word)) ||
    !NAME_WORD.test(last) ||
    last.includes('.') ||
    (INITIALS.test(last) && last.length < 3)
  )
    return name
  const initials = given
    .flatMap((word) =>
      word.includes('.') ? word.split('.').filter(Boolean) : [word],
    )
    .map((part) => [...part][0])
  return [...initials, ...surname, suffix].filter(Boolean).join(' ')
}

const ALLOWS = {
  by: 'Share and adapt with credit, including commercially',
  'by-sa':
    'Share and adapt with credit, under the same licence, including commercially',
  'by-nc': 'Share and adapt with credit, not for commercial use',
  'by-nc-sa':
    'Share and adapt with credit, under the same licence, not for commercial use',
  'by-nd': 'Share unchanged with credit, including commercially',
  'by-nc-nd': 'Share unchanged with credit, not for commercial use',
  zero: 'No rights reserved: use freely, credit not required',
}

/** What a licence allows, in plain words, or '' for one this site does not know. */
export const licenceAllows = (licence) => {
  const code = typeof licence === 'string' ? licence.trim().toLowerCase() : ''
  if (/^(cc0|public domain)\b/.test(code)) return ALLOWS.zero
  const terms = code.match(/^cc (by(?:-nc)?(?:-sa|-nd)?)\b/)
  return terms ? ALLOWS[terms[1]] : ''
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * The credit for one photograph or recording.
 *
 * `shown` says how the page loads the file: `{ src, onSite }`, or nothing
 * when the page does not show it. Returns `{ summary, lines }`: each line is a list of strings and
 * `{ text, href }` links, in the order the disclosure prints them.
 */
export const creditModel = (item, kind, shown) => {
  const author = text(item?.author)
  const source = safeHttpUrl(item?.source)
  const licence = text(item?.license)
  const licenceUrl = safeHttpUrl(item?.licenceUrl)
  const allows = licenceAllows(licence)
  const lines = []

  if (author) lines.push([source ? { text: author, href: source } : author])
  else if (source) lines.push([{ text: 'Source', href: source }])
  if (!source && text(item?.source))
    lines.push([`Source: ${text(item.source)}`])

  if (licence || licenceUrl) {
    const name = licence || 'Licence terms'
    lines.push([
      'Licence: ',
      licenceUrl ? { text: name, href: licenceUrl } : name,
      allows ? `. ${allows}.` : '.',
    ])
  } else lines.push(['Licence not recorded.'])

  const host = shown?.onSite ? '' : hostOf(shown?.src)
  lines.push([
    shown?.onSite
      ? 'Saved on this site: yes.'
      : host
        ? `Saved on this site: no. It loads from ${host}.`
        : 'Saved on this site: no.',
  ])

  if (kind === 'recording') {
    if (text(item?.modified)) lines.push([`Changes: ${text(item.modified)}.`])
    const key = text(item?.key)
    const grade = /^[A-E]$/.test(item?.quality || '')
      ? `Quality ${item.quality}`
      : ''
    if (key || grade)
      lines.push([
        key ? 'Recording ' : '',
        key && shown?.onSite ? { text: key, href: shown.src } : key,
        key && grade ? `. ${grade}.` : grade ? `${grade}.` : '.',
      ])
  } else if (!item?.aiGenerated) lines.push(['Photograph, not AI-generated.'])

  return {
    summary: `Credit: ${shortAuthor(author) || 'author not recorded'}`,
    lines: lines.map((line) => line.filter(Boolean)),
  }
}

/**
 * The disclosure. `file` is the address the page loads the work from; it
 * is kept in `data-file` for the script that will add "Saved on this
 * device" (issue 157).
 */
export const creditHtml = (credit, file) =>
  `<details class="credit"${file ? ` data-file="${escapeHtml(file)}"` : ''}>
<summary>${escapeHtml(credit.summary)}</summary>
<ul>
${credit.lines
  .map(
    (line) =>
      `<li>${line
        .map((part) =>
          typeof part === 'string'
            ? escapeHtml(part)
            : `<a href="${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`,
        )
        .join('')}</li>`,
  )
  .join('\n')}
</ul>
</details>`
