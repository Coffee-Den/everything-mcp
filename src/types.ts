export interface EverythingConfig {
  /** HTTP server host (default: localhost) */
  host: string;
  /** HTTP server port (default: 80) */
  port: number;
  /** Username for HTTP authentication (optional) */
  username?: string;
  /** Password for HTTP authentication (optional) */
  password?: string;
  /** Path to es.exe for CLI fallback (optional) */
  esExePath?: string;
}

export interface SearchOptions {
  /** Search query string. Supports Everything syntax (spaces=AND, |=OR, !=NOT, "..."=exact) */
  query: string;
  /** Maximum number of results to return (default: 100) */
  maxResults?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
  /** Case-sensitive matching (default: false) */
  caseSensitive?: boolean;
  /** Match whole words only (default: false) */
  wholeWord?: boolean;
  /** Search in full path, not just filename (default: false) */
  matchPath?: boolean;
  /** Use regular expression syntax (default: false) */
  regex?: boolean;
  /** Match diacritics (default: false) */
  diacritics?: boolean;
  /** Sort field */
  sortBy?: SortField;
  /** Sort ascending (default: true) */
  sortAscending?: boolean;
  /** Include file size in results (default: true) */
  includeSize?: boolean;
  /** Include date modified in results (default: true) */
  includeDateModified?: boolean;
  /** Include date created in results (default: false) */
  includeDateCreated?: boolean;
  /** Include file attributes in results (default: false) */
  includeAttributes?: boolean;
}

export type SortField =
  | "name"
  | "path"
  | "size"
  | "date_modified"
  | "date_created"
  | "extension"
  | "type"
  | "run_count"
  | "date_recently_changed"
  | "date_accessed"
  | "date_run";

/** Raw result from Everything HTTP JSON API */
export interface EverythingRawResult {
  name: string;
  path?: string;
  size?: number;
  date_modified?: number;
  date_created?: number;
  date_accessed?: number;
  attributes?: number;
  extension?: string;
  type?: string;
}

/** Raw response from Everything HTTP JSON API */
export interface EverythingRawResponse {
  totalResults: number;
  results: EverythingRawResult[];
}

/** Formatted search result returned to MCP client */
export interface SearchResult {
  /** File or folder name */
  name: string;
  /** Full path (directory containing the file) */
  path: string;
  /** Full path including filename */
  fullPath: string;
  /** File size in bytes (null for folders or if not requested) */
  size: number | null;
  /** Human-readable file size (e.g. "1.23 MB") */
  sizeFormatted: string | null;
  /** Last modified date (ISO 8601) */
  dateModified: string | null;
  /** Created date (ISO 8601) */
  dateCreated: string | null;
  /** File extension (without dot) */
  extension: string | null;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** File attributes bitmask */
  attributes: number | null;
}

export interface SearchResponse {
  /** Total number of results matching the query (may be more than returned) */
  totalResults: number;
  /** Number of results returned */
  returnedResults: number;
  /** Current offset */
  offset: number;
  /** The results */
  results: SearchResult[];
  /** Query that was executed */
  query: string;
  /** Data source used */
  source: "http" | "cli";
}

/** File attribute flags (Windows) */
export const FILE_ATTRIBUTES = {
  READONLY: 0x1,
  HIDDEN: 0x2,
  SYSTEM: 0x4,
  DIRECTORY: 0x10,
  ARCHIVE: 0x20,
  DEVICE: 0x40,
  NORMAL: 0x80,
  TEMPORARY: 0x100,
  SPARSE_FILE: 0x200,
  REPARSE_POINT: 0x400,
  COMPRESSED: 0x800,
  OFFLINE: 0x1000,
  NOT_CONTENT_INDEXED: 0x2000,
  ENCRYPTED: 0x4000,
} as const;
