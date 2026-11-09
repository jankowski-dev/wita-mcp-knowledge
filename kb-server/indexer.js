// indexer.js — строит векторный индекс базы знаний WITA.
// Запуск: npm run index  [-- --extra "<путь к доп. каталогу>"]
// Вход: kb/kb.config.json; Выход: kb/index/index.json.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@xenova/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const CONFIG = path.join(REPO, "kb", "kb.config.json");
const OUT_DIR = path.join(REPO, "kb", "index");
const OUT = path.join(OUT_DIR, "index.json");

const SKIP = new Set(["node_modules", ".git", "index", ".cache", "dist", "build"]);

async function readConfig() {
  return JSON.parse(await fs.readFile(CONFIG, "utf8"));
}

async function collectFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(md|txt)$/i.test(e.name)) out.push(full);
    }
  }
  await walk(root);
  return out;
}

// Разбиение markdown по заголовкам с сохранением «хлебных крошек»
function splitSections(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let h1 = "";
  let h2 = "";
  let h3 = "";
  let buf = [];
  let inFence = false;

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ heading: [h1, h2, h3].filter(Boolean).join(" > "), text: body });
    buf = [];
  };

  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const m1 = /^#\s+(.*)/.exec(line);
      const m2 = /^##\s+(.*)/.exec(line);
      const m3 = /^###\s+(.*)/.exec(line);
      if (m1) { flush(); h1 = m1[1].trim(); h2 = ""; h3 = ""; continue; }
      if (m2) { flush(); h2 = m2[1].trim(); h3 = ""; continue; }
      if (m3) { flush(); h3 = m3[1].trim(); continue; }
    }
    buf.push(line);
  }
  flush();
  return sections.filter((s) => s.text.length > 40);
}

function chunkSection(section, chunkSize, overlap) {
  const text = section.text;
  if (text.length <= chunkSize) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const cut = text.lastIndexOf("\n", end);
      if (cut > start + chunkSize * 0.4) end = cut;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter((c) => c.length > 40);
}

async function main() {
  const extras = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--extra" && argv[i + 1]) extras.push(path.resolve(argv[++i]));
  }

  const cfg = await readConfig();
  const roots = [...cfg.sources.map((s) => path.resolve(REPO, s)), ...extras].filter(Boolean);
  console.log("model:", cfg.model);

  const files = [];
  for (const root of roots) files.push(...(await collectFiles(root)));
  console.log("files:", files.length);

  const chunks = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const rel = path.relative(REPO, file).replace(/\\/g, "/");
    for (const section of splitSections(text)) {
      for (const piece of chunkSection(section, cfg.chunkSize, cfg.overlap)) {
        chunks.push({ source: rel, heading: section.heading, text: piece });
      }
    }
  }
  console.log("chunks:", chunks.length);

  console.log("loading embedding model (first run downloads ~120 MB)...");
  const embed = await pipeline("feature-extraction", cfg.model);

  const indexed = [];
  let done = 0;
  for (const c of chunks) {
    const passage = `${cfg.passagePrefix || ""}${c.heading ? c.heading + "\n" : ""}${c.text}`;
    const out = await embed(passage, { pooling: "mean", normalize: true });
    indexed.push({ ...c, vec: Array.from(out.data) });
    done++;
    if (done % 20 === 0 || done === chunks.length) process.stdout.write(`\r  embedded ${done}/${chunks.length}`);
  }
  process.stdout.write("\n");

  await fs.mkdir(OUT_DIR, { recursive: true });
  const payload = {
    model: cfg.model,
    queryPrefix: cfg.queryPrefix || "",
    passagePrefix: cfg.passagePrefix || "",
    dim: indexed[0]?.vec?.length ?? 0,
    builtAt: new Date().toISOString(),
    chunks: indexed,
  };
  await fs.writeFile(OUT, JSON.stringify(payload), "utf8");
  console.log("index written:", OUT, `(${(JSON.stringify(payload).length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error("indexer failed:", e);
  process.exit(1);
});
