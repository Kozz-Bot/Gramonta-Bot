import path from "path";
import { McpClient } from "src/Agent/McpClient";

// Path to the compiled MCP server entry point — relative to this file's location
// src/Agent/Tools → ../../../../web-search-mcp/dist/index.js
const MCP_SERVER_PATH = path.resolve(
  __dirname,
  "../../../../web-search-mcp/dist/index.js",
);

// Singleton client — one process shared for the lifetime of the bot
let _client: McpClient | null = null;

const getClient = (): McpClient => {
  if (!_client) {
    _client = new McpClient(MCP_SERVER_PATH);
  }
  return _client;
};

export type WebSearchSummaryResult = {
  query: string;
  rawText: string;
};

/**
 * Calls the lightweight `get-web-search-summaries` MCP tool.
 * Returns the raw text blob produced by the MCP server so the caller
 * can feed it to a second LLM pass for synthesis.
 */
export const webSearchSummaries = async (
  query: string,
  limit = 5,
): Promise<WebSearchSummaryResult> => {
  const client = getClient();
  const rawText = await client.callTool("get-web-search-summaries", {
    query,
    limit,
  });
  return { query, rawText };
};

/**
 * Calls the comprehensive `full-web-search` MCP tool.
 * Use when richer page content is needed.
 */
export const webSearchFull = async (
  query: string,
  limit = 3,
): Promise<WebSearchSummaryResult> => {
  const client = getClient();
  const rawText = await client.callTool("full-web-search", {
    query,
    limit,
    includeContent: true,
  });
  return { query, rawText };
};
