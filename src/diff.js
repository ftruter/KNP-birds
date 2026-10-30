import {
  AGE_LABEL,
  AGE_ORDER,
  MARK_PATHS,
  SEASON_LABEL,
  SEX_LABEL,
  blankMarks,
  canonicalMark,
  marksEqual,
  overlayMarks,
  readMark,
} from './marks.js'

const NO_VISIBLE_DIFFERENCE = 'No visible difference'

const FLIGHT_VIEWS = [
  ['flight-above', 'From above'],
  ['flight-below', 'From below'],
]

const PERCHED_VIEWS = [
  ['perched-front', 'Front'],
  ['perched-back', 'Back'],
  ['perched-side', 'Side'],
]

const cellFor = (path, value) =>
  path.kind === 'colour'
    ? { kind: 'colour', names: Array.isArray(value) ? value : [value] }
    : { kind: 'text', text: String(value) }

const noticeFor = (status, missing) =>
  status === 'no-visible-difference'
    ? NO_VISIBLE_DIFFERENCE
    : status === 'not-described'
      ? missing
      : null

const noteMap = (viewNotes) => {
  const map = {}
  for (const entry of Array.isArray(viewNotes) ? viewNotes : []) {
    if (!entry?.view || typeof entry.note !== 'string') continue
    const text = entry.note.trim()
    if (text) map[entry.view] = text
  }
  return map
}

const ageSnapshot = (variants, age, group, field) => {
  const groupVariants = variants.filter((variant) => variant.age === age)
  if (groupVariants.length === 0)
    return { present: false, value: null, mixed: false }
  const known = []
  for (const variant of groupVariants) {
    const value = readMark(variant.marks, group, field)
    if (value != null) known.push(value)
  }
  if (known.length === 0) return { present: true, value: null, mixed: false }
  const first = canonicalMark(known[0])
  const mixed = known.some((value) => canonicalMark(value) !== first)
  return { present: true, value: mixed ? null : known[0], mixed }
}

export const diffAge = (variants) => {
  const list = Array.isArray(variants) ? variants : []
  const presentAges = AGE_ORDER.filter((age) =>
    list.some((variant) => variant.age === age),
  )
  const rows = []
  if (presentAges.length >= 2) {
    for (const path of MARK_PATHS) {
      const values = {}
      for (const age of presentAges) {
        const found = ageSnapshot(list, age, path.group, path.field)
        if (found.value != null && !found.mixed) values[age] = found.value
      }
      const ages = AGE_ORDER.filter((age) => values[age] != null)
      if (ages.length < 2) continue
      const unique = new Set(ages.map((age) => canonicalMark(values[age])))
      if (unique.size < 2) continue
      const cells = {}
      for (const age of ages) cells[AGE_LABEL[age]] = cellFor(path, values[age])
      rows.push({ mark: path.label, cells })
    }
  }
  const columns = AGE_ORDER.map((age) => AGE_LABEL[age]).filter((label) =>
    rows.some((row) => row.cells[label]),
  )
  let status = 'differs'
  if (presentAges.length < 2) status = 'not-described'
  else if (rows.length === 0) status = 'no-visible-difference'
  return {
    id: 'age',
    title: 'Chick and juvenile vs adult',
    status,
    notice: noticeFor(
      status,
      'This sample describes only one age, so the ages cannot be compared.',
    ),
    columns,
    rows,
    notes: [],
    sharedNote: '',
  }
}

const specificity = (variant, profile) => {
  let score = 0
  if (profile.sex && variant.sex === profile.sex && variant.sex !== 'any')
    score += 2
  if (
    profile.season &&
    variant.season === profile.season &&
    variant.season !== 'any'
  )
    score += 1
  return score
}

const resolveMarks = (variants, profile) => {
  const matching = variants.filter((variant) => {
    if (variant.age !== profile.age) return false
    if (profile.sex && variant.sex !== profile.sex && variant.sex !== 'any')
      return false
    if (
      profile.season &&
      variant.season !== profile.season &&
      variant.season !== 'any'
    )
      return false
    return true
  })
  if (matching.length === 0) return null
  const ranked = matching
    .slice()
    .sort((a, b) => specificity(a, profile) - specificity(b, profile))
  const marks = blankMarks()
  for (const variant of ranked) overlayMarks(marks, variant.marks)
  return marks
}

