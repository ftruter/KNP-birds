export const compareSortKeys = (left, right, dir) => {
  const latinText = (a, b) =>
    String(a ?? '').localeCompare(String(b ?? ''), 'en', {
      sensitivity: 'base',
    })
  const aMissing = left.value == null || left.value === ''
  const bMissing = right.value == null || right.value === ''
  if (aMissing && bMissing) return latinText(left.latin, right.latin)
  if (aMissing) return 1
  if (bMissing) return -1
  const primary =
    typeof left.value === 'number' && typeof right.value === 'number'
      ? left.value - right.value
      : String(left.value).localeCompare(String(right.value), 'en', {
          sensitivity: 'base',
        })
  const directed = dir === 'desc' ? -primary : primary
  return directed || latinText(left.latin, right.latin)
}
