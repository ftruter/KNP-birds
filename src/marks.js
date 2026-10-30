/** Body-part marks. Colour fields use names from vocab/colours. Null means unknown. */

export const AGE_ORDER = ["chick", "juvenile", "immature", "adult"];

export const AGE_LABEL = {
  chick: "Chick",
  juvenile: "Juvenile",
  immature: "Immature",
  adult: "Adult",
};

export const SEX_LABEL = {
  male: "Male",
  female: "Female",
  any: "Any sex",
};

export const SEASON_LABEL = {
  breeding: "Summer (breeding)",
  "non-breeding": "Winter (non-breeding)",
  any: "Any season",
};

export const MARK_PATHS = [
  { group: "bill", field: "colour", label: "Bill colour", kind: "colour" },
  { group: "bill", field: "shape", label: "Bill shape", kind: "text" },
  { group: "eye", field: "iris", label: "Iris", kind: "colour" },
  { group: "eye", field: "ring", label: "Eye-ring", kind: "colour" },
  { group: "legs", field: "colour", label: "Legs", kind: "colour" },
  { group: "head", field: "crown", label: "Crown", kind: "colour" },
  { group: "head", field: "face", label: "Face", kind: "colour" },
  { group: "head", field: "throat", label: "Throat", kind: "colour" },
  { group: "upperparts", field: "back", label: "Back", kind: "colour" },
  { group: "upperparts", field: "rump", label: "Rump", kind: "colour" },
  { group: "underparts", field: "breast", label: "Breast", kind: "colour" },
  { group: "underparts", field: "belly", label: "Belly", kind: "colour" },
  { group: "wings", field: "above", label: "Wings from above", kind: "colour" },
  { group: "wings", field: "below", label: "Wings from below", kind: "colour" },
  { group: "tail", field: "colour", label: "Tail colour", kind: "colour" },
  { group: "tail", field: "shape", label: "Tail shape", kind: "text" },
];

export function blankMarks() {
  return {
    bill: { colour: null, shape: null },
    eye: { iris: null, ring: null },
    legs: { colour: null },
    head: { crown: null, face: null, throat: null },
    upperparts: { back: null, rump: null },
    underparts: { breast: null, belly: null },
    wings: { above: null, below: null },
    tail: { colour: null, shape: null },
  };
}

export function readMark(marks, group, field) {
  const value = marks?.[group]?.[field];
  if (value == null) return null;
  if (Array.isArray(value)) {
    const names = value.map((item) => String(item).trim()).filter(Boolean);
    return names.length > 0 ? names : null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

/** Equality ignores colour order. Null stays unknown and is not equal to a colour. */
export function canonicalMark(value) {
  const present = readMark({ g: { f: value } }, "g", "f");
  if (present == null) return null;
  const list = Array.isArray(present) ? present : [present];
  return list.slice().sort().join("\0");
}

export function marksEqual(a, b) {
  return canonicalMark(a) === canonicalMark(b);
}

export function colourNames(value) {
  const present = readMark({ g: { f: value } }, "g", "f");
  if (present == null) return [];
  return Array.isArray(present) ? present : [present];
}

export function overlayMarks(target, source) {
  if (!source) return target;
  for (const path of MARK_PATHS) {
    const value = readMark(source, path.group, path.field);
    if (value != null) target[path.group][path.field] = value;
  }
  return target;
}

/** Every colour token used in a species document. */
export function collectColourTokens(species) {
  const tokens = [];
  const variants = Array.isArray(species?.variants) ? species.variants : [];
  for (const variant of variants) {
    for (const path of MARK_PATHS) {
      if (path.kind !== "colour") continue;
      tokens.push(...colourNames(readMark(variant.marks, path.group, path.field)));
    }
  }
  return tokens;
}