const sexContext = (age, season) => {
  const bits = []
  if (age) bits.push(AGE_LABEL[age].toLowerCase())
  if (season && season !== 'any') bits.push(SEASON_LABEL[season].toLowerCase())
  return bits.join(', ')
}

const seasonContext = (age, sex) => {
  const bits = []
  if (age) bits.push(AGE_LABEL[age].toLowerCase())
  if (sex && sex !== 'any') bits.push(SEX_LABEL[sex].toLowerCase())
  return bits.join(', ')
}

export const diffSex = (variants) => {
  const list = Array.isArray(variants) ? variants : []
  const ages = AGE_ORDER.filter((age) =>
    list.some((variant) => variant.age === age),
  )
  const seasons = ['any']
  if (
    list.some(
      (variant) =>
        variant.season === 'breeding' || variant.season === 'non-breeding',
    )
  ) {
    seasons.push('breeding', 'non-breeding')
  }
  const rows = []
  let comparable = false
  for (const age of ages) {
    for (const season of seasons) {
      const male = resolveMarks(list, { age, sex: 'male', season })
      const female = resolveMarks(list, { age, sex: 'female', season })
      if (!male || !female) continue
      comparable = true
      for (const path of MARK_PATHS) {
        const left = readMark(male, path.group, path.field)
        const right = readMark(female, path.group, path.field)
        if (left == null || right == null || marksEqual(left, right)) continue
        const cells = {
          [SEX_LABEL.male]: cellFor(path, left),
          [SEX_LABEL.female]: cellFor(path, right),
        }
        rows.push({
          mark: path.label,
          context: sexContext(age, season),
          cells,
        })
      }
    }
  }
  return finishPair(
    'sex',
    'Male vs female',
    rows,
    ['Male', 'Female'],
    comparable,
    'This sample does not describe both sexes.',
  )
}

export const diffSeason = (variants) => {
  const list = Array.isArray(variants) ? variants : []
  const ages = AGE_ORDER.filter((age) =>
    list.some((variant) => variant.age === age),
  )
  const sexes = [...new Set(list.map((variant) => variant.sex).filter(Boolean))]
  const sexProfiles = sexes.length > 0 ? sexes : ['any']
  const rows = []
  let comparable = false
  for (const age of ages) {
    for (const sex of sexProfiles) {
      const breeding = resolveMarks(list, { age, sex, season: 'breeding' })
      const winter = resolveMarks(list, { age, sex, season: 'non-breeding' })
      if (!breeding || !winter) continue
      comparable = true
      for (const path of MARK_PATHS) {
        const left = readMark(winter, path.group, path.field)
        const right = readMark(breeding, path.group, path.field)
        if (left == null || right == null || marksEqual(left, right)) continue
        rows.push({
          mark: path.label,
          context: seasonContext(age, sex),
          cells: {
            [SEASON_LABEL['non-breeding']]: cellFor(path, left),
            [SEASON_LABEL.breeding]: cellFor(path, right),
          },
        })
      }
    }
  }
  return finishPair(
    'season',
    'Winter (non-breeding) vs summer (breeding) plumage',
    rows,
    [SEASON_LABEL['non-breeding'], SEASON_LABEL.breeding],
    comparable,
    'This sample does not describe both seasons.',
  )
}

const finishPair = (id, title, rows, columns, comparable, missing) => {
  const labelled = labelRows(rows)
  let status = 'differs'
  if (!comparable) status = 'not-described'
  else if (labelled.length === 0) status = 'no-visible-difference'
  const usedColumns = columns.filter((column) =>
    labelled.some((row) => row.cells[column]),
  )
  return {
    id,
    title,
    status,
    notice: noticeFor(status, missing),
    columns: status === 'differs' ? usedColumns : [],
    rows: labelled,
    notes: [],
    sharedNote: '',
  }
}

const labelRows = (rows) => {
  const contexts = new Set(rows.map((row) => row.context).filter(Boolean))
  const single = contexts.size === 1 ? [...contexts][0] : ''
  return rows.map((row) => ({
    mark:
      contexts.size > 1 && row.context
        ? `${row.mark} (${row.context})`
        : row.mark,
    context: single,
    cells: row.cells,
  }))
}

const stableWing = (variants, age, field) => {
  const group = variants.filter((variant) => variant.age === age)
  if (group.length === 0) return undefined
  const known = []
  for (const variant of group) {
    const value = readMark(variant.marks, 'wings', field)
    if (value != null) known.push(value)
  }
  if (known.length === 0) return null
  const first = canonicalMark(known[0])
  if (known.some((value) => canonicalMark(value) !== first)) return null
  return known[0]
}

