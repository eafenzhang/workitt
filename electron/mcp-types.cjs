// mcp-types.cjs — Shared type definitions for MCP runtime
// These are plain const objects/enums, not TypeScript, for CJS compatibility.

/**
 * MCP connection status enum.
 * @enum {string}
 */
const McpStatus = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
});

/**
 * MCP server status snapshot sent to renderer via IPC.
 * @typedef {Object} McpServerState
 * @property {number} id - DB row id
 * @property {string} name - Server display name
 * @property {string} status - One of McpStatus values
 * @property {number} toolCount - Number of tools discovered
 * @property {string} [error] - Error message if status === 'error'
 * @property {Array<McpToolInfo>} [tools] - Tool definitions (only when requested)
 */

/**
 * MCP tool info (MCP protocol shape, simplified for IPC).
 * @typedef {Object} McpToolInfo
 * @property {string} name - Tool name (with serverName__ prefix for LLM)
 * @property {string} [description] - Tool description
 * @property {Object} [inputSchema] - JSON Schema for tool parameters
 * @property {number} [serverId] - Owning server DB id
 * @property {string} [serverName] - Owning server display name
 */

/**
 * LLM-compatible tool format for OpenAI function calling.
 * @typedef {Object} OpenAiTool
 * @property {string} type - Always 'function'
 * @property {Object} function
 * @property {string} function.name - Tool name (with prefix)
 * @property {string} function.description - Tool description
 * @property {Object} function.parameters - JSON Schema
 */

/**
 * LLM-compatible tool format for Anthropic tool_use.
 * @typedef {Object} AnthropicTool
 * @property {string} name - Tool name (with prefix)
 * @property {string} description - Tool description
 * @property {Object} input_schema - JSON Schema
 */

module.exports = { McpStatus };
