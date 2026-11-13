export const palette = {
  light: {
    bg: '#FDF6E3',
    text: '#1F2A1F',
    heading: '#28602a',
    accent: '#7A5A00',
    headerBg: '#28602a',
    headerFg: '#F6C64D',
  },
  dark: {
    bg: '#12301A',
    text: '#F3EFE0',
    heading: '#F6C64D',
    accent: '#8FD18F',
    headerBg: '#28602a',
    headerFg: '#F6C64D',
  },
}

const light = palette.light
const dark = palette.dark

export const css = `/* KNP Birds field guide. Gold is header text and decoration, never body text on the cream page. Green is body headings in light mode and decoration in dark mode. */
:root {
  color-scheme: light;
  --bg: ${light.bg};
  --text: ${light.text};
  --heading: ${light.heading};
  --link: ${light.heading};
  --accent: ${light.accent};
  --header-bg: ${light.headerBg};
  --header-fg: ${light.headerFg};
  --muted: #5C4E38;
  --surface: #FFFBF4;
  --surface-2: #F3E6C4;
  --footer-bg: #F3EAD6;
  --line: #E0D2AE;
  --rule: #E0D2AE;
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
  --radius: 0.9rem;
  --radius-lg: 1.25rem;
  --serif: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, "Times New Roman", serif;
  --sans: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, "Cascadia Code", "Segoe UI Mono", "Liberation Mono", monospace;
  accent-color: ${light.heading};
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: ${dark.bg};
    --text: ${dark.text};
    --heading: ${dark.heading};
    --link: ${dark.heading};
    --accent: ${dark.accent};
    --header-bg: ${dark.headerBg};
    --header-fg: ${dark.headerFg};
    --muted: #D2C7B0;
    --surface: #1A3F27;
    --surface-2: #234A2E;
    --footer-bg: #0E2816;
    --line: #2F5A3C;
    --rule: #2C5A38;
    --zebra: #163622;
    --row-hover: #234A30;
    --thead: #1E4A2C;
    --thead-active: #275736;
    --sort-idle: #D7C89A;
    --nav-pill: #143318;
    --code-bg: #234A2E;
    --focus: ${dark.text};
    --plate-bg: #1B3D24;
    --plate-ground: #234A2E;
    --plate-ink: ${dark.heading};
    --shadow: 0 1px 2px rgb(0 0 0 / 0.35), 0 16px 40px rgb(0 0 0 / 0.32);
    --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.28), 0 8px 20px rgb(0 0 0 / 0.24);
    accent-color: ${dark.heading};
  }
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--serif);
  font-size: clamp(1.02rem, 0.98rem + 0.2vw, 1.125rem);
  line-height: 1.65;
  text-rendering: optimizeLegibility;
}

.wrap {
  width: min(100rem, calc(100% - clamp(2rem, 5vw, 4.5rem)));
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
  background: var(--header-bg);
  color: var(--header-fg);
  font-family: var(--sans);
  font-weight: 700;
  font-size: 1.05rem;
  padding-block: 0.55rem;
  padding-inline: 0.9rem;
  border-radius: 999px;
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
  border-block-end: 0.35rem solid var(--header-fg);
}

.site-header a {
  color: var(--header-fg);
  font-family: var(--sans);
  font-weight: 700;
}

.mast {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.75rem;
  padding-block: 0.95rem;
}

.brand { min-inline-size: min(100%, 14rem); }

.site-name {
  margin: 0;
  font-family: var(--sans);
  font-size: clamp(1.45rem, 1.2rem + 0.7vw, 1.9rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.site-name a { text-decoration: none; }
.site-name a:hover { text-decoration: underline; text-underline-offset: 0.14em; }

.site-tag {
  margin: 0.15rem 0 0;
  color: var(--header-fg);
  font-family: var(--sans);
  font-size: 0.95rem;
  font-weight: 600;
}

.nav-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-list a {
  display: inline-flex;
  align-items: center;
  min-block-size: 2.75rem;
  padding-inline: 0.95rem;
  border-radius: 999px;
  text-decoration: none;
  line-height: 1.2;
}

.nav-list a:hover,
.nav-list a[aria-current="page"] {
  background: var(--nav-pill);
}

.nav-list a[aria-current="page"] {
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
  border-radius: 0.5rem;
  background: var(--search-fill);
  color: var(--search-text);
  font-family: var(--sans);
  font-size: 1rem;
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
  font-size: 1rem;
  pointer-events: none;
  white-space: nowrap;
}

.site-search-hint kbd {
  display: inline-block;
  min-inline-size: 1.1rem;
  margin-inline: 0.15rem;
  padding-inline: 0.3rem;
  border: 1px solid var(--search-muted);
  border-radius: 0.25rem;
  font-family: var(--mono);
  font-size: 0.8rem;
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
  border-radius: 0.35rem;
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
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
  max-inline-size: 75ch;
}

.search-result {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 0.85rem 1.1rem 1rem;
}

.search-result .kicker { margin: 0; }
.search-result h3 { margin: 0.1rem 0 0; font-family: var(--sans); }
.search-names { margin: 0.2rem 0 0; }
.search-names .latin, .search-names .afrikaans { margin: 0; font-size: inherit; }

.search-snippets {
  margin: 0.55rem 0 0;
  font-size: 0.95rem;
}

.search-snippets dt {
  font-family: var(--sans);
  font-weight: 700;
  color: var(--muted);
  font-size: 0.85rem;
}

.search-snippets dd { margin: 0 0 0.35rem; }

main {
  padding-block: 0.35rem 2.75rem;
}

main .wrap > p { max-inline-size: 75ch; }

h1, h2, h3, h4 {
  color: var(--heading);
  line-height: 1.2;
  font-weight: 700;
  text-wrap: balance;
}

h1 {
  font-size: clamp(2rem, 1.35rem + 2vw, 3.15rem);
  margin-block: 0.15rem 0.35rem;
  letter-spacing: -0.025em;
}

h1::after {
  content: "";
  display: block;
  inline-size: 4.25rem;
  block-size: 0.28rem;
  margin-block-start: 0.7rem;
  border-radius: 999px;
  background: var(--heading);
}

h2 {
  font-family: var(--sans);
  font-size: clamp(1.35rem, 1.1rem + 0.7vw, 1.7rem);
  margin-block: 2.1rem 0.75rem;
}

h3 {
  font-family: var(--sans);
  font-size: clamp(1.08rem, 1rem + 0.25vw, 1.22rem);
  margin-block: 1.15rem 0.4rem;
}

h4 {
  font-family: var(--sans);
  font-size: 1.02rem;
  margin-block: 1rem 0.35rem;
}

a { color: var(--link); text-underline-offset: 0.16em; }
a:hover { text-decoration-thickness: 2px; }

code {
  font-family: var(--mono);
  font-size: 0.9em;
  padding-block: 0.08em;
  padding-inline: 0.35em;
  border-radius: 0.35rem;
  background: var(--code-bg);
}

.crumbs {
  margin-block: 0.85rem 0.35rem;
  margin-inline: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.45rem;
  font-family: var(--sans);
  font-size: 0.95rem;
}

.crumbs a { text-decoration: none; }
.crumbs a:hover { text-decoration: underline; }

.crumbs li:not(:last-child)::after {
  content: "/";
  margin-inline-start: 0.45rem;
  color: var(--accent);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem 2rem;
  align-items: start;
  margin-block: 0.85rem 1.5rem;
  padding: clamp(1.1rem, 2vw, 1.8rem);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
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
  gap: 0.7rem;
  margin: 0;
  padding: 0;
}

.compare-list li {
  counter-increment: step;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin: 0;
  padding: 0.75rem 0.85rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 0.98rem;
  line-height: 1.4;
}

.compare-list li::before {
  content: counter(step);
  flex: none;
  display: grid;
  place-items: center;
  inline-size: 1.7rem;
  block-size: 1.7rem;
  border-radius: 999px;
  background: var(--header-fg);
  color: ${light.text};
  font-family: var(--sans);
  font-weight: 700;
  font-size: 0.85rem;
}

@container wrap (min-width: 58rem) {
  .compare-list { grid-template-columns: 1fr 1fr; }
}

.sample, .mark { font-family: var(--sans); }

.sample {
  margin-block: 0.9rem 1rem;
  margin-inline: 0;
  padding-block: 0.7rem;
  padding-inline: 0.9rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--accent);
  font-size: 0.98rem;
}

.kicker, .estimate-label, .afrikaans {
  color: var(--accent);
  font-family: var(--sans);
}

.kicker, .estimate-label {
  margin-block: 0 0.35rem;
  margin-inline: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.species-id { margin-block-start: 0.35rem; }

.latin {
  margin-block: 0.3rem 0.15rem;
  margin-inline: 0;
  font-style: italic;
  font-size: clamp(1.15rem, 1rem + 0.45vw, 1.45rem);
}

.afrikaans { margin: 0; font-size: 1.05rem; }

.species-layout,
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem 2rem;
  align-items: start;
}

.lead-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem 2.5rem;
  align-items: start;
  margin-block: 0.15rem 0.35rem;
}

.lead-split > p { margin-block: 0; max-inline-size: none; }

.lead-note {
  margin: 0;
  padding: 1rem 1.15rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
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
  gap: 0.55rem 1rem;
  margin-block: 1.15rem 1.4rem;
  margin-inline: 0;
  padding-block: 1rem;
  padding-inline: 1.1rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.facts dt {
  margin: 0;
  color: var(--accent);
  font-family: var(--sans);
  font-weight: 700;
}

.facts dd { margin: 0; }

.population {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding-block: 1.05rem 1.15rem;
  padding-inline: 1.15rem;
}

.population h2,
.population h3 { margin-block-start: 0.2rem; }

.estimate-range {
  margin-block: 0.2rem 0.7rem;
  font-family: var(--sans);
  font-size: clamp(1.35rem, 1.05rem + 0.8vw, 1.85rem);
  font-weight: 700;
  line-height: 1.25;
  color: var(--heading);
  font-variant-numeric: tabular-nums;
}

.comparison {
  margin-block: 1rem;
  margin-inline: 0;
  padding-block: 0.85rem 0.35rem;
  padding-inline: 1rem 1.05rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-inline-start: 4px solid var(--heading);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.mark {
  display: inline-block;
  margin-block: 0.15rem 0.55rem;
  margin-inline: 0;
  padding-block: 0.18rem;
  padding-inline: 0.6rem;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--bg);
  color: var(--accent);
  font-weight: 700;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16.5rem), 1fr));
  gap: 1rem;
  margin-block: 0.4rem 1.3rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1.15rem;
  margin-block: 0.4rem 1.5rem;
}

.species-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding-block: 0.85rem 1rem;
  padding-inline: 1rem;
}

.species-card h3 { margin-block-start: 0; }
.species-card .gallery { margin-block-end: 0; }

/* clip rounds the card and still lets the header stick to the page. Narrow screens scroll sideways. */
.table-wrap {
  overflow: clip;
  margin-block: 0.85rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
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

th, td {
  text-align: start;
  vertical-align: top;
  padding-block: 0.7rem;
  padding-inline: 0.85rem;
  border-block-end: 1px solid var(--line);
}

thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  background: var(--thead);
  color: var(--heading);
  font-family: var(--sans);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  box-shadow: inset 0 -1px 0 var(--line);
}

th a {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

th[aria-sort="ascending"],
th[aria-sort="descending"] {
  background: var(--thead-active);
  box-shadow: inset 0 -3px 0 var(--heading);
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
  font-size: 0.92rem;
  padding-block: 0.75rem 0.9rem;
  padding-inline: 0.9rem;
}

.comparison .table-wrap {
  box-shadow: none;
  background: transparent;
}

.plate {
  margin: 0;
  padding: 0.65rem;
  background: var(--plate-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.plate img, .plate-art {
  display: block;
  inline-size: 100%;
  block-size: auto;
  border-radius: calc(var(--radius-lg) - 0.4rem);
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
  border-radius: 0.5rem;
  background: var(--plate-bg);
}
.plate.plate-thumb figcaption { margin: 0; font: 0.8rem var(--sans); text-align: center; }
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
  margin-block-start: 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
}

.plate-art .sky { fill: var(--plate-bg); }
.plate-art .ground { fill: var(--plate-ground); }
.plate-art .ink { stroke: var(--plate-ink); fill: none; }
.plate-art .ink-fill { fill: var(--plate-ink); }

.plate figcaption, .call-list, p, li { overflow-wrap: break-word; }
.plate figcaption {
  margin-block-start: 0.6rem;
  font-size: 0.95rem;
}
.ai-label { font-weight: 700; color: var(--accent); }

.credit { font-size: 0.9rem; }
.plate figcaption .credit, .recording .credit { margin-block-start: 0.3rem; }
.credit summary {
  inline-size: fit-content;
  max-inline-size: 100%;
  padding-block: 0.25rem;
  cursor: pointer;
  font-family: var(--sans);
  color: var(--muted, inherit);
}
.credit summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.credit ul { margin: 0.2rem 0 0.4rem; padding-inline-start: 1.2rem; }
.credit li { margin: 0.15rem 0; }
.plate.is-zoomed figcaption { max-block-size: 60vh; overflow-y: auto; }

/* Beside a thumbnail the closed credit fits under the picture. Opened, it
   is wider than the picture, so it lies over the text beside it. */
.plate-thumb:not(.is-zoomed) { inline-size: 6rem; }
.plate-thumb:not(.is-zoomed) .credit { font-size: 0.8rem; text-align: start; }
.plate-thumb:not(.is-zoomed) .credit[open] {
  position: relative;
  z-index: 2;
  inline-size: max-content;
  max-inline-size: min(22rem, 78vw);
  padding: 0 0.6rem 0.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.identify-result .recording .credit, .identify-call .credit { font-size: 0.85rem; }

.swatch {
  display: inline-block;
  inline-size: 0.95em;
  block-size: 0.95em;
  vertical-align: -0.12em;
  margin-inline-end: 0.35em;
  border-radius: 0.2rem;
}
.swatch rect { stroke: var(--text); stroke-width: 1; }
.colour { white-space: nowrap; }

.colour-index {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 0.65rem;
  margin: 0;
  padding: 0;
}

.colour-index li {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  margin: 0;
  padding-block: 0.65rem;
  padding-inline: 0.8rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.hex { font-family: var(--mono); font-size: 0.85rem; color: var(--muted); }

.call-list { padding-inline-start: 1.15rem; }
.call-type { font-family: var(--sans); font-weight: 700; color: var(--accent); }

.site-footer {
  background: var(--footer-bg);
  border-block-start: 0.35rem solid var(--header-fg);
  padding-block: 1.6rem 2.2rem;
  font-size: 0.98rem;
}

.footer-grid {
  display: grid;
  gap: 0.35rem 2.5rem;
  align-items: start;
}

.footer-lead {
  margin-block-start: 0;
  font-family: var(--sans);
  font-size: 1.05rem;
}

@container wrap (min-width: 46rem) {
  .footer-grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
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
  .facts dd { margin-block-end: 0.35rem; }
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
  .mark, .sample, .plate, .table-wrap, .population, .hero, .home-action, .browse-links li, .compare-list li, .species-card, .facts, .sitemap > li {
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
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

.sitemap > li {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 0.85rem 1rem 1rem;
}

.sitemap a { font-family: var(--sans); font-weight: 700; }

.sitemap-nest {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.4rem 1.25rem;
}

.sitemap-latin {
  margin-inline-start: 0.35rem;
  color: var(--accent);
  font-style: italic;
  font-weight: 400;
}

@container wrap (min-width: 52rem) {
  .sitemap > li > .sitemap-nest {
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    align-items: start;
  }
}

/* Home page. The two identify actions use the header green and gold, which are the same in light and dark mode. */
.home-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
  max-inline-size: 64rem;
}

.home-action {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  block-size: 100%;
  min-block-size: 5rem;
  padding: 0.85rem 1.1rem;
  background: var(--header-bg);
  color: var(--header-fg);
  border: 2px solid var(--header-fg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  font-family: var(--sans);
  text-decoration: none;
}

.home-action:hover { background: var(--nav-pill); }
.home-action:hover .home-action-title { text-decoration: underline; text-underline-offset: 0.14em; }

.home-action-icon { flex: none; inline-size: 2.5rem; block-size: 2.5rem; }

.home-action-copy { display: grid; gap: 0.15rem; }

.home-action-title {
  font-size: clamp(1.25rem, 1.1rem + 0.6vw, 1.6rem);
  font-weight: 700;
  line-height: 1.2;
}

.home-action-text { color: #F3EFE0; font-size: 1rem; line-height: 1.35; }

@container wrap (min-width: 40rem) {
  .home-actions { grid-template-columns: 1fr 1fr; gap: 1rem; }
  .home-action { min-block-size: 7rem; padding: 1.25rem 1.5rem; }
  .home-action-icon { inline-size: 3.25rem; block-size: 3.25rem; }
}

.browse-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  list-style: none;
  margin-block: 1rem 0.5rem;
  margin-inline: 0;
  padding: 0;
  font-family: var(--sans);
}

.browse-links li {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-block-size: 2.75rem;
  padding: 0.55rem 0.95rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.browse-links li:hover { background: var(--row-hover); }
.browse-links a { font-weight: 700; }
.browse-links a::after { content: ""; position: absolute; inset: 0; }
.browse-links span { color: var(--muted); font-size: 0.92rem; }


.identify-privacy, .identify-note {
  max-inline-size: 75ch;
  border-inline-start: 4px solid var(--accent);
  padding: 0.35rem 0 0.35rem 0.85rem;
}

/* The panel takes the width it is given. Its own width, not the device,
   decides how its contents are laid out. */
.identify {
  container-type: inline-size;
  container-name: identify;
  margin-block: 1rem;
  padding: 1rem 1.1rem 1.2rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.identify [hidden] { display: none !important; }
.identify h2 { margin-block: 0.2rem 0.5rem; }
.identify p { max-inline-size: 75ch; }
.identify-status { margin: 0 0 0.6rem; font-family: var(--sans); font-weight: 700; min-block-size: 1.5em; }
.identify-progress { inline-size: 100%; block-size: 0.9rem; }
.identify-timing { margin-block: 0.8rem 0; font-family: var(--sans); font-size: 0.85rem; color: var(--muted); }

.identify-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

/* Two ways in: the first on the left with its tip under it, the second on
   the right. In a narrow panel they stack in source order. */
.identify-choices { display: grid; gap: 0.75rem 2rem; align-items: start; margin-block-end: 1rem; }
.identify-choices > p { margin-block: 0; }
@container identify (min-width: 40rem) {
  .identify-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .identify-choices > * { grid-column: 1; }
  .identify-choices > .identify-second { grid-column: 2; grid-row: 1; }
}

.identify-button {
  min-block-size: 3rem;
  padding: 0.6rem 1.2rem;
  border: 2px solid var(--heading);
  border-radius: 999px;
  background: var(--heading);
  color: var(--bg);
  font: 700 1.05rem var(--sans);
  cursor: pointer;
}

.identify-button:disabled { opacity: 0.55; cursor: default; }
.identify-button:focus-visible, .identify-file input:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.identify-file { display: grid; gap: 0.3rem; font-family: var(--sans); font-weight: 700; }
.identify-file input { max-inline-size: 100%; font: inherit; font-weight: 400; }
.identify-countdown { font: 700 1.2rem var(--sans); margin-block: 0.75rem 0.25rem; }
#identify-meter { display: flex; gap: 0.6rem; align-items: center; margin-block: 0.25rem 0.75rem; font-family: var(--sans); }
#identify-level { flex: 1; block-size: 1rem; }

.identify-list {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

@container identify (min-width: 58rem) {
  .identify-list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}

.identify-result {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  align-items: start;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg);
}

.identify-body { min-inline-size: 0; }
.identify-body h3 { margin: 0; font-family: var(--sans); }
.identify-body p { margin: 0.2rem 0 0; }
.identify-verdict strong { text-decoration: underline; text-underline-offset: 0.2em; }
.identify-call audio { display: block; inline-size: 100%; max-inline-size: 22rem; margin-block-start: 0.2rem; }

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
.identify-quiet { background: transparent; color: var(--heading); }
/* Live mode on the photo page: the camera, with the bird outlined on a canvas laid over it. */
.identify-live-offer { margin-block-end: 1rem; }
.identify-live-offer p { margin-block: 0.5rem 0; }
.identify-live-frame { position: relative; inline-size: fit-content; max-inline-size: 100%; margin-block: 0.5rem; background: #000; }
.identify-live-video { display: block; max-inline-size: 100%; max-block-size: 70vh; }
.identify-live-overlay { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; }
.identify-live-name { margin-block: 0.5rem 0; font: 700 1.3rem var(--sans); min-block-size: 1.5em; }
.identify-live-word { font-weight: 400; }
.identify-live-view { margin-block: 0.2rem 0.6rem; font-family: var(--sans); color: var(--muted); min-block-size: 1.5em; }
.identify-live-zoom { display: flex; gap: 0.6rem; align-items: center; font-family: var(--sans); }
.identify-live-zoom input { flex: 1; max-inline-size: 22rem; }

.identify-photo-result { grid-template-columns: 1fr; }
@media (min-width: 34rem) {
  .identify-photo-result { grid-template-columns: auto 1fr; }
}
.identify-pair { display: flex; gap: 0.5rem; }

.identify-coverage { max-inline-size: 75ch; margin-block: 0.5rem; }
.identify-coverage summary { cursor: pointer; font-family: var(--sans); font-weight: 700; padding-block: 0.4rem; }
.identify-coverage ul { columns: 18rem; padding-inline-start: 1.2rem; }
.identify-coverage .latin { font-size: 0.9em; }

/* The download panel on the home page. Shown only when the site was opened
   from the home screen, by /offline.js. */
.offline-panel {
  margin-block: 1.5rem;
  padding: 1rem 1.1rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.offline-panel[hidden] { display: none; }
.offline-panel h2 { margin-block: 0.2rem 0.5rem; }
.offline-panel p { max-inline-size: 75ch; }
.offline-rows { list-style: none; margin: 0.75rem 0; padding: 0; display: grid; gap: 0.25rem; }
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
  accent-color: var(--heading);
}
.offline-row input:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.offline-row input:disabled + span { color: var(--muted); }
.offline-row label:has(input:disabled) { cursor: default; background: none; }
.offline-size { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.offline-message { margin: 0 0 0.5rem 2.6rem; font-family: var(--sans); }
.offline-message[hidden] { display: none; }
.offline-row[data-phase="failed"] .offline-message { font-weight: 700; }
.ask-ai-link { font-family: var(--sans); margin-block: 0.75rem; }
.ask-ai-link a { font-weight: 700; }

.ask-ai-prompt {
  margin-block: 0.75rem;
  padding: 1rem;
  max-block-size: 28rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.92rem;
  line-height: 1.5;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  user-select: all;
}
.ask-ai-prompt:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.ask-ai-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; font-family: var(--sans); }
.ask-ai [hidden] { display: none; }
.copy-status { color: var(--muted); }

.offline-button, .copy-button {
  min-block-size: 2.75rem;
  margin-block: 0.3rem;
  padding: 0.4rem 1rem;
  border: 2px solid var(--heading);
  border-radius: 999px;
  background: var(--heading);
  color: var(--bg);
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.offline-button:focus-visible, .copy-button:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.offline-quiet { background: transparent; color: var(--heading); }
.offline-note { color: var(--muted); font-family: var(--sans); font-size: 0.95rem; margin-block-end: 0.2rem; }

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
