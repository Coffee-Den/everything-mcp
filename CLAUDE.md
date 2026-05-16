# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build     # Compile TypeScript to dist/
npm run dev       # Watch mode (incremental compile)
npm start         # Run the compiled server (dist/index.js)
```

No test suite is configured.

## Architecture

This is an MCP (Model Context Protocol) server that wraps [Everything](https://www.voidtools.com/) file search for Windows. It exposes Everything's search capabilities as MCP tools via stdio transport.

### Dual backend with automatic fallback

The server tries two backends in priority order:

1. **HTTP client** (`src/http-client.ts`) — Queries Everything's built-in HTTP server (default `localhost:80`). Preferred because it returns structured JSON including Windows FILETIME timestamps and attribute bitmasks.
2. **CLI client** (`src/cli-client.ts`) — Spawns `es.exe` and parses CSV output. Used as fallback when the HTTP server is unavailable. Directory detection is heuristic (no size + no extension = directory) because CSV mode doesn't expose attributes.

`getClient()` in `src/index.ts` checks HTTP availability first (3 s timeout) and returns whichever is usable, or throws if neither is reachable.

### Configuration

All config comes from environment variables at startup:

| Variable | Default | Purpose |
|---|---|---|
| `EVERYTHING_HOST` | `localhost` | HTTP server host |
| `EVERYTHING_PORT` | `80` | HTTP server port |
| `EVERYTHING_USERNAME` | — | HTTP Basic Auth username |
| `EVERYTHING_PASSWORD` | — | HTTP Basic Auth password |
| `EVERYTHING_ES_PATH` | auto-detect | Path to `es.exe` |

CLI client auto-detects `es.exe` from common install paths before falling back to `PATH`.

### MCP tools

Seven tools are registered in `src/index.ts`:

- `search` — General search with full option set
- `search_files` / `search_folders` — Prepend `file:` / `folder:` filter automatically
- `search_recent` — Uses Everything's `dm:last{N}days` date filter, sorted newest-first
- `search_large_files` — Uses `size:>={N}mb` filter, sorted by size descending
- `search_duplicates` — Searches by filename then groups results client-side by lowercased name
- `get_status` — Reports HTTP/CLI availability and active config

### Data flow

`SearchOptions` (from `src/types.ts`) is the common input type. Each client translates it to its own wire format:
- HTTP client builds a `URLSearchParams` query string
- CLI client builds an `es.exe` argument string with `-csv` output

Both return `SearchResponse` with a `source: "http" | "cli"` field indicating which backend served the request. Windows FILETIME values (100-ns intervals since 1601-01-01) are converted to ISO 8601 in `http-client.ts`; the CLI client receives pre-formatted date strings from `es.exe`.
