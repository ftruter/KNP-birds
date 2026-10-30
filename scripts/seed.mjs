/**
 * Print Cloudflare KV bulk-put JSON for the files in data/.
 *
 *   node scripts/seed.mjs > /tmp/knp-birds-kv.json
 *   npx wrangler kv bulk put /tmp/knp-birds-kv.json \
 *     --namespace-id d241348305f646e29c30880c361f6bf6 \
 *     --remote
 *
 * This does not contact Cloudflare. Each value is the file's JSON text.
 * Keys:
 *   data/species/<slug>.json → species/<slug>
 *   data/family/<slug>.json  → family/<slug>
 *   data/index/<name>.json   → index/<name>
 *   data/vocab/<name>.json   → vocab/<name>
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function collectEntries(dataDir = path.join(root, "data")) {
  const files = await walk(dataDir);
  const entries = [];
  for (const file of files) {
    const relative = path.relative(dataDir, file).split(path.sep).join("/");
    const key = keyFor(relative);
    if (!key) continue;
    const text = await readFile(file, "utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${relative} is not JSON: ${error.message}`);
    }
    assertKeyMatchesDocument(key, data, relative);
    entries.push({ key, value: text, file: path.posix.join("data", relative) });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return entries;
}

export function keyFor(relativePosix) {
  if (!relativePosix.endsWith(".json")) return null;
  const without = relativePosix.slice(0, -".json".length);
  if (/^(species|family|index|vocab)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(without)) return without;
  return null;
}

function assertKeyMatchesDocument(key, data, relative) {
  const [prefix, slug] = key.split("/");
  if (prefix === "species" || prefix === "family" || prefix === "vocab") {
    if (data.slug !== slug) throw new Error(`${relative} slug is ${data.slug}, expected ${slug}`);
  }
  if (prefix === "index" && data.name !== slug) {
    throw new Error(`${relative} name is ${data.name}, expected ${slug}`);
  }
  if ((prefix === "species" || prefix === "family") && typeof data.scientificName === "string") {
    const expected = data.scientificName.trim().toLowerCase().replaceAll(" ", "-");
    if (expected !== slug) throw new Error(`${relative} scientific name does not match ${slug}`);
  }
}

async function walk(dir) {
  const found = [];
  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...await walk(full));
    else if (item.isFile() && item.name.endsWith(".json")) found.push(full);
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = await collectEntries();
  for (const entry of entries) console.error(`${entry.key}\t${entry.file}`);
  process.stdout.write(`${JSON.stringify(entries.map(({ key, value }) => ({ key, value })), null, 2)}\n`);
}
