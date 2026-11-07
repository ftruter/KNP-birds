const EN_GB = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0,
  useGrouping: true,
})

const parseAcceptLanguage = (header) => {
  if (typeof header !== 'string' || !header.trim()) return []
  return header
    .split(',')
    .map((part, index) => {
      const [rawTag, ...params] = part.split(';').map((piece) => piece.trim())
      const qParam = params.find((param) => param.startsWith('q='))
      const q = qParam ? Number(qParam.slice(2)) : 1
      return {
        tag: rawTag,
        q: Number.isFinite(q) ? q : 0,
        index,
      }
    })
    .filter((item) => item.tag && item.tag !== '*')
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((item) => item.tag)
}

export const resolveLocale = (header) => {
  for (const tag of parseAcceptLanguage(header)) {
    try {
      const supported = Intl.NumberFormat.supportedLocalesOf([tag])
      if (supported.length) return supported[0]
    } catch {
      /* skip a tag Intl cannot parse */
    }
  }
  return 'en-GB'
}

export const numberFormatFor = (header) => {
  const locale = resolveLocale(header)
  const format =
    locale === 'en-GB'
      ? EN_GB
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: 0,
          useGrouping: true,
        })
  return {
    locale,
    integer: (value) => format.format(value),
  }
}

export const formatInteger = (value, format) =>
  (format || ((n) => EN_GB.format(n)))(value)
