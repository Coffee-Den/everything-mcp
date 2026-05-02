import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import path from "path";
import type { EverythingConfig, SearchOptions, SearchResponse, SearchResult } from "./types.js";

const execAsync = promisify(exec);

const DEFAULT_ES_PATHS = [
  "C:\\Program Files\\Everything\\es.exe",
  "C:\\Program Files (x86)\\Everything\\es.exe",
  "C:\\Users\\Public\\Everything\\es.exe",
  "es.exe", // in PATH
];

function findEsExe(configPath?: string): string | null {
  if (configPath && existsSync(configPath)) return configPath;
  for (const p of DEFAULT_ES_PATHS) {
    if (p === "es.exe") return p; // trust PATH
    if (existsSync(p)) return p;
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseSize(s: string): number | null {
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : n;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export class EverythingCliClient {
  private esPath: string | null;

  constructor(config: EverythingConfig) {
    this.esPath = findEsExe(config.esExePath);
  }

  isAvailable(): boolean {
    return this.esPath !== null;
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    if (!this.esPath) {
      throw new Error(
        "es.exe not found. Install Everything or set esExePath in config."
      );
    }

    const args = this.buildArgs(options);
    const cmd = `"${this.esPath}" ${args}`;

    let stdout = "";
    try {
      const result = await execAsync(cmd, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
      });
      stdout = result.stdout;
    } catch (err: unknown) {
      const error = err as { stdout?: string; code?: number };
      // exit code 1 = no results, which is fine
      if (error.code === 1 && error.stdout !== undefined) {
        stdout = error.stdout;
      } else {
        throw new Error(`es.exe failed: ${String(err)}`);
      }
    }

    const results = this.parseOutput(stdout.trim(), options);
    const totalResults = await this.countResults(options);

    return {
      totalResults,
      returnedResults: results.length,
      offset: options.offset ?? 0,
      results,
      query: options.query,
      source: "cli",
    };
  }

  private buildArgs(options: SearchOptions): string {
    const parts: string[] = [];

    // Output as CSV with columns: Filename, Path, Size, Date Modified
    parts.push("-csv");
    parts.push("-filename-column");
    parts.push("-path-column");
    if (options.includeSize !== false) parts.push("-size-column");
    if (options.includeDateModified !== false) parts.push("-date-modified-column");
    if (options.includeDateCreated) parts.push("-date-created-column");

    if (options.caseSensitive) parts.push("-case");
    if (options.wholeWord) parts.push("-whole-word");
    if (options.matchPath) parts.push("-match-path");
    if (options.regex) parts.push("-regex");
    if (options.diacritics) parts.push("-diacritics");

    const offset = options.offset ?? 0;
    const count = options.maxResults ?? 100;
    parts.push(`-offset ${offset}`);
    parts.push(`-n ${count}`);

    if (options.sortBy) {
      const sortMap: Record<string, string> = {
        name: "name",
        path: "path",
        size: "size",
        date_modified: "date-modified",
        date_created: "date-created",
        extension: "extension",
        type: "type",
        run_count: "run-count",
        date_recently_changed: "date-recently-changed",
        date_accessed: "date-accessed",
        date_run: "date-run",
      };
      const sortKey = sortMap[options.sortBy] ?? "name";
      parts.push(`-sort-${sortKey}`);
      if (options.sortAscending === false) parts.push("-sort-descending");
    }

    parts.push(`"${options.query.replace(/"/g, '\\"')}"`);

    return parts.join(" ");
  }

  private async countResults(options: SearchOptions): Promise<number> {
    if (!this.esPath) return 0;
    try {
      const countArgs = this.buildCountArgs(options);
      const { stdout } = await execAsync(
        `"${this.esPath}" ${countArgs}`,
        { encoding: "utf8", windowsHide: true, timeout: 5000 }
      );
      const n = parseInt(stdout.trim(), 10);
      return isNaN(n) ? 0 : n;
    } catch {
      return 0;
    }
  }

  private buildCountArgs(options: SearchOptions): string {
    const parts: string[] = ["-count"];
    if (options.caseSensitive) parts.push("-case");
    if (options.wholeWord) parts.push("-whole-word");
    if (options.matchPath) parts.push("-match-path");
    if (options.regex) parts.push("-regex");
    parts.push(`"${options.query.replace(/"/g, '\\"')}"`);
    return parts.join(" ");
  }

  private parseOutput(output: string, options: SearchOptions): SearchResult[] {
    if (!output) return [];

    const lines = output.split(/\r?\n/).filter((l) => l.trim());
    // First line is CSV header
    if (lines.length < 2) return [];

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const fnIdx = header.indexOf("filename");
    const pathIdx = header.indexOf("path");
    const sizeIdx = header.indexOf("size");
    const modIdx = header.findIndex((h) => h.includes("date modified"));
    const createdIdx = header.findIndex((h) => h.includes("date created"));

    const results: SearchResult[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (!cols.length) continue;

      const name = fnIdx >= 0 ? (cols[fnIdx] ?? "").trim() : "";
      const filePath = pathIdx >= 0 ? (cols[pathIdx] ?? "").trim() : "";
      if (!name) continue;

      const sep = filePath.endsWith("\\") || filePath.endsWith("/") ? "" : "\\";
      const fullPath = filePath ? `${filePath}${sep}${name}` : name;

      const rawSize = sizeIdx >= 0 ? cols[sizeIdx] : undefined;
      const sizeBytes = rawSize !== undefined ? parseSize(rawSize) : null;

      const ext = name.includes(".")
        ? (name.split(".").pop() ?? null)
        : null;

      // Check if directory by trying to detect missing size in a file entry
      // (CSV mode doesn't easily expose attributes, infer from no extension + no size)
      const isDir = sizeBytes === null && ext === null;

      const dateModifiedRaw = modIdx >= 0 ? cols[modIdx] : undefined;
      const dateCreatedRaw = createdIdx >= 0 ? cols[createdIdx] : undefined;

      results.push({
        name,
        path: filePath,
        fullPath,
        size: sizeBytes,
        sizeFormatted: sizeBytes !== null ? formatFileSize(sizeBytes) : null,
        dateModified: dateModifiedRaw?.trim() || null,
        dateCreated: dateCreatedRaw?.trim() || null,
        extension: isDir ? null : ext,
        isDirectory: isDir,
        attributes: null,
      });
    }

    return results;
  }
}
