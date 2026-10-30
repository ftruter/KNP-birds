export const palette = {
  light: {
    bg: "#FDF6E3",
    text: "#1F2A1F",
    heading: "#28602a",
    accent: "#7A5A00",
    headerBg: "#28602a",
    headerFg: "#F6C64D",
  },
  dark: {
    bg: "#12301A",
    text: "#F3EFE0",
    heading: "#F6C64D",
    accent: "#8FD18F",
    headerBg: "#28602a",
    headerFg: "#F6C64D",
  },
};

const light = palette.light;
const dark = palette.dark;

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
  --rule: #E0D2AE;
  --focus: ${light.text};
  --plate-bg: #F3E6C4;
  --plate-ground: #E4D2A4;
  --plate-ink: ${light.heading};
  --serif: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, "Times New Roman", serif;
  --sans: "Segoe UI", system-ui, -apple-system, sans-serif;
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
    --rule: #2C5A38;
    --focus: ${dark.text};
    --plate-bg: #1B3D24;
    --plate-ground: #234A2E;
    --plate-ink: ${dark.heading};
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--serif);
  font-size: 1.0625rem;
  line-height: 1.6;
}

.wrap {
  width: min(40rem, calc(100% - 2rem));
  margin-inline: auto;
}

.skip {
  position: absolute;
  left: 0.75rem;
  top: 0.75rem;
  transform: translateY(-200%);
  background: var(--header-bg);
  color: var(--header-fg);
  font-family: var(--sans);
  font-weight: 700;
  font-size: 1.1875rem;
  padding: 0.5rem 0.8rem;
  z-index: 2;
}

.skip:focus {
  transform: none;
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.site-header :focus-visible {
  outline-color: ${light.bg};
}

@media (prefers-color-scheme: dark) {
  .site-header :focus-visible {
    outline-color: ${dark.text};
  }
}

.site-header {
  background: var(--header-bg);
  color: var(--header-fg);
  border-bottom: 0.35rem solid ${light.headerFg};
}

.site-header a {
  color: var(--header-fg);
  font-family: var(--sans);
  font-weight: 700;
  font-size: 1.1875rem;
  line-height: 1.4;
}

.mast {
  padding-top: 0.9rem;
}

.site-name {
  margin: 0;
  font-family: var(--sans);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.site-tag {
  margin: 0.1rem 0 0;
  color: var(--header-fg);
  font-family: var(--sans);
  font-size: 0.95rem;
  font-weight: 700;
}

.nav-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  list-style: none;
  margin: 0;
  padding: 0.7rem 0 0.85rem;
}

main { padding-top: 1.25rem; }

h1, h2, h3 {
  color: var(--heading);
  line-height: 1.2;
  font-weight: 700;
}

h1 {
  font-size: clamp(1.8rem, 4vw, 2.35rem);
  margin: 0.2rem 0 0.45rem;
  border-bottom: 3px solid var(--heading);
  padding-bottom: 0.35rem;
}

h2 { font-size: 1.35rem; margin: 2rem 0 0.6rem; }
h3 { font-size: 1.12rem; margin: 1.2rem 0 0.4rem; }

a { color: var(--link); text-underline-offset: 0.15em; }
a:hover { text-decoration-thickness: 2px; }

.crumbs {
  margin: 0 0 0.8rem;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.4rem;
  font-family: var(--sans);
  font-size: 0.95rem;
}

.crumbs li:not(:last-child)::after {
  content: "/";
  margin-left: 0.4rem;
  color: var(--accent);
}

.sample, .mark {
  font-family: var(--sans);
}

.sample {
  margin: 0 0 1rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 0.95rem;
}

.kicker, .estimate-label, .afrikaans {
  color: var(--accent);
  font-family: var(--sans);
}

.kicker, .estimate-label {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.latin { margin: 0.35rem 0; font-style: italic; font-size: 1.15rem; }
.afrikaans { margin: 0 0 0.6rem; }

.facts {
  display: grid;
  grid-template-columns: 8.5rem 1fr;
  gap: 0.35rem 1rem;
  margin: 1rem 0 1.4rem;
}

.facts dt {
  color: var(--accent);
  font-family: var(--sans);
  font-weight: 700;
}

.comparison {
  margin: 1.15rem 0;
  padding: 0.1rem 0 0.2rem 0.9rem;
  border-left: 4px solid var(--heading);
}

.mark {
  display: inline-block;
  margin: 0.2rem 0 0.6rem;
  padding: 0.12rem 0.45rem;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.table-wrap { overflow-x: auto; }

table { width: 100%; border-collapse: collapse; }
th, td {
  text-align: left;
  vertical-align: top;
  padding: 0.4rem 0.55rem;
  border-bottom: 1px solid var(--rule);
}
th { color: var(--heading); font-weight: 700; }

.plate {
  margin: 1.1rem 0 1.4rem;
  padding: 0.75rem;
  background: var(--plate-bg);
  border: 1px solid var(--accent);
}

.plate img, .plate-art { display: block; width: 100%; height: auto; }
.plate-art .sky { fill: var(--plate-bg); }
.plate-art .ground { fill: var(--plate-ground); }
.plate-art .ink { stroke: var(--plate-ink); fill: none; }
.plate-art .ink-fill { fill: var(--plate-ink); }

.plate figcaption, .call-list, p, li { overflow-wrap: break-word; }
.plate figcaption { margin-top: 0.55rem; font-size: 0.95rem; }
.ai-label { font-weight: 700; color: var(--accent); }

.swatch {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  vertical-align: -0.12em;
  margin-right: 0.28em;
}
.swatch rect { stroke: var(--text); stroke-width: 1; }
.colour { white-space: nowrap; }

.colour-index { list-style: none; padding: 0; }
.colour-index li {
  display: flex;
  gap: 0.7rem;
  align-items: baseline;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--rule);
}
.hex { font-family: var(--sans); font-size: 0.9rem; }

.call-list { padding-left: 1.1rem; }
.call-type { font-family: var(--sans); font-weight: 700; color: var(--accent); }

.site-footer {
  margin-top: 3rem;
  padding: 1.2rem 0 2.4rem;
  border-top: 0.35rem solid ${light.headerFg};
  font-size: 0.95rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 36rem) {
  .facts { grid-template-columns: 1fr; }
  .facts dd { margin: 0 0 0.6rem; }
}

@media (forced-colors: active) {
  .site-header { border-bottom-color: CanvasText; }
  .mark, .sample { border-color: CanvasText; }
}
`;
