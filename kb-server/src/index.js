// MCP-сервер базы знаний WITA: семантический поиск по индексу.
// Транспорт stdio — ничего не писать в stdout, только console.error.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const INDEX_FILE = path.join(REPO, "kb", "index", "index.json");

let index = null;
let embedder = null;

async function loadIndex() {
  if (index) return index;
  const raw = await fs.readFile(INDEX_FILE, "utf8");
  index = JSON.parse(raw);
  console.error(`[kb] index loaded: ${index.chunks.length} chunks, model ${index.model}, built ${index.builtAt}`);
  return index;
}

async function getEmbedder() {
  if (embedder) return embedder;
  const { pipeline } = await import("@xenova/transformers");
  embedder = await pipeline("feature-extraction", index?.model || "Xenova/all-MiniLM-L6-v2");
  return embedder;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function text(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

const server = new McpServer({ name: "wita-kb", version: "0.1.0" });

server.registerTool(
  "kb_search",
  {
    title: "Поиск по базе знаний WITA",
    description:
      "Семантический поиск по базе знаний (скиллы, справочники, каталоги фурнитуры, FAQ). " +
      "Возвращает top-K фрагментов с указанием источника и релевантности. " +
      "Используй при вопросах о материалах, фурнитуре, нормативах и правилах проектирования.",
    inputSchema: {
      query: z.string().min(1).describe("Поисковый запрос (естественный язык)"),
      topK: z.number().int().min(1).max(20).optional().describe("Количество результатов (по умолчанию 5)"),
      minScore: z.number().min(0).max(1).optional().describe("Порог релевантности (по умолчанию 0.15)"),
    },
  },
  async ({ query, topK = 5, minScore = 0.15 }) => {
    try {
      const idx = await loadIndex();
      const embed = await getEmbedder();
      const qtext = (idx.queryPrefix || "") + query;
      const out = await embed(qtext, { pooling: "mean", normalize: true });
      const qvec = Array.from(out.data);
      const scored = idx.chunks
        .map((c) => ({ score: cosine(qvec, c.vec), source: c.source, heading: c.heading, text: c.text }))
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      return text({
        query,
        results: scored.map((r) => ({
          score: Number(r.score.toFixed(4)),
          source: r.source,
          heading: r.heading,
          text: r.text.length > 1200 ? r.text.slice(0, 1200) + "…" : r.text,
        })),
        note: scored.length === 0 ? "Ничего не найдено выше порога — уточните запрос или переиндексируйте базу." : undefined,
      });
    } catch (e) {
      return text({
        error: String(e),
        hint: "Индекс не построен? Выполните: cd kb-server && npm run index. Модель скачивается при первом запуске.",
      });
    }
  },
);

server.registerTool(
  "kb_stats",
  {
    title: "Статистика базы знаний",
    description: "Показывает размер индекса: количество фрагментов, источников, модель и дату сборки.",
    inputSchema: {},
  },
  async () => {
    try {
      const idx = await loadIndex();
      const sources = [...new Set(idx.chunks.map((c) => c.source))];
      return text({
        status: "ok",
        model: idx.model,
        builtAt: idx.builtAt,
        chunks: idx.chunks.length,
        sources: sources.length,
        sourceList: sources,
      });
    } catch (e) {
      return text({ status: "no-index", error: String(e), hint: "cd kb-server && npm run index" });
    }
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("[kb] MCP server ready (stdio)");
}

main().catch((e) => {
  console.error("[kb] fatal:", e);
  process.exit(1);
});
