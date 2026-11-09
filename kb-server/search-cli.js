// search-cli.js — быстрый семантический поиск по индексу без MCP.
// Использование: node search-cli.js "запрос" [topK]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@xenova/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = path.resolve(__dirname, "..", "kb", "index", "index.json");

const query = process.argv[2];
const topK = Number(process.argv[3] || 5);
if (!query) {
  console.error('usage: node search-cli.js "запрос" [topK]');
  process.exit(1);
}

const index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));
const embed = await pipeline("feature-extraction", index.model);
const out = await embed((index.queryPrefix || "") + query, { pooling: "mean", normalize: true });
const qvec = Array.from(out.data);

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

const scored = index.chunks
  .map((c) => ({ score: cosine(qvec, c.vec), source: c.source, heading: c.heading, text: c.text }))
  .sort((a, b) => b.score - a.score)
  .slice(0, topK);

for (const r of scored) {
  console.log(`--- ${r.score.toFixed(4)} | ${r.source} | ${r.heading || ""}`);
  console.log(r.text.slice(0, 350).replace(/\n/g, " "));
  console.log();
}
