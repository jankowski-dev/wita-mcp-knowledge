# WITA KB Server — RAG по базе знаний

Локальный MCP-сервер семантического поиска. Без Docker и API-ключей:
эмбеддинги считаются моделью `Xenova/all-MiniLM-L6-v2` через `@xenova/transformers`
(скачивается один раз, ~90 МБ, затем работает офлайн).

## Установка и сборка индекса

```powershell
cd kb-server
npm install
npm run index
```

Индексируются каталоги из `kb/kb.config.json`:

```json
{ "sources": ["skills", "kb/sources"], "chunkSize": 1100, "overlap": 220 }
```

Дополнительные каталоги (например, документация сервера):

```powershell
npm run index -- --extra "C:/path/to/wita-mcp-server/docs"
```

Индекс пишется в `kb/index/index.json` (в `.gitignore`).

## Подключение в OpenCode

```jsonc
{
  "mcp": {
    "servers": {
      "kb": {
        "type": "local",
        "command": [
          "C:/Program Files/nodejs/node.exe",
          "C:/path/to/wita-mcp-knowledge/kb-server/src/index.js"
        ]
      }
    }
  }
}
```

## Инструменты

| Инструмент | Параметры | Результат |
|---|---|---|
| `kb_search` | `query`, `topK?` (5), `minScore?` (0.15) | `results[]`: `{score, source, text}` |
| `kb_stats` | — | количество фрагментов/источников, модель, дата сборки |

## Обновление базы

1. Добавьте/измените документы в `kb/sources/` (или скиллы).
2. `npm run index`.
3. Перезапуск OpenCode не нужен — сервер читает индекс при первом запросе
   после старта; для подхвата нового индекса перезапустите MCP-сервер
   (`/reload` или restart OpenCode).
