import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSpecies } from "../src/diff.js";
import { marksEqual } from "../src/marks.js";
import { readJson } from "./helpers.js";

test("colour order does not count as a difference", () => {
  assert.equal(marksEqual(["black", "white"], ["white", "black"]), true);
  assert.equal(marksEqual("lilac", "buff"), false);
  assert.equal(marksEqual(null, "buff"), false);
});

test("lilac-breasted roller diffs", async () => {
  const doc = await readJson("data/species/coracias-caudatus.json");
  const [age, season, sex, flight, perched, calls] = diffSpecies(doc);
  assert.equal(age.status, "differs");
  const breast = age.rows.find((row) => row.mark === "Breast");
  assert.deepEqual(breast.cells.Adult.names, ["lilac"]);
  assert.deepEqual(breast.cells.Juvenile.names, ["buff"]);
  assert.equal(age.rows.some((row) => row.mark === "Iris"), false);
  assert.equal(season.status, "no-visible-difference");
  assert.equal(season.notice, "No visible difference");
  assert.equal(sex.status, "no-visible-difference");
  assert.equal(flight.status, "differs");
  assert.equal(flight.rows.length, 0);
  assert.equal(perched.status, "differs");
  assert.equal(calls.status, "no-visible-difference");
  assert.match(calls.shared[0].description, /harsh rattle/);
});

test("african fish eagle flight and age diffs", async () => {
  const doc = await readJson("data/species/haliaeetus-vocifer.json");
  const [age, season, sex, flight] = diffSpecies(doc);
  assert.equal(age.status, "differs");
  const tail = age.rows.find((row) => row.mark === "Tail colour");
  assert.deepEqual(tail.cells.Adult.names, ["white"]);
  assert.deepEqual(tail.cells.Juvenile.names, ["brown"]);
  assert.equal(season.status, "no-visible-difference");
  assert.equal(sex.status, "no-visible-difference");
  assert.equal(flight.status, "differs");
  assert.deepEqual(flight.rows[0].cells["From above"].names, ["dark-brown"]);
  assert.deepEqual(flight.rows[0].cells["From below"].names, ["chestnut", "black"]);
});

test("southern ground hornbill sex diff is the throat only", async () => {
  const doc = await readJson("data/species/bucorvus-leadbeateri.json");
  const [age, , sex, flight, perched] = diffSpecies(doc);
  assert.equal(sex.status, "differs");
  assert.equal(sex.rows.length, 1);
  assert.equal(sex.rows[0].mark, "Throat");
  assert.deepEqual(sex.rows[0].cells.Male.names, ["red"]);
  assert.deepEqual(sex.rows[0].cells.Female.names, ["red", "blue"]);
  assert.equal(age.rows.some((row) => row.mark === "Throat"), false);
  const face = age.rows.find((row) => row.mark === "Face");
  assert.deepEqual(face.cells.Adult.names, ["red"]);
  assert.deepEqual(face.cells.Juvenile.names, ["buff"]);
  assert.equal(flight.status, "no-visible-difference");
  assert.match(flight.sharedNote, /white patch/);
  assert.equal(perched.status, "differs");
});