const wingPair = (variants) => {
  const list = Array.isArray(variants) ? variants : []
  const ages = ['adult', 'immature', 'juvenile', 'chick'].filter((age) =>
    list.some((variant) => variant.age === age),
  )
  for (const age of ages) {
    const above = stableWing(list, age, 'above')
    const below = stableWing(list, age, 'below')
    if (above && below) return { above, below, age }
  }
  return { above: null, below: null, age: null }
}

export const diffFlight = (variants, viewNotes) => {
  const notes = noteMap(viewNotes)
  const aboveNote = notes['flight-above'] || ''
  const belowNote = notes['flight-below'] || ''
  const wings = wingPair(variants)
  const rows = []
  let status = 'not-described'
  if (wings.above && wings.below) {
    if (!marksEqual(wings.above, wings.below)) {
      status = 'differs'
      rows.push({
        mark: 'Wings',
        cells: {
          'From above': {
            kind: 'colour',
            names: Array.isArray(wings.above) ? wings.above : [wings.above],
          },
          'From below': {
            kind: 'colour',
            names: Array.isArray(wings.below) ? wings.below : [wings.below],
          },
        },
      })
    } else {
      status = 'no-visible-difference'
    }
  }
  const noteRows = FLIGHT_VIEWS.map(([id, label]) => ({
    label,
    text: notes[id] || '',
  })).filter((row) => row.text)
  const sharedNote = aboveNote && aboveNote === belowNote ? aboveNote : ''
  const notesDiffer = noteRows.length > 0 && !sharedNote
  if (notesDiffer) status = 'differs'
  return {
    id: 'flight',
    title: 'In flight, from above vs from below',
    status,
    notice: noticeFor(
      status,
      'Wing colour from above and below is not described in this sample.',
    ),
    columns: rows.length > 0 ? ['From above', 'From below'] : [],
    rows,
    notes: notesDiffer ? noteRows : [],
    sharedNote:
      status === 'no-visible-difference'
        ? sharedNote
        : sharedNote && !notesDiffer
          ? sharedNote
          : '',
  }
}

export const diffPerched = (viewNotes) => {
  const notes = noteMap(viewNotes)
  const filled = PERCHED_VIEWS.map(([id, label]) => ({
    label,
    text: notes[id] || '',
  })).filter((row) => row.text)
  const unique = new Set(filled.map((row) => row.text))
  let status = 'no-visible-difference'
  let sharedNote = ''
  let noteRows = []
  if (
    filled.length > 0 &&
    !(unique.size === 1 && filled.length === PERCHED_VIEWS.length)
  ) {
    status = 'differs'
    noteRows = filled
  } else if (filled.length === PERCHED_VIEWS.length && unique.size === 1) {
    sharedNote = filled[0].text
  }
  return {
    id: 'perched',
    title: 'Perched or walking, from the front, back and side',
    status,
    notice: status === 'no-visible-difference' ? NO_VISIBLE_DIFFERENCE : null,
    columns: [],
    rows: [],
    notes: noteRows,
    sharedNote,
  }
}

export const diffCalls = (calls) => {
  const list = Array.isArray(calls) ? calls : []
  const shared = list.filter((call) => call?.sex === 'any')
  const male = list.filter((call) => call?.sex === 'male')
  const female = list.filter((call) => call?.sex === 'female')
  let status = 'no-visible-difference'
  let notice = NO_VISIBLE_DIFFERENCE
  if (list.length === 0) {
    status = 'not-described'
    notice = 'Calls are not described in this sample.'
  } else if (male.length > 0 || female.length > 0) {
    status = 'differs'
    notice = null
  }
  return {
    id: 'calls',
    title: 'Calls and songs, males vs females',
    status,
    notice,
    shared,
    male,
    female,
    columns: [],
    rows: [],
    notes: [],
    sharedNote: '',
  }
}

export const diffSpecies = (doc) => {
  const variants = Array.isArray(doc?.variants) ? doc.variants : []
  const viewNotes = doc?.viewNotes
  return [
    diffAge(variants),
    diffSeason(variants),
    diffSex(variants),
    diffFlight(variants, viewNotes),
    diffPerched(viewNotes),
    diffCalls(doc?.calls),
  ]
}
