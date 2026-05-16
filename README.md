# everything-mcp

MCP server for [Everything](https://www.voidtools.com/) file search on Windows. Exposes Everything's instant search as MCP tools usable from Claude and other MCP clients.

## Prerequisites

- [Everything](https://www.voidtools.com/) installed and running on Windows
- Node.js 18+
- One of:
  - **HTTP Server** enabled in Everything (`Tools > Options > HTTP Server`)
  - **es.exe** (Everything CLI) installed — bundled with Everything or [downloaded separately](https://www.voidtools.com/es/)

## Installation

```bash
npm install
npm run build
```

## Usage

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "everything": {
      "command": "node",
      "args": ["C:/path/to/everything-mcp/dist/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add everything -- node /path/to/everything-mcp/dist/index.js
```

### Run directly

```bash
node dist/index.js
```

## Configuration

Configure via environment variables:

| Variable | Default | Description |
|---|---|---|
| `EVERYTHING_HOST` | `localhost` | Everything HTTP server host |
| `EVERYTHING_PORT` | `80` | Everything HTTP server port |
| `EVERYTHING_USERNAME` | — | HTTP Basic Auth username |
| `EVERYTHING_PASSWORD` | — | HTTP Basic Auth password |
| `EVERYTHING_ES_PATH` | auto-detect | Full path to `es.exe` |

Example with auth:

```json
{
  "mcpServers": {
    "everything": {
      "command": "node",
      "args": ["C:/path/to/everything-mcp/dist/index.js"],
      "env": {
        "EVERYTHING_PORT": "8080",
        "EVERYTHING_USERNAME": "admin",
        "EVERYTHING_PASSWORD": "secret"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|---|---|
| `search` | General search with full option set |
| `search_files` | Search files only (excludes folders) |
| `search_folders` | Search folders only |
| `search_recent` | Find files modified in the last N days |
| `search_large_files` | Find files above a size threshold |
| `search_duplicates` | Find files with the same name in multiple locations |
| `get_status` | Check connection status and active configuration |

### Search syntax

Everything's native search syntax is supported:

```
*.pdf                    # all PDF files
report 2024              # files matching both words
"annual report"          # exact phrase
report | budget          # OR
*.pdf !draft             # PDF files not containing "draft"
path:C:\Users *.docx     # Word docs under C:\Users
ext:mp4                  # by extension
size:>100mb              # files larger than 100 MB
dm:last7days             # modified in last 7 days
```

## How it works

The server tries two backends in order:

1. **HTTP API** (preferred) — queries Everything's JSON HTTP API directly
2. **CLI fallback** — spawns `es.exe` and parses CSV output when the HTTP server is not available

The `get_status` tool shows which backend is currently active.
