// fetch-docs.js — скачивает официальные документы БАЗИС и конвертирует в текст
// для локального RAG-корпуса (kb/sources/local-docs — в .gitignore).
// Запуск: node fetch-docs.js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "kb", "sources", "local-docs");

const DOCS = [
  {
    name: "script-guide.txt",
    url: "https://cdn.bazissoft.ru/documentation/ru/Script.pdf",
    type: "pdf",
    title: "БАЗИС. Работа со скриптами (руководство пользователя)",
  },
  {
    name: "script-examples.txt",
    url: "https://cdn.bazissoft.ru/documentation/ru/BAZIS-Script_examples.html",
    type: "html",
    title: "БАЗИС Script examples (API v5 примеры)",
  },
  {
    name: "bazis-manual.txt",
    url: "https://cdn.bazissoft.ru/documentation/ru/Bazis.pdf",
    type: "pdf",
    title: "БАЗИС-Мебельщик. Полное руководство пользователя (2024)",
  },
  {
    name: "sapr-article-24419.txt",
    url: "https://sapr.ru/article/24419",
    type: "html",
    title: "JavaScript — эффективный инструмент параметрического проектирования (sapr.ru)",
  },
];

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|table|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  for (const doc of DOCS) {
    process.stdout.write(`fetching ${doc.url} ... `);
    const buf = await download(doc.url);
    let text;
    if (doc.type === "pdf") {
      const parser = new PDFParse({ data: buf });
      try {
        const parsed = await parser.getText();
        text = parsed.text;
      } finally {
        await parser.destroy();
      }
    } else {
      text = htmlToText(buf.toString("utf8"));
    }
    const header = `# ${doc.title}\n\nИсточник: ${doc.url}\n\n`;
    const file = path.join(OUT, doc.name);
    await fs.writeFile(file, header + text, "utf8");
    console.log(`ok (${(text.length / 1024).toFixed(0)} KB text)`);
  }
  console.log("done ->", OUT);
  console.log("next: npm run index");
}

main().catch((e) => {
  console.error("fetch-docs failed:", e);
  process.exit(1);
});
