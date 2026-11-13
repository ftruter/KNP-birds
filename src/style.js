/**
 * Text colours by role. `brand` marks the site name, the page title and the
 * primary buttons. `heading` is every heading below the title, `link` a link
 * in running text, `muted` secondary text and `accent` a notice that flags
 * something. On the dark page only `brand` is gold, so that it stands out.
 */
export const palette = {
  light: {
    bg: '#FDF6E3',
    text: '#1F2A1F',
    heading: '#28602a',
    brand: '#28602a',
    link: '#28602a',
    accent: '#7A5A00',
    muted: '#5C4E38',
    headerBg: '#28602a',
    headerFg: '#F6C64D',
  },
  dark: {
    bg: '#12301A',
    text: '#F3EFE0',
    heading: '#F3EFE0',
    brand: '#F6C64D',
    link: '#E8D08A',
    accent: '#8FD18F',
    muted: '#A9B5A2',
    headerBg: '#0E2816',
    headerFg: '#F6C64D',
  },
}

const light = palette.light
const dark = palette.dark

export const css = `/* KNP Birds field guide. Gold is header text and the brand colour on the dark page, never body text on the cream page. One frame per object: a card holds nothing that is framed again. Font sizes and radii come from the scales below, and all spacing from one gap (see --gap). */
:root {
  color-scheme: light;
  --bg: ${light.bg};
  --text: ${light.text};
  --heading: ${light.heading};
  --brand: ${light.brand};
  --link: ${light.link};
  --accent: ${light.accent};
  --label: ${light.accent};
  --header-bg: ${light.headerBg};
  --header-fg: ${light.headerFg};
  --nav-fg: ${light.headerFg};
  --action-bg: ${light.headerBg};
  --muted: ${light.muted};
  --surface: #FFFBF4;
  --surface-2: #F3E6C4;
  --footer-bg: #F3EAD6;
  --line: #E0D2AE;
  --zebra: #F6EED9;
  --row-hover: #EFE3C4;
  --thead: #E4EED9;
  --thead-active: #D5E6C8;
  --sort-idle: #1E4630;
  --nav-pill: #143318;
  --code-bg: #F3E6C4;
  --focus: ${light.text};
  --plate-bg: #F3E6C4;
  --plate-ground: #E4D2A4;
  --plate-ink: ${light.heading};
  --shadow: 0 1px 2px rgb(31 42 31 / 0.06), 0 14px 36px rgb(31 42 31 / 0.08);
  --shadow-sm: 0 1px 2px rgb(31 42 31 / 0.05), 0 8px 18px rgb(31 42 31 / 0.06);
  --radius-sm: 0.35rem;
  --radius: 0.75rem;
  --radius-pill: 999px;
  --fs-xs: 0.8125rem;
  --fs-sm: 0.925rem;
  --fs-md: 1rem;
  --fs-body: clamp(1.02rem, 0.98rem + 0.2vw, 1.125rem);
  --fs-lg: clamp(1.08rem, 1rem + 0.25vw, 1.22rem);
  --fs-xl: clamp(1.35rem, 1.1rem + 0.7vw, 1.7rem);
  --fs-display: clamp(2rem, 1.35rem + 2vw, 3.15rem);
  --serif: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, "Times New Roman", serif;
  --sans: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, "Cascadia Code", "Segoe UI Mono", "Liberation Mono", monospace;
  accent-color: var(--brand);
}

/* The dark page has three surfaces (page, card, inset) and no shadows. The header is darker than the page, so the content carries the weight. */
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: ${dark.bg};
    --text: ${dark.text};
    --heading: ${dark.heading};
    --brand: ${dark.brand};
    --link: ${dark.link};
    --accent: ${dark.accent};
    --label: ${dark.muted};
    --header-bg: ${dark.headerBg};
    --header-fg: ${dark.headerFg};
    --nav-fg: ${dark.text};
    --muted: ${dark.muted};
    --surface: #1A3F27;
    --surface-2: #234A2E;
    --footer-bg: ${dark.headerBg};
    --line: #2F5A3C;
    --zebra: #1A3F27;
    --row-hover: #234A2E;
    --thead: #1A3F27;
    --thead-active: #234A2E;
    --sort-idle: ${dark.muted};
    --nav-pill: #1A3F27;
    --code-bg: #234A2E;
    --focus: ${dark.text};
    --plate-bg: #1A3F27;
    --plate-ground: #234A2E;
    --plate-ink: ${dark.muted};
    --shadow: none;
    --shadow-sm: none;
  }
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; scrollbar-gutter: stable; }

/* While a photograph is zoomed, the page behind it stays put: it does not scroll, and a swipe that runs off the photograph neither moves it nor pulls it to refresh. The stable gutter above keeps the page from shifting sideways when its scrollbar goes. */
html:has(.plate.is-zoomed), html:has(.plate.is-zoomed) body {
  overflow: hidden;
  overscroll-behavior: none;
}

/* One standard gap: 1em of the body text, so space grows with the reader's text size. It is registered as a length, so the em is worked out once, on the body, and the gap is the same under a large heading as between two buttons. Space is one gap, half a gap inside a tight group, or two gaps before a new section. */
@property --gap {
  syntax: "<length>";
  inherits: true;
  initial-value: 16px;
}

body {
  --gap: 1em;
  --gap-half: calc(var(--gap) / 2);
  --gap-2: calc(var(--gap) * 2);
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--serif);
  font-size: var(--fs-body);
  line-height: 1.65;
  text-rendering: optimizeLegibility;
}

/* The page has one gap at each side. */
.wrap {
  width: min(100rem, calc(100% - 2 * var(--gap)));
  margin-inline: auto;
  container-type: inline-size;
  container-name: wrap;
}

p { text-wrap: pretty; }

.skip {
  position: absolute;
  inset-inline-start: 0.75rem;
  inset-block-start: 0.75rem;
  transform: translateY(-200%);
  background: var(--action-bg);
  color: var(--header-fg);
  font-family: var(--sans);
  font-weight: 700;
  font-size: var(--fs-md);
  padding-block: var(--gap-half);
  padding-inline: var(--gap);
  border-radius: var(--radius-pill);
  z-index: 3;
}

.skip:focus { transform: none; }

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.site-header :focus-visible { outline-color: ${light.bg}; }

@media (prefers-color-scheme: dark) {
  .site-header :focus-visible { outline-color: ${dark.text}; }
}

.site-header {
  background: var(--header-bg);
  color: var(--header-fg);
  border-block-end: 1px solid var(--line);
}

/* On the dark page the nav links are cream, so that only the site name and the current page are gold. */
.site-header a {
  color: var(--nav-fg);
  font-family: var(--sans);
  font-weight: 600;
}

.mast {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-half) var(--gap-2);
  padding-block: var(--gap);
}

.brand { min-inline-size: min(100%, 14rem); }

.site-name {
  margin: 0;
  font-family: var(--sans);
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.site-name a { color: var(--header-fg); text-decoration: none; }
.site-name a:hover { text-decoration: underline; text-underline-offset: 0.14em; }

.site-tag {
  margin: 0;
  color: var(--nav-fg);
  font-family: var(--sans);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.nav-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-list a {
  display: inline-flex;
  align-items: center;
  min-block-size: 2.75rem;
  padding-inline: var(--gap);
  border-radius: var(--radius-pill);
  text-decoration: none;
  line-height: 1.2;
}

.nav-list a:hover,
.nav-list a[aria-current="page"] {
  background: var(--nav-pill);
}

.nav-list a[aria-current="page"] {
  color: var(--header-fg);
  box-shadow: inset 0 0 0 2px var(--header-fg);
}

/* Header search: a dark pill with a grey border, like a code-host search box. Contrast on the header green: border 3.6:1, text and hint above 9:1. */
.site-search {
  --search-fill: #102A14;
  --search-line: #A8B5A8;
  --search-text: #F3EFE0;
  --search-muted: #CDD5C8;
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 16rem;
  max-inline-size: 26rem;
}

.site-search-icon {
  position: absolute;
  inset-inline-start: 0.75rem;
  color: var(--search-muted);
  pointer-events: none;
}

.site-search input {
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding-block: 0.4rem;
  padding-inline: 2.25rem 0.75rem;
  border: 1px solid var(--search-line);
  border-radius: var(--radius-sm);
  background: var(--search-fill);
  color: var(--search-text);
  font-family: var(--sans);
  font-size: var(--fs-md);
  line-height: 1.3;
  appearance: none;
}

.site-search input::placeholder { color: var(--search-muted); opacity: 1; }

.site-search input:hover { border-color: var(--search-text); }

.site-search input:focus-visible {
  border-color: var(--header-fg);
  outline: 3px solid ${light.bg};
  outline-offset: 2px;
}

.site-search input::-webkit-search-decoration { appearance: none; }
.site-search input::-webkit-search-cancel-button { filter: invert(1) grayscale(1); }

.site-search-hint {
  display: none;
  position: absolute;
  inset-inline-start: 2.25rem;
  color: var(--search-muted);
  font-family: var(--sans);
  font-size: var(--fs-md);
  pointer-events: none;
  white-space: nowrap;
}

.site-search-hint kbd {
  display: inline-block;
  min-inline-size: 1.1rem;
  margin-inline: 0.15rem;
  padding-inline: 0.3rem;
  border: 1px solid var(--search-muted);
  border-radius: var(--radius-sm);
  font-family: var(--mono);
  font-size: var(--fs-xs);
  line-height: 1.25rem;
  text-align: center;
}

/* Off screen until keyboard focus reaches it, then shown at the end of the pill. */
.site-search-submit {
  position: absolute;
  inset-inline-end: 0.3rem;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

.site-search-submit:focus-visible {
  inline-size: auto;
  block-size: auto;
  clip-path: none;
  padding-block: 0.2rem;
  padding-inline: 0.6rem;
  border: 1px solid var(--search-line);
  border-radius: var(--radius-sm);
  background: var(--header-fg);
  color: var(--nav-pill);
  font-family: var(--sans);
  font-weight: 700;
  outline: 3px solid ${light.bg};
  outline-offset: 2px;
}

@media (min-width: 48rem) {
  .js .site-search input:placeholder-shown:not(:focus)::placeholder { color: transparent; }
  .js .site-search input:placeholder-shown:not(:focus) ~ .site-search-hint { display: block; }
}

@container wrap (max-width: 46rem) {
  .mast nav { flex-basis: 100%; }
  .site-search { flex-basis: 100%; max-inline-size: none; }
}

.search-results {
  list-style: none;
  margin: var(--gap) 0 0;
  padding: 0;
  display: grid;
  gap: var(--gap);
  max-inline-size: 75ch;
}

.search-result {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: var(--gap);
}

.search-result .kicker { margin: 0; }
.search-result h3 { margin: 0; font-family: var(--sans); }
.search-names { margin: 0; }
.search-names .latin, .search-names .afrikaans { margin: 0; font-size: inherit; }

.search-snippets {
  margin: var(--gap-half) 0 0;
  font-size: var(--fs-sm);
}

.search-snippets dt {
  font-family: var(--sans);
  font-weight: 600;
  color: var(--muted);
  font-size: var(--fs-xs);
}

.search-snippets dd { margin: 0 0 var(--gap-half); }

main {
  padding-block: var(--gap) var(--gap-2);
}

main .wrap > p { max-inline-size: 75ch; }

/* The page title is the one heading in the brand colour. */
h1, h2, h3, h4 {
  color: var(--heading);
  line-height: 1.2;
  font-weight: 700;
  text-wrap: balance;
}

h1 {
  color: var(--brand);
  font-size: var(--fs-display);
  margin-block: 0 var(--gap);
  letter-spacing: -0.025em;
}

h2 {
  font-family: var(--sans);
  font-size: var(--fs-xl);
  margin-block: var(--gap-2) var(--gap);
}

h3 {
  font-family: var(--sans);
  font-size: var(--fs-lg);
  margin-block: var(--gap) var(--gap-half);
}

h4 {
  font-family: var(--sans);
  font-size: var(--fs-md);
  margin-block: var(--gap) var(--gap-half);
}

a { color: var(--link); text-underline-offset: 0.16em; }
a:hover { text-decoration-thickness: 2px; }

code {
  font-family: var(--mono);
  font-size: 0.9em;
  padding-block: 0.08em;
  padding-inline: 0.35em;
  border-radius: var(--radius-sm);
  background: var(--code-bg);
}

.crumbs {
  margin-block: 0 var(--gap-half);
  margin-inline: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--gap-half);
  font-family: var(--sans);
  font-size: var(--fs-sm);
}

.crumbs a { text-decoration: none; }
.crumbs a:hover { text-decoration: underline; }

.crumbs li:not(:last-child)::after {
  content: "/";
  margin-inline-start: var(--gap-half);
  color: var(--muted);
}

/* A page section, not a card: its heading and the space round it set it apart. */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap) var(--gap-2);
  align-items: start;
  margin-block: var(--gap);
}

.hero h3 { margin-block-start: 0; }

@container wrap (min-width: 58rem) {
  .hero {
    grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
  }
}

.compare-list {
  counter-reset: step;
  list-style: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap) var(--gap-2);
  margin: 0;
  padding: 0;
}

.compare-list li {
  counter-increment: step;
  display: flex;
  gap: var(--gap-half);
  align-items: flex-start;
  margin: 0;
  font-family: var(--sans);
  font-size: var(--fs-sm);
  line-height: 1.4;
}

.compare-list li::before {
  content: counter(step);
  flex: none;
  display: grid;
  place-items: center;
  inline-size: 1.7rem;
  block-size: 1.7rem;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--sans);
  font-weight: 600;
  font-size: var(--fs-xs);
}

@container wrap (min-width: 58rem) {
  .compare-list { grid-template-columns: 1fr 1fr; }
}

.sample, .mark { font-family: var(--sans); }

.sample {
  margin-block: var(--gap);
  margin-inline: 0;
  padding-block: var(--gap-half);
  padding-inline: var(--gap);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--accent);
  font-size: var(--fs-sm);
}

/* Small labels are quiet: brown on the cream page, muted on the dark one. */
.kicker, .estimate-label, .afrikaans {
  color: var(--label);
  font-family: var(--sans);
}

.kicker, .estimate-label {
  margin-block: 0;
  margin-inline: 0;
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h1:has(+ .latin) { margin-block-end: var(--gap-half); }

.latin {
  margin-block: 0;
  margin-inline: 0;
  font-style: italic;
  font-size: var(--fs-lg);
}

.afrikaans { margin: 0; font-size: var(--fs-md); }

.species-layout,
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap) var(--gap-2);
  align-items: start;
  margin-block: var(--gap);
}

/* A grid cell starts and ends flush, so the grid's gap is the only space between cells. The same goes for the contents of a card. */
.hero > * > :first-child, .species-layout > * > :first-child, .split > * > :first-child { margin-block-start: 0; }
.hero > * > :last-child, .species-layout > * > :last-child, .split > * > :last-child,
.population > :last-child, .population > :last-child > :last-child,
.search-snippets dd:last-child { margin-block-end: 0; }

.lead-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap) var(--gap-2);
  align-items: start;
  margin-block: var(--gap);
}

.lead-split > p { margin-block: 0; max-inline-size: none; }

/* A side note: a rule beside it and quieter text, not a card. */
.lead-note {
  margin: 0;
  padding-inline-start: var(--gap);
  border-inline-start: 1px solid var(--line);
  color: var(--muted);
  font-family: var(--sans);
  font-size: var(--fs-sm);
}

.lead-note p { margin: 0; }

@container wrap (min-width: 52rem) {
  .lead-split,
  .split {
    grid-template-columns: minmax(0, 75ch) minmax(18rem, 1fr);
  }
  .species-layout {
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  }
  .species-aside { position: sticky; inset-block-start: 1rem; }
}

.facts {
  display: grid;
  grid-template-columns: minmax(7.5rem, 11rem) minmax(0, 1fr);
  gap: var(--gap-half) var(--gap);
  margin-block: var(--gap);
  margin-inline: 0;
  padding: var(--gap);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  font-family: var(--sans);
}

.facts dt {
  margin: 0;
  color: var(--label);
  font-weight: 600;
}

.facts dd { margin: 0; }

.population {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: var(--gap);
}

.population h2,
.population h3 { margin-block-start: 0; }

.estimate-range {
  margin-block: 0 var(--gap-half);
  font-family: var(--sans);
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.25;
  color: var(--heading);
  font-variant-numeric: tabular-nums;
}

.comparison {
  margin-block: var(--gap);
  margin-inline: 0;
  padding-block: var(--gap);
  padding-inline: var(--gap);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

/* The card's padding is the only space round its contents, and a table in it lines up with the heading above. */
.comparison > h3 { margin-block-start: 0; }
.comparison > :last-child { margin-block-end: 0; }
.comparison th:first-child, .comparison td:first-child { padding-inline-start: 0; }
.comparison th:last-child, .comparison td:last-child { padding-inline-end: 0; }

/* A notice inside a card is plain text in the notice colour, not a second frame. */
.mark {
  margin-block: 0 var(--gap-half);
  margin-inline: 0;
  color: var(--accent);
  font-weight: 600;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16.5rem), 1fr));
  gap: var(--gap);
  margin-block: var(--gap);
}

/* "First to look for": one band per species, the full width of the page, so an odd number of species leaves no hole. Its photographs sit in one row at one height, and the row scrolls sideways when there are more than fit. */
.card-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap);
  margin-block: var(--gap);
}

.species-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: var(--gap);
}

.species-card h3 { margin-block-start: 0; }
/* The padding, taken back by the margin, leaves room for a photograph's focus ring and keeps the captions clear of the scrollbar. */
.species-card .gallery {
  display: flex;
  gap: var(--gap);
  margin: calc(var(--gap-half) * -1);
  padding: var(--gap-half);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scroll-padding-inline: var(--gap-half);
}

/* clip rounds the card and still lets the header stick to the page. Narrow screens scroll sideways. */
.table-wrap {
  overflow: clip;
  margin-block: var(--gap);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.table-wrap :focus-visible { outline-offset: -2px; }

table { width: 100%; border-collapse: collapse; }

@media (max-width: 72rem) {
  .table-wrap {
    overflow-x: auto;
    overflow-y: clip;
    -webkit-overflow-scrolling: touch;
  }
  table.species { min-inline-size: 52rem; }
}

/* Tables are data, so they are set in the sans face throughout. */
th, td {
  text-align: start;
  vertical-align: top;
  padding: var(--gap-half) var(--gap);
  border-block-end: 1px solid var(--line);
  font-family: var(--sans);
}

thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  background: var(--thead);
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  box-shadow: inset 0 -1px 0 var(--line);
}

th a {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

th[aria-sort="ascending"],
th[aria-sort="descending"] {
  background: var(--thead-active);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--brand);
}

th[aria-sort="none"] a::after {
  content: "↕";
  color: var(--sort-idle);
  font-size: 0.78em;
  text-decoration: none;
}

.sort-mark { font-size: 0.72em; line-height: 1; }

tbody tr:nth-child(odd) { background: var(--surface); }
tbody tr:nth-child(even) { background: var(--zebra); }
tbody tr:hover { background: var(--row-hover); }

tbody th[scope="row"] { font-weight: 600; }
tbody th[scope="row"] a { font-family: var(--sans); }

td.num, th.num {
  text-align: end;
  font-variant-numeric: tabular-nums;
  font-family: var(--sans);
  white-space: nowrap;
}

th.num a { margin-inline-start: auto; }

table.species tbody th[scope="row"],
table.species thead th:first-child {
  position: sticky;
  inset-inline-start: 0;
}

table.species thead th:first-child { z-index: 3; }
table.species tbody th[scope="row"] { z-index: 1; }

tbody tr:nth-child(odd) th[scope="row"] { background: var(--surface); }
tbody tr:nth-child(even) th[scope="row"] { background: var(--zebra); }
tbody tr:hover th[scope="row"] { background: var(--row-hover); }

caption, .season-note {
  caption-side: bottom;
  text-align: start;
  color: var(--muted);
  font-family: var(--sans);
  font-size: var(--fs-sm);
  padding-block: var(--gap-half);
  padding-inline: var(--gap);
}

/* One frame per object: a table inside a comparison card has no frame of its own. */
.comparison .table-wrap {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.plate {
  margin: 0;
  padding: var(--gap-half);
  background: var(--plate-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

/* Nor has a photograph inside a species card. The zoomed rules below come later and still apply. */
.species-card .plate {
  flex: none;
  min-inline-size: 9em;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  scroll-snap-align: start;
}

/* The photographs in a band share one height and keep their own shape, so nothing is cropped. A caption is as wide as its picture. */
.species-card .plate img, .species-card .plate-art { inline-size: auto; block-size: 11em; }
.species-card .plate figcaption { inline-size: 0; min-inline-size: 100%; }

.plate img, .plate-art {
  display: block;
  inline-size: 100%;
  block-size: auto;
  border-radius: var(--radius-sm);
}

.zoom {
  display: block;
  inline-size: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: zoom-in;
}

.zoom img, .zoom canvas {
  -webkit-user-drag: none;
  user-select: none;
}

/* A small photograph in a list, as on the recogniser pages. It is a plate
   without the frame, and its credit shows only when it is zoomed. */
.plate-thumb {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.plate-thumb img, .plate-thumb canvas {
  display: block;
  inline-size: 6rem;
  block-size: 6rem;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--plate-bg);
}
.plate.plate-thumb figcaption { margin: 0; font: var(--fs-xs) var(--sans); text-align: center; }
.plate-thumb .plate-credit, .plate-thumb.is-zoomed .plate-name { display: none; }
.plate-thumb.is-zoomed .plate-credit { display: inline; }

/* A zoomed photograph fills the screen: the picture takes all the room above
   its caption, at full width unless that would make it taller than the room,
   and then at full height, centred. */
.plate.is-zoomed {
  position: fixed;
  z-index: 999;
  inset: 0;
  display: flex;
  flex-direction: column;
  inline-size: 100vw;
  block-size: 100vh;
  block-size: 100dvh;
  max-inline-size: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: var(--bg);
}

.plate.is-zoomed .zoom {
  flex: 1 1 0;
  min-block-size: 0;
  cursor: zoom-out;
}

.plate.is-zoomed img, .plate.is-zoomed canvas {
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
  object-position: top;
  border-radius: 0;
  background: transparent;
}

.plate.is-zoomed figcaption {
  flex: none;
  margin: 0;
  padding: 0.75rem 1rem 1rem;
  background: var(--surface);
  font: inherit;
  font-size: 0.95rem;
  text-align: start;
}

audio {
  display: block;
  inline-size: 100%;
  margin-block-start: var(--gap-half);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.plate-art .sky { fill: var(--plate-bg); }
.plate-art .ground { fill: var(--plate-ground); }
.plate-art .ink { stroke: var(--plate-ink); fill: none; }
.plate-art .ink-fill { fill: var(--plate-ink); }

.plate figcaption, .call-list, p, li { overflow-wrap: break-word; }
.plate figcaption {
  margin-block-start: var(--gap-half);
  color: var(--muted);
  font-family: var(--sans);
  font-size: var(--fs-sm);
}
.ai-label { font-weight: 600; color: var(--accent); }

.credit { font-size: var(--fs-sm); }
.plate figcaption .credit, .recording .credit { margin-block-start: 0; }
.credit summary {
  inline-size: fit-content;
  max-inline-size: 100%;
  padding-block: 0.25em;
  cursor: pointer;
  font-family: var(--sans);
  color: var(--muted, inherit);
}
.credit summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.credit ul { margin: 0 0 var(--gap-half); padding-inline-start: var(--gap); }
.credit li { margin: 0; }
.plate.is-zoomed figcaption { max-block-size: 60vh; overflow-y: auto; }

/* Beside a thumbnail the closed credit fits under the picture. Opened, it
   is wider than the picture, so it lies over the text beside it. */
.plate-thumb:not(.is-zoomed) { inline-size: 6rem; }
.plate-thumb:not(.is-zoomed) .credit { font-size: var(--fs-xs); text-align: start; }
.plate-thumb:not(.is-zoomed) .credit[open] {
  position: relative;
  z-index: 2;
  inline-size: max-content;
  max-inline-size: min(22rem, 78vw);
  padding: 0 var(--gap-half);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.identify-result .recording .credit, .identify-call .credit { font-size: var(--fs-xs); }

.swatch {
  display: inline-block;
  inline-size: 0.95em;
  block-size: 0.95em;
  vertical-align: -0.12em;
  margin-inline-end: 0.35em;
  border-radius: var(--radius-sm);
}
.swatch rect { stroke: var(--muted); stroke-width: 1; }
.colour { white-space: nowrap; }

.colour-index {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--gap);
  margin: 0;
  padding: 0;
}

.colour-index li {
  display: flex;
  gap: var(--gap-half);
  align-items: center;
  margin: 0;
  padding-block: var(--gap-half);
  padding-inline: var(--gap);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.hex { font-family: var(--mono); font-size: var(--fs-xs); color: var(--muted); }

.call-list { padding-inline-start: var(--gap); }
.call-type { font-family: var(--sans); font-weight: 600; color: var(--label); }

.site-footer {
  background: var(--footer-bg);
  border-block-start: 1px solid var(--line);
  padding-block: var(--gap);
  font-family: var(--sans);
  font-size: var(--fs-sm);
}

.site-footer p { margin: 0; }

/* The name on the left and the links on the right; they stack on a narrow screen. The footer has one gap above and below, the same as the page has at its sides. */
.footer-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--gap-half) var(--gap-2);
}

::selection {
  background: #E4EED9;
  color: ${light.text};
}

@media (prefers-color-scheme: dark) {
  ::selection {
    background: #1E4A2C;
    color: ${dark.text};
  }
}

@container wrap (max-width: 36rem) {
  .facts { grid-template-columns: minmax(0, 1fr); }
  .facts dd { margin-block-end: var(--gap-half); }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@media (forced-colors: active) {
  .site-header { border-block-end-color: CanvasText; }
  .site-search input, .site-search-hint kbd { border-color: CanvasText; }
  .search-result { border-color: CanvasText; box-shadow: none; }
  .sample, .plate, .table-wrap, .population, .comparison, .home-action, .browse-links li, .species-card, .facts, .sitemap > li {
    border-color: CanvasText;
    box-shadow: none;
  }
  .nav-list a[aria-current="page"] {
    background: Highlight;
    color: HighlightText;
    box-shadow: none;
  }
}

.sitemap {
  list-style: none;
  margin: var(--gap) 0 0;
  padding: 0;
  display: grid;
  gap: var(--gap);
}

.sitemap > li {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: var(--gap);
}

.sitemap a { font-family: var(--sans); font-weight: 600; }

.sitemap-nest {
  list-style: none;
  margin: var(--gap-half) 0 0;
  padding: 0;
  display: grid;
  gap: var(--gap-half) var(--gap);
}

.sitemap-latin {
  margin-inline-start: 0.35em;
  color: var(--label);
  font-style: italic;
  font-weight: 400;
}

@container wrap (min-width: 52rem) {
  .sitemap > li > .sitemap-nest {
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    align-items: start;
  }
}

/* Home page. The two identify actions are filled with the brand green and titled in gold, in light and dark mode alike. The fill is what marks them out, so they have no gold border. The transparent border is there for forced-colours mode. */
.home-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap);
  list-style: none;
  margin: 0;
  padding: 0;
  max-inline-size: 64rem;
}

.home-action {
  display: flex;
  align-items: center;
  gap: var(--gap);
  block-size: 100%;
  min-block-size: 5rem;
  padding: var(--gap);
  background: var(--action-bg);
  color: var(--header-fg);
  border: 1px solid transparent;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--sans);
  text-decoration: none;
}

.home-action:hover { background: var(--nav-pill); }
.home-action:hover .home-action-title { text-decoration: underline; text-underline-offset: 0.14em; }

.home-action-icon { flex: none; inline-size: 2.5rem; block-size: 2.5rem; }

.home-action-copy { display: grid; gap: 0; }

.home-action-title {
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.2;
}

.home-action-text { color: #F3EFE0; font-size: var(--fs-md); line-height: 1.35; }

@container wrap (min-width: 40rem) {
  .home-actions { grid-template-columns: 1fr 1fr; }
  .home-action { min-block-size: 7rem; padding: var(--gap) var(--gap-2); }
  .home-action-icon { inline-size: 3.25rem; block-size: 3.25rem; }
}

.browse-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
  list-style: none;
  margin-block: var(--gap) 0;
  margin-inline: 0;
  padding: 0;
  font-family: var(--sans);
}

.browse-links li {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: var(--gap-half);
  min-block-size: 2.75rem;
  padding: var(--gap-half) var(--gap);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.browse-links li:hover { background: var(--row-hover); }
.browse-links a { font-weight: 600; }
.browse-links a::after { content: ""; position: absolute; inset: 0; }
.browse-links span { color: var(--muted); font-size: var(--fs-sm); }


.identify-privacy, .identify-note {
  max-inline-size: 75ch;
  border-inline-start: 4px solid var(--accent);
  padding: 0 0 0 var(--gap);
}

/* The panel takes the width it is given. Its own width, not the device,
   decides how its contents are laid out. */
.identify {
  container-type: inline-size;
  container-name: identify;
  margin-block: var(--gap);
  padding: var(--gap);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.identify [hidden] { display: none !important; }
.identify h2 { margin-block: 0 var(--gap-half); }
.identify p { max-inline-size: 75ch; }
.identify-status { margin: 0 0 var(--gap-half); font-family: var(--sans); font-weight: 600; min-block-size: 1.5em; }
.identify-progress { inline-size: 100%; block-size: 0.9rem; }
.identify-timing { margin-block: var(--gap) 0; font-family: var(--sans); font-size: var(--fs-xs); color: var(--muted); }

.identify-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
  align-items: center;
}

/* Two ways in: the first on the left with its tip under it, the second on
   the right. In a narrow panel they stack in source order. */
.identify-choices { display: grid; gap: var(--gap) var(--gap-2); align-items: start; margin-block-end: var(--gap); }
.identify-choices > p { margin-block: 0; }
@container identify (min-width: 40rem) {
  .identify-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .identify-choices > * { grid-column: 1; }
  .identify-choices > .identify-second { grid-column: 2; grid-row: 1; }
}

.identify-button {
  min-block-size: 3rem;
  padding: var(--gap-half) var(--gap);
  border: 2px solid var(--brand);
  border-radius: var(--radius-pill);
  background: var(--brand);
  color: var(--bg);
  font: 700 var(--fs-md) var(--sans);
  cursor: pointer;
}

.identify-button:disabled { opacity: 0.55; cursor: default; }
.identify-button:focus-visible, .identify-file input:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.identify-file { display: grid; gap: var(--gap-half); font-family: var(--sans); font-weight: 600; }
.identify-file input { max-inline-size: 100%; font: inherit; font-weight: 400; }
.identify-countdown { font: 700 var(--fs-lg) var(--sans); margin-block: var(--gap-half) 0; }
#identify-meter { display: flex; gap: var(--gap-half); align-items: center; margin-block: 0 var(--gap-half); font-family: var(--sans); }
#identify-level { flex: 1; block-size: 1rem; }

.identify-list {
  list-style: none;
  margin: var(--gap) 0 0;
  padding: 0;
  display: grid;
  gap: var(--gap);
}

@container identify (min-width: 58rem) {
  .identify-list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}

.identify-result {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--gap);
  align-items: start;
  padding: var(--gap);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg);
}

.identify-body { min-inline-size: 0; }
.identify-body h3 { margin: 0; font-family: var(--sans); }
.identify-body p { margin: 0; }
.identify-verdict strong { text-decoration: underline; text-underline-offset: 0.2em; }
.identify-call audio { display: block; inline-size: 100%; max-inline-size: 22rem; margin-block-start: var(--gap-half); }

/* The crop step fills the screen. The script sets data-controls to put the
   controls beside the photo or below it, whichever leaves the photo larger,
   and sizes the canvas to fit the stage. */
.identify-cropper {
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  inline-size: 100%;
  block-size: 100%;
  block-size: 100dvh;
  max-inline-size: none;
  max-block-size: none;
  margin: 0;
  border: 0;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: var(--surface);
  color: var(--text);
  overflow: hidden;
}
.identify-cropper[open] {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
}
.identify-cropper[open][data-controls="side"] {
  grid-template-columns: minmax(0, 1fr) min(22rem, 40%);
  grid-template-rows: minmax(0, 1fr);
}
.identify-stage {
  display: grid;
  place-items: center;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background: var(--plate-bg);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.identify-stage[data-zone="move"] { cursor: move; }
.identify-stage[data-zone="n"], .identify-stage[data-zone="s"] { cursor: ns-resize; }
.identify-stage[data-zone="e"], .identify-stage[data-zone="w"] { cursor: ew-resize; }
.identify-stage[data-zone="nw"], .identify-stage[data-zone="se"] { cursor: nwse-resize; }
.identify-stage[data-zone="ne"], .identify-stage[data-zone="sw"] { cursor: nesw-resize; }
.identify-crop { display: block; touch-action: none; }
.identify-crop:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
.identify-crop-panel {
  box-sizing: border-box;
  max-block-size: 50dvh;
  padding: 0.6rem 1rem 0.8rem;
  overflow: auto;
  overscroll-behavior: contain;
}
.identify-cropper[data-controls="side"] .identify-crop-panel { max-block-size: none; }
.identify-crop-panel h2 { margin-block: 0 0.5rem; }
.identify-crop-panel .identify-actions { gap: 0.5rem; }
.identify-crop-panel .identify-button { min-block-size: 2.75rem; padding: 0.4rem 0.9rem; font-size: 0.95rem; }
.identify-crop-panel p { margin-block: 0.6rem 0; font-size: 0.95rem; line-height: 1.45; }
.identify-quiet { background: transparent; color: var(--brand); }
/* Live mode on the photo page: the camera, with the bird outlined on a canvas laid over it. */
.identify-live-offer { margin-block-end: var(--gap); }
.identify-live-offer p { margin-block: var(--gap-half) 0; }
.identify-live-frame { position: relative; inline-size: fit-content; max-inline-size: 100%; margin-block: var(--gap-half); background: #000; }
.identify-live-video { display: block; max-inline-size: 100%; max-block-size: 70vh; }
.identify-live-overlay { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; }
.identify-live-name { margin-block: var(--gap-half) 0; font: 700 var(--fs-lg) var(--sans); min-block-size: 1.5em; }
.identify-live-word { font-weight: 400; }
.identify-live-view { margin-block: 0 var(--gap-half); font-family: var(--sans); color: var(--muted); min-block-size: 1.5em; }
.identify-live-zoom { display: flex; gap: var(--gap-half); align-items: center; font-family: var(--sans); }
.identify-live-zoom input { flex: 1; max-inline-size: 22rem; }

.identify-photo-result { grid-template-columns: 1fr; }
@media (min-width: 34rem) {
  .identify-photo-result { grid-template-columns: auto 1fr; }
}
.identify-pair { display: flex; gap: var(--gap-half); }

.identify-coverage { max-inline-size: 75ch; margin-block: var(--gap-half); }
.identify-coverage summary { cursor: pointer; font-family: var(--sans); font-weight: 600; padding-block: var(--gap-half); }
.identify-coverage ul { columns: 18rem; padding-inline-start: var(--gap); }
.identify-coverage .latin { font-size: 0.9em; }

/* The download panel on the home page. Shown only when the site was opened
   from the home screen, by /offline.js. */
.offline-panel {
  margin-block: var(--gap);
  padding: var(--gap);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.offline-panel[hidden] { display: none; }
.offline-panel h2 { margin-block: 0 var(--gap-half); }
.offline-panel p { max-inline-size: 75ch; }
.offline-rows { list-style: none; margin: var(--gap-half) 0; padding: 0; display: grid; gap: 0; }
.offline-row label {
  display: block;
  min-block-size: 2.75rem;
  padding: 0.55rem 0.4rem 0.55rem 2.6rem;
  border-radius: var(--radius);
  font-family: var(--sans);
  cursor: pointer;
}
.offline-row label:hover { background: var(--row-hover); }
.offline-row input {
  inline-size: 1.4rem;
  block-size: 1.4rem;
  margin: 0 0.8rem 0 -2.2rem;
  vertical-align: -0.3rem;
  accent-color: var(--brand);
}
.offline-row input:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.offline-row input:disabled + span { color: var(--muted); }
.offline-row label:has(input:disabled) { cursor: default; background: none; }
.offline-size { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.offline-message { margin: 0 0 0.5rem 2.6rem; font-family: var(--sans); }
.offline-message[hidden] { display: none; }
.offline-row[data-phase="failed"] .offline-message { font-weight: 700; }
.offline-button {
  min-block-size: 2.75rem;
  margin-block: var(--gap-half);
  padding: var(--gap-half) var(--gap);
  border: 2px solid var(--brand);
  border-radius: var(--radius-pill);
  background: var(--brand);
  color: var(--bg);
  font: 700 var(--fs-sm) var(--sans);
  cursor: pointer;
}
.offline-button:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.offline-quiet { background: transparent; color: var(--brand); }
.offline-note { color: var(--muted); font-family: var(--sans); font-size: var(--fs-sm); margin-block-end: 0; }

/* Kept in the page for machines that read the markup, and hidden from people: the "For agents" nav link and the MCP paragraph on the home page and in the footer. */
.for-agents { display: none; }

.visually-hidden {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`
