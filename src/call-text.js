/**
 * Call descriptions are the sound. Recording grades, filenames, and notes
 * about why a file was chosen stay off the page, and a missing sex split is
 * not repeated as its own sentence.
 */

const normalize = (text) =>
  String(text || '')
    .replaceAll(/\s+/g, ' ')
    .trim()

/** Splits on sentence punctuation, leaving 'Ha!' and other quoted sounds intact. */
const sentencesOf = (text) => {
  const source = normalize(text)
  const sentences = []
  let current = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = source[index - 1] || ''
    if (char === "'") {
      if (quoted) quoted = false
      else if (!/[A-Za-z0-9]/.test(previous)) quoted = true
    }
    current += char
    if (quoted) continue
    if (!/[.!?]/.test(char) || !/\s/.test(source[index + 1] || '')) continue
    sentences.push(current.trim())
    current = ''
    while (/\s/.test(source[index + 1] || '')) index += 1
  }
  if (current.trim()) sentences.push(current.trim())
  return sentences.filter(Boolean)
}

const finish = (text) => {
  const trimmed = text
    .trim()
    .replace(/[;,]\s*$/, '')
    .trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const bare = (text) =>
  text
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .trim()

/** Trailing clauses that restate "the sources do not say" or "no separate file". */
const SUFFIXES = [
  /,?\s*(?:and|;)?\s*the (?:sources|texts)(?: used here)? do not assign [^.]{0,60}\bsex\b\.?$/i,
  /,?\s*(?:and|;)?\s*the texts(?: used here)? do not separate the sexes(?: beyond the duet)?\.?$/i,
  /,?\s*the sexes are not (?:known to sound different|given different calls)\.?$/i,
  /,?\s*(?:and|;)?\s*(?:the sexes )?look alike and are not given different calls\.?$/i,
  /,?\s*which (?:was|were) not given (?:a )?separate files?\.?$/i,
  /,?\s*not given (?:a )?separate files?\.?$/i,
  /[,;]?\s*a female song is not described\.?$/i,
  /,?\s*(?:and|;)?\s*the (?:sources|texts)(?: used here)? do not transcribe (?:it|that song|the notes|a song)(?: or assign [^.]*)?\.?$/i,
  /\s+and do(?:es)? not (?:transcribe|write) (?:it|that song|the notes|a song)(?: out)?\.?$/i,
  /,?\s*so it is not stored as a male-only song\.?$/i,
  /,?\s*and (?:some recordings are of pairs, )?so it is not stored as a male-only song\.?$/i,
  /,?\s*not a published difference in the song\.?$/i,
]

const stripSuffixes = (clause) => {
  let text = clause.trim()
  let previous = ''
  while (text && text !== previous) {
    previous = text
    for (const suffix of SUFFIXES) text = text.replace(suffix, '').trim()
  }
  return text
}

const RECORDING =
  /\bgrade\s*[a-e]\b|\bfilename\b|\.mp3\b|\bxeno-canto\b|\bxc\d{3,}\b|\boutrank|\bnot used\b|\bwas kept\b|\bplayable\b|\bcatalogue\b|\bcatalog(?:ued)?\b|\bthe file\b|\bthis file\b|\bselected file\b|\brecordings are\b|\brecording (?:is|was|included)\b|\brecordings available\b|\bnot given a separate file|\bnot given separate files\b|\bnot edited again\b|\bwas not edited\b|\bhigh-pass\b|\blow-pass\b|\bin the background\b|\bopenly licensed\b|\bhigher-ranked\b|\branks (?:lower|first)\b|\blicen[cs]e is\b|\bthe recordist\b|\bforum\b|\bnot kruger\b|\bkruger recording\b|\bno kruger recording\b|\bno recording from\b|\bno recording was found\b|\bbreeding-ground recording\b|\bnot a kruger recording\b|\bthe type is a\b|\bnot stored as a male-only\b|\.wav\b|\.mpeg\b/

const PLACE_ONLY =
  /^(?:western|eastern|northern|southern) cape\b|, not kruger$|^(?:free state|cape town|limpopo|mpumalanga|kwazulu-natal|north west)\b[^.]{0,40}$|^lake [^.]{0,40}, [^.]{0,30}$/i

const SEX_GAP =
  /do not separate the sexes|does not separate the sexes|does not separate the call|not separated by sex|not labelled by sex|not labelled male or female|not labelled male only|do not assign [^.]{0,80}\bsex\b|does not assign [^.]{0,60}\bsex\b|sexes are not known to sound different|sexes are not given different calls|not given different calls|no sex difference stated|do not say whether females|do not say that females|no different female song is described|no source consulted assigns|does not say which sex|female song is not described|cut is not labelled/

const NO_VOICE =
  /does not describe (?:the |a )?(?:voice|call)\b|do not describe (?:the |a )?(?:voice|call|it)\b|do not describe that song|no call was described|not contain a [^.]{0,40}call|does not print a call|has no call text|no matching newman sentence describes the call|this text is on the |the \w+ page says the scientific name|the sexed calls are from|the sexed descriptions are from|the colou?r key does not describe|mismatched description|does not give the voice|page used here does not describe|sources used do not describe|texts used here do not describe|field-guide texts used here do not describe|neither wikipedia nor sabap1 describes the call|do not transcribe (?:it|that song|the notes|a song)|does not transcribe (?:it|that song|the notes|a song)|from a recording the recordist labelled/

const isRecordingNote = (clause) => {
  const text = bare(clause)
  if (!text) return true
  return RECORDING.test(text) || PLACE_ONLY.test(text)
}

const FILENAME_FOLLOW =
  /^(?:it says |it does not name |it includes )\b|\bis the (?:afrikaans|dutch|french|german|norwegian|portuguese|spanish|swedish) name\b/i

const isCallNote = (clause) => {
  const text = bare(clause)
  if (!text) return true
  return (
    isRecordingNote(text) ||
    SEX_GAP.test(text) ||
    NO_VOICE.test(text) ||
    FILENAME_FOLLOW.test(text)
  )
}

const salvage = (sentence) => {
  const text = sentence.replace(/[.!?]+$/, '').trim()
  const includes = text.match(/\bincludes ([^.]+)$/i)
  if (
    includes &&
    /clap|whistl|trill|drum|bill-|wing-/.test(includes[1]) &&
    !/grade|filename|edit|mp3|high-pass|low-pass|kruger/i.test(includes[1])
  )
    return finish(`Includes ${includes[1].trim()}`)
  const described = text.match(/\bdescribed as ([^.]+)$/i)
  if (
    described &&
    !/\b(?:grade|file|filename|from|kruger)\b/i.test(described[1])
  )
    return finish(`Described as ${described[1].trim()}`)
  const recordist = text.match(/\brecordist describes ([^.]+)$/i)
  if (recordist && !/not used|nest hole/i.test(text)) {
    const bit = recordist[1]
      .replaceAll(/\s*\(XC\d+\)/gi, '')
      .replaceAll(/\bXC\d+\b/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim()
    if (!bit || isRecordingNote(bit)) return ''
    return finish(bit.charAt(0).toUpperCase() + bit.slice(1))
  }
  return ''
}

const keptClauses = (sentence) => {
  const clauses = sentence
    .split(/\s*;\s*/)
    .map(stripSuffixes)
    .filter(Boolean)
  const kept = []
  for (const clause of clauses) {
    if (!isCallNote(clause)) kept.push(clause.replace(/[.!?]+$/, '').trim())
  }
  if (kept.length > 0) return finish(kept.join('; '))
  return salvage(sentence)
}

/** The sound itself, without curation or a repeated "no sex split" line. */
export const publicCallDescription = (text) =>
  sentencesOf(text).map(keptClauses).filter(Boolean).join(' ')

/** Recording-grade sentences in a summary. Narrower than the call filter. */
const SUMMARY_RECORDING =
  /\bgrade\s*[a-e]\b|\bfilename\b|\.mp3\b|\bplayable recording\b|\bno openly licensed recording was found\b/i

/**
 * Drops recording-provenance sentences from other prose, such as a summary.
 * Leaves plumage gaps, photograph notes, and field-guide attributions in place.
 */
export const withoutRecordingNotes = (text) =>
  sentencesOf(text)
    .filter((sentence) => !SUMMARY_RECORDING.test(bare(sentence)))
    .join(' ')
