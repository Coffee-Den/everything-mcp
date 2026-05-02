import type {
  EverythingConfig,
  EverythingRawResponse,
  SearchOptions,
  SearchResponse,
  SearchResult,
  SortField,
} from "./types.js";
import { FILE_ATTRIBUTES } from "./types.js";

/** Convert Windows FILETIME (100-ns intervals since 1601-01-01) to JS Date */
function filetimeToDate(filetime: number): Date {
  // FILETIME epoch offset: 116444736000000000 * 100ns = 11644473600 seconds
  const EPOCH_DIFF_SECONDS = 11644473600n;
  const ft = BigInt(filetime);
  const unixMs = Number((ft / 10000n) - (EPOCH_DIFF_SECONDS * 1000n));
  return new Date(unixMs);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isDirectory(attributes: number | undefined): boolean {
  if (attributes === undefined) return false;
  return (attributes & FILE_ATTRIBUTES.DIRECTORY) !== 0;
}

const SORT_MAP: Record<SortField, string> = {
  name: "name",
  path: "path",
  size: "size",
  date_modified: "date_modified",
  date_created: "date_created",
  extension: "extension",
  type: "type",
  run_count: "run_count",
  date_recently_changed: "date_recently_changed",
  date_accessed: "date_accessed",
  date_run: "date_run",
};

export class EverythingHttpClient {
  private baseUrl: string;
  private authHeader: string | null;

  constructor(config: EverythingConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    if (config.username || config.password) {
      const credentials = Buffer.from(
        `${config.username ?? ""}:${config.password ?? ""}`
      ).toString("base64");
      this.authHeader = `Basic ${credentials}`;
    } else {
      this.authHeader = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.baseUrl}/?j=1&count=1`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const params = this.buildParams(options);
    const url = `${this.baseUrl}/?${params}`;

    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(
        `Everything HTTP server returned ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as EverythingRawResponse;
    const results = this.transformResults(data.results, options);

    return {
      totalResults: data.totalResults,
      returnedResults: results.length,
      offset: options.offset ?? 0,
      results,
      query: options.query,
      source: "http",
    };
  }

  private buildParams(options: SearchOptions): string {
    const p = new URLSearchParams();

    p.set("search", options.query);
    p.set("j", "1"); // JSON mode
    p.set("count", String(options.maxResults ?? 100));
    p.set("offset", String(options.offset ?? 0));

    if (options.caseSensitive) p.set("case", "1");
    if (options.wholeWord) p.set("wholeword", "1");
    if (options.matchPath) p.set("path", "1");
    if (options.regex) p.set("regex", "1");
    if (options.diacritics) p.set("diacritics", "1");

    if (options.sortBy) p.set("sort", SORT_MAP[options.sortBy]);
    p.set("ascending", options.sortAscending === false ? "0" : "1");

    // Always include path column
    p.set("path_column", "1");

    if (options.includeSize !== false) p.set("size_column", "1");
    if (options.includeDateModified !== false) p.set("date_modified_column", "1");
    if (options.includeDateCreated) p.set("date_created_column", "1");
    if (options.includeAttributes) p.set("attributes_column", "1");

    return p.toString();
  }

  private transformResults(
    raw: EverythingRawResponse["results"],
    options: SearchOptions
  ): SearchResult[] {
    return raw.map((item) => {
      const dir = isDirectory(item.attributes);
      const path = item.path ?? "";
      const sep = path.endsWith("\\") || path.endsWith("/") ? "" : "\\";
      const fullPath = path ? `${path}${sep}${item.name}` : item.name;

      const ext = dir
        ? null
        : (item.extension ?? item.name.includes(".")
            ? item.name.split(".").pop() ?? null
            : null);

      return {
        name: item.name,
        path,
        fullPath,
        size: options.includeSize !== false && item.size !== undefined
          ? item.size
          : null,
        sizeFormatted: options.includeSize !== false && item.size !== undefined
          ? formatFileSize(item.size)
          : null,
        dateModified:
          options.includeDateModified !== false && item.date_modified
            ? filetimeToDate(item.date_modified).toISOString()
            : null,
        dateCreated:
          options.includeDateCreated && item.date_created
            ? filetimeToDate(item.date_created).toISOString()
            : null,
        extension: ext ?? null,
        isDirectory: dir,
        attributes: options.includeAttributes ? (item.attributes ?? null) : null,
      };
    });
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.authHeader) {
      headers["Authorization"] = this.authHeader;
    }
    return headers;
  }
}
