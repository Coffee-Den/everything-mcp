#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { EverythingHttpClient } from "./http-client.js";
import { EverythingCliClient } from "./cli-client.js";
import type { EverythingConfig, SearchOptions, SortField } from "./types.js";

// ─── Config from env ───────────────────────────────────────────────────────
const config: EverythingConfig = {
  host: process.env.EVERYTHING_HOST ?? "localhost",
  port: parseInt(process.env.EVERYTHING_PORT ?? "80", 10),
  username: process.env.EVERYTHING_USERNAME,
  password: process.env.EVERYTHING_PASSWORD,
  esExePath: process.env.EVERYTHING_ES_PATH,
};

const httpClient = new EverythingHttpClient(config);
const cliClient = new EverythingCliClient(config);

async function getClient(): Promise<{ client: EverythingHttpClient | EverythingCliClient; source: string }> {
  if (await httpClient.isAvailable()) {
    return { client: httpClient, source: "http" };
  }
  if (cliClient.isAvailable()) {
    return { client: cliClient, source: "cli" };
  }
  throw new Error(
    "Everything is not available. Please ensure:\n" +
    "1. Everything is running\n" +
    "2. HTTP server is enabled (Tools > Options > HTTP Server), OR\n" +
    "3. es.exe is installed and in PATH (or set EVERYTHING_ES_PATH)"
  );
}

// ─── Tool definitions ──────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "search",
    description:
      "Search for files and folders using Everything. " +
      "Supports Everything search syntax: space=AND, | =OR, !=NOT, \"...\"=exact phrase, " +
      "*.ext=extension, path:=filter by path, file:=files only, folder:=folders only.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Search query. Examples: "*.pdf", "report 2024", "path:C:\\\\Users *.docx", "ext:mp4"',
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 50, max: 1000)",
          default: 50,
        },
        offset: {
          type: "number",
          description: "Offset for pagination (default: 0)",
          default: 0,
        },
        caseSensitive: {
          type: "boolean",
          description: "Case-sensitive matching (default: false)",
          default: false,
        },
        wholeWord: {
          type: "boolean",
          description: "Match whole words only (default: false)",
          default: false,
        },
        matchPath: {
          type: "boolean",
          description: "Search in full path, not just filename (default: false)",
          default: false,
        },
        regex: {
          type: "boolean",
          description: "Use regular expression syntax (default: false)",
          default: false,
        },
        sortBy: {
          type: "string",
          enum: [
            "name", "path", "size", "date_modified", "date_created",
            "extension", "type", "run_count",
          ],
          description: "Sort field (default: name)",
        },
        sortAscending: {
          type: "boolean",
          description: "Sort ascending (default: true)",
          default: true,
        },
        includeSize: {
          type: "boolean",
          description: "Include file size in results (default: true)",
          default: true,
        },
        includeDateModified: {
          type: "boolean",
          description: "Include date modified in results (default: true)",
          default: true,
        },
        includeDateCreated: {
          type: "boolean",
          description: "Include date created in results (default: false)",
          default: false,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for FILES only (excludes folders). Shortcut that prepends 'file:' to query. " +
      "Use for finding documents, images, executables, etc.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'File search query. Examples: "*.pdf", "report 2024", "ext:jpg", "size:>10mb"',
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results (default: 50)",
          default: 50,
        },
        offset: { type: "number", description: "Offset for pagination", default: 0 },
        caseSensitive: { type: "boolean", default: false },
        wholeWord: { type: "boolean", default: false },
        matchPath: { type: "boolean", default: false },
        regex: { type: "boolean", default: false },
        sortBy: {
          type: "string",
          enum: ["name", "path", "size", "date_modified", "date_created", "extension"],
        },
        sortAscending: { type: "boolean", default: true },
      },
      required: ["query"],
    },
  },
  {
    name: "search_folders",
    description:
      "Search for FOLDERS/DIRECTORIES only (excludes files). Shortcut that prepends 'folder:' to query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Folder search query. Examples: "node_modules", "src", "path:C:\\\\Users"',
        },
        maxResults: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
        caseSensitive: { type: "boolean", default: false },
        wholeWord: { type: "boolean", default: false },
        matchPath: { type: "boolean", default: false },
        regex: { type: "boolean", default: false },
        sortBy: {
          type: "string",
          enum: ["name", "path", "date_modified", "date_created"],
        },
        sortAscending: { type: "boolean", default: true },
      },
      required: ["query"],
    },
  },
  {
    name: "search_recent",
    description:
      "Find recently modified files. Returns files modified within the last N days, " +
      "sorted by modification date (newest first).",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default: 7)",
          default: 7,
        },
        query: {
          type: "string",
          description: "Additional filter query (optional). Example: \"*.py\" to find recent Python files",
        },
        maxResults: { type: "number", default: 50 },
      },
      required: [],
    },
  },
  {
    name: "search_large_files",
    description:
      "Find large files above a size threshold, sorted by size descending. " +
      "Useful for disk space analysis.",
    inputSchema: {
      type: "object",
      properties: {
        minSizeMB: {
          type: "number",
          description: "Minimum file size in MB (default: 100)",
          default: 100,
        },
        query: {
          type: "string",
          description: "Additional filter (optional). Example: \"*.mp4\" to find large videos",
        },
        maxResults: { type: "number", default: 50 },
      },
      required: [],
    },
  },
  {
    name: "search_duplicates",
    description:
      "Find files with duplicate names (same filename in multiple locations). " +
      "Useful for finding duplicate documents or media.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: 'Filename or pattern to search. Example: "report.pdf", "*.jpg"',
        },
        maxResults: { type: "number", default: 100 },
      },
      required: ["filename"],
    },
  },
  {
    name: "get_status",
    description:
      "Check Everything service status and connection info. " +
      "Returns which connection method is active (HTTP or CLI) and version info.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────
function parseArgs(args: Record<string, unknown>): SearchOptions {
  return {
    query: String(args.query ?? ""),
    maxResults: typeof args.maxResults === "number"
      ? Math.min(args.maxResults, 1000)
      : 50,
    offset: typeof args.offset === "number" ? args.offset : 0,
    caseSensitive: Boolean(args.caseSensitive),
    wholeWord: Boolean(args.wholeWord),
    matchPath: Boolean(args.matchPath),
    regex: Boolean(args.regex),
    sortBy: args.sortBy as SortField | undefined,
    sortAscending: args.sortAscending !== false,
    includeSize: args.includeSize !== false,
    includeDateModified: args.includeDateModified !== false,
    includeDateCreated: Boolean(args.includeDateCreated),
    includeAttributes: Boolean(args.includeAttributes),
  };
}

// ─── MCP Server ────────────────────────────────────────────────────────────
const server = new Server(
  { name: "everything-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "search": {
        const options = parseArgs(args);
        const { client } = await getClient();
        const response = await client.search(options);
        return { content: [{ type: "text", text: formatSearchResponse(response) }] };
      }

      case "search_files": {
        const options = parseArgs(args);
        options.query = `file: ${options.query}`;
        const { client } = await getClient();
        const response = await client.search(options);
        return { content: [{ type: "text", text: formatSearchResponse(response) }] };
      }

      case "search_folders": {
        const options = parseArgs(args);
        options.query = `folder: ${options.query}`;
        options.includeSize = false;
        const { client } = await getClient();
        const response = await client.search(options);
        return { content: [{ type: "text", text: formatSearchResponse(response) }] };
      }

      case "search_recent": {
        const days = typeof args.days === "number" ? args.days : 7;
        const extra = args.query ? ` ${String(args.query)}` : "";
        const dateFilter = `dm:last${days}days`;
        const options = parseArgs({
          ...args,
          query: `${dateFilter}${extra}`,
          sortBy: "date_modified",
          sortAscending: false,
          includeDateModified: true,
        });
        const { client } = await getClient();
        const response = await client.search(options);
        return { content: [{ type: "text", text: formatSearchResponse(response) }] };
      }

      case "search_large_files": {
        const minMB = typeof args.minSizeMB === "number" ? args.minSizeMB : 100;
        const extra = args.query ? ` ${String(args.query)}` : "";
        const options = parseArgs({
          ...args,
          query: `file: size:>=${minMB}mb${extra}`,
          sortBy: "size",
          sortAscending: false,
          includeSize: true,
        });
        const { client } = await getClient();
        const response = await client.search(options);
        return { content: [{ type: "text", text: formatSearchResponse(response) }] };
      }

      case "search_duplicates": {
        const filename = String(args.filename ?? "");
        const options = parseArgs({
          ...args,
          query: filename,
          sortBy: "name",
          sortAscending: true,
        });
        const { client } = await getClient();
        const response = await client.search(options);
        // Group by name to show duplicates
        const groups = new Map<string, typeof response.results>();
        for (const r of response.results) {
          const key = r.name.toLowerCase();
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        }
        const duplicates = [...groups.entries()]
          .filter(([, items]) => items.length > 1)
          .sort((a, b) => b[1].length - a[1].length);

        const lines: string[] = [
          `Found ${duplicates.length} duplicate name(s) across ${response.totalResults} total results`,
          `Source: ${response.source.toUpperCase()}`,
          "",
        ];
        for (const [name, items] of duplicates) {
          lines.push(`📄 "${name}" — ${items.length} copies:`);
          for (const item of items) {
            const size = item.sizeFormatted ? ` (${item.sizeFormatted})` : "";
            const date = item.dateModified
              ? ` [${new Date(item.dateModified).toLocaleDateString()}]`
              : "";
            lines.push(`   ${item.fullPath}${size}${date}`);
          }
          lines.push("");
        }
        if (duplicates.length === 0) {
          lines.push("No duplicate filenames found.");
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "get_status": {
        const httpAvailable = await httpClient.isAvailable();
        const cliAvailable = cliClient.isAvailable();
        const lines: string[] = [
          "=== Everything MCP Status ===",
          "",
          `HTTP Server (${config.host}:${config.port}): ${httpAvailable ? "✅ Connected" : "❌ Not available"}`,
          `CLI (es.exe): ${cliAvailable ? "✅ Available" : "❌ Not found"}`,
          "",
          `Active source: ${httpAvailable ? "HTTP" : cliAvailable ? "CLI" : "NONE"}`,
          "",
          "Configuration:",
          `  Host: ${config.host}`,
          `  Port: ${config.port}`,
          `  Auth: ${config.username ? "Enabled" : "None"}`,
          `  ES path: ${config.esExePath ?? "(auto-detect)"}`,
          "",
          "Environment variables:",
          "  EVERYTHING_HOST     — HTTP server hostname (default: localhost)",
          "  EVERYTHING_PORT     — HTTP server port (default: 80)",
          "  EVERYTHING_USERNAME — HTTP auth username",
          "  EVERYTHING_PASSWORD — HTTP auth password",
          "  EVERYTHING_ES_PATH  — Path to es.exe",
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Format response ───────────────────────────────────────────────────────
function formatSearchResponse(response: Awaited<ReturnType<EverythingHttpClient["search"]>>): string {
  const { totalResults, returnedResults, offset, results, query, source } = response;

  const lines: string[] = [
    `Query: "${query}"`,
    `Results: ${returnedResults} of ${totalResults} total (offset: ${offset})`,
    `Source: ${source.toUpperCase()}`,
    "",
  ];

  if (results.length === 0) {
    lines.push("No results found.");
    return lines.join("\n");
  }

  for (const item of results) {
    const icon = item.isDirectory ? "📁" : getFileIcon(item.extension);
    const size = item.sizeFormatted ? ` [${item.sizeFormatted}]` : "";
    const date = item.dateModified
      ? ` — ${new Date(item.dateModified).toLocaleString()}`
      : "";
    lines.push(`${icon} ${item.fullPath}${size}${date}`);
  }

  if (totalResults > returnedResults + offset) {
    const remaining = totalResults - returnedResults - offset;
    lines.push("");
    lines.push(`... and ${remaining} more results. Use offset parameter to paginate.`);
  }

  return lines.join("\n");
}

function getFileIcon(ext: string | null): string {
  if (!ext) return "📄";
  const e = ext.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "ico"].includes(e)) return "🖼️";
  if (["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"].includes(e)) return "🎬";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(e)) return "🎵";
  if (["pdf"].includes(e)) return "📕";
  if (["doc", "docx", "odt", "rtf"].includes(e)) return "📝";
  if (["xls", "xlsx", "ods", "csv"].includes(e)) return "📊";
  if (["ppt", "pptx", "odp"].includes(e)) return "📊";
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(e)) return "🗜️";
  if (["exe", "msi", "bat", "cmd", "sh"].includes(e)) return "⚙️";
  if (["js", "ts", "py", "java", "cs", "cpp", "c", "go", "rs", "rb", "php"].includes(e)) return "💻";
  if (["html", "htm", "css", "scss", "json", "xml", "yaml", "yml"].includes(e)) return "🌐";
  if (["txt", "md", "log"].includes(e)) return "📄";
  return "📄";
}

// ─── Start server ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with MCP stdout protocol
  process.stderr.write("Everything MCP server started\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
