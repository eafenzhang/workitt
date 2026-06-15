// mcp-manager.cjs — McpClientManager: singleton MCP connection lifecycle manager
// Runs in Electron main process (CJS). Uses dynamic import() for ESM @modelcontextprotocol/sdk.
const { McpStatus } = require('./mcp-types.cjs');
const { log } = require('./database.cjs');

// ── Module-level state ──────────────────────────────────────────────
/** @type {McpClientManager|null} */
let _instance = null;

/** IPC push callback — set by ipc.cjs during setup */
let _statusPushFn = null; // (serverId, status, error?, tools?) => void

/**
 * Set the global status push callback. Called once from ipc.cjs / main.cjs.
 * @param {(serverId: number, status: string, error?: string, tools?: Array) => void} fn
 */
function setStatusPushFn(fn) {
  _statusPushFn = fn;
}

/**
 * Push status to all renderer windows.
 * @param {number} serverId
 * @param {string} status
 * @param {string} [error]
 * @param {Array} [tools]
 */
function pushStatus(serverId, status, error, tools) {
  if (_statusPushFn) {
    try { _statusPushFn(serverId, status, error, tools); } catch (e) { log('pushStatus error', e); }
  }
}

// ── McpClientManager class ──────────────────────────────────────────
class McpClientManager {
  constructor() {
    if (_instance) return _instance;

    /**
     * Map of serverId → { client, transport, config, status, tools }
     * @type {Map<number, {
     *   client: any,          // MCP Client instance
     *   transport: any,       // StdioClientTransport instance
     *   config: Object,       // { command, args, env }
     *   status: string,       // McpStatus value
     *   tools: Array,         // Discovered tools
     *   retryCount: number,   // Current retry attempt
     *   retryTimer: NodeJS.Timeout|null,  // Retry timeout handle
     * }>}
     */
    this._servers = new Map();
    /** MCP SDK module — loaded lazily via require() */
    this._sdk = null;

    _instance = this;
  }

  /**
   * Get the global singleton instance.
   * @returns {McpClientManager}
   */
  static getInstance() {
    if (!_instance) _instance = new McpClientManager();
    return _instance;
  }

  // ── SDK lazy loader ─────────────────────────────────────────────
  /**
   * Load @modelcontextprotocol/sdk via dynamic import (ESM-in-CJS).
   * Deduplicates concurrent calls.
   * @returns {Promise<{Client: any, StdioClientTransport: any}>}
   */
  async _loadSdk() {
    if (this._sdk) return this._sdk;

    try {
      // SDK v1.29.0: use subpath exports with .js extension for CJS
      const { Client } = require('@modelcontextprotocol/sdk/client');
      const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

      this._sdk = { Client, StdioClientTransport };
      log('McpManager: SDK loaded successfully');
      return this._sdk;
    } catch (err) {
      log('McpManager: SDK load failed', err);
      throw err;
    }
  }

  // ── Connection lifecycle ─────────────────────────────────────────
  /**
   * Connect to an MCP server.
   * @param {number} id - Database row id
   * @param {{command: string, args: string[], env: Object, name: string}} config
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async connect(id, config) {
    // Disconnect existing connection for this server
    await this.disconnect(id);

    const serverState = {
      client: null,
      transport: null,
      config: { ...config },
      status: McpStatus.CONNECTING,
      tools: [],
      retryCount: 0,
      retryTimer: null,
      error: '',
    };
    this._servers.set(id, serverState);

    pushStatus(id, McpStatus.CONNECTING);
    log('McpManager: connecting server #' + id + ' (' + config.name + ') command=' + config.command);

    try {
      const { Client, StdioClientTransport } = await this._loadSdk();

      // Build transport with command + args + env (inherit PATH for npx)
      // Strip angle brackets from env values (common paste error from docs)
      const cleanEnv = {};
      if (config.env && typeof config.env === 'object') {
        for (const [k, v] of Object.entries(config.env)) {
          cleanEnv[k] = typeof v === 'string' ? v.replace(/^<|>$/g, '') : v;
        }
      }
      const transportConfig = {
        command: config.command,
        args: Array.isArray(config.args) ? config.args : [],
        env: { ...process.env, ...cleanEnv },
      };

      const fullCmd = config.command + ' ' + (Array.isArray(config.args) ? config.args.join(' ') : '');
      log('McpManager: spawning: ' + fullCmd);

      const transport = new StdioClientTransport(transportConfig);
      const client = new Client(
        { name: 'workit', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      // Connection timeout (60s — npx first-run may download packages)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout (60s) for: ' + fullCmd)), 60000);
      });

      await Promise.race([
        (async () => {
          await client.connect(transport);
        })(),
        timeoutPromise,
      ]);

      // Discover tools
      const toolsResult = await client.listTools();
      const tools = (toolsResult && toolsResult.tools) ? toolsResult.tools : [];

      // Store state
      serverState.client = client;
      serverState.transport = transport;
      serverState.status = McpStatus.CONNECTED;
      serverState.tools = tools;
      serverState.retryCount = 0;
      this._servers.set(id, serverState);

      // Listen for transport close → reconnect
      transport.onclose = () => {
        log('McpManager: transport closed for server #' + id + ' (' + config.name + ')');
        const state = this._servers.get(id);
        if (state) {
          state.status = McpStatus.DISCONNECTED;
          pushStatus(id, McpStatus.DISCONNECTED);
          this._reconnect(id, config, 0);
        }
      };

      // Collect stderr for diagnostics
      if (transport.stderr) {
        transport.stderr.on('data', (data) => {
          const msg = String(data).substring(0, 500);
          log('McpManager: stderr from #' + id + ': ' + msg);
          serverState.stderr = (serverState.stderr || '') + msg;
        });
      }

      pushStatus(id, McpStatus.CONNECTED, undefined, tools);
      log('McpManager: connected server #' + id + ' (' + config.name + '), tools=' + tools.length);
      return { success: true };
    } catch (err) {
      const errMsg = (err && err.message ? err.message : String(err)) +
        (serverState.stderr ? ' | stderr: ' + serverState.stderr.slice(-200) : '');
      log('McpManager: connect failed for #' + id + ' (' + config.name + ')', err);
      serverState.status = McpStatus.ERROR;
      serverState.error = errMsg;
      this._servers.set(id, serverState);
      pushStatus(id, McpStatus.ERROR, errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Disconnect from an MCP server and clean up resources.
   * @param {number} id - Database row id
   */
  async disconnect(id) {
    const serverState = this._servers.get(id);
    if (!serverState) return;

    log('McpManager: disconnecting server #' + id);

    // Clear retry timer
    if (serverState.retryTimer) {
      clearTimeout(serverState.retryTimer);
      serverState.retryTimer = null;
    }

    // Close transport (this kills the child process)
    try {
      if (serverState.transport) {
        // StdioClientTransport.close() kills the spawned process
        if (typeof serverState.transport.close === 'function') {
          await serverState.transport.close();
        }
      }
    } catch (e) {
      log('McpManager: error closing transport for #' + id, e);
    }

    // Close client
    try {
      if (serverState.client && typeof serverState.client.close === 'function') {
        await serverState.client.close();
      }
    } catch (e) {
      log('McpManager: error closing client for #' + id, e);
    }

    serverState.status = McpStatus.DISCONNECTED;
    serverState.tools = [];
    serverState.client = null;
    serverState.transport = null;
    this._servers.set(id, serverState);

    pushStatus(id, McpStatus.DISCONNECTED);
  }

  // ── Reconnection with exponential backoff ─────────────────────────
  /**
   * Attempt reconnection with exponential backoff.
   * @param {number} id
   * @param {{command: string, args: string[], env: Object}} config
   * @param {number} retryCount - Current retry count
   */
  async _reconnect(id, config, retryCount) {
    const serverState = this._servers.get(id);
    if (!serverState) return;
    // Don't reconnect if already connected or currently connecting
    if (serverState.status === McpStatus.CONNECTED || serverState.status === McpStatus.CONNECTING) return;
    // Don't reconnect if user explicitly disconnected
    if (serverState.status === McpStatus.DISCONNECTED && retryCount === 0 && !serverState.transport) return;

    // Exponential backoff: 1s → 2s → 4s → 8s → max 30s
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    log('McpManager: reconnecting server #' + id + ' in ' + delay + 'ms (attempt ' + (retryCount + 1) + ')');

    serverState.retryCount = retryCount + 1;
    serverState.status = McpStatus.CONNECTING;
    pushStatus(id, McpStatus.CONNECTING);

    // Clear any existing timer
    if (serverState.retryTimer) clearTimeout(serverState.retryTimer);

    serverState.retryTimer = setTimeout(async () => {
      serverState.retryTimer = null;

      // Disconnect stale resources before reconnecting
      try {
        if (serverState.transport && typeof serverState.transport.close === 'function') {
          await serverState.transport.close();
        }
        if (serverState.client && typeof serverState.client.close === 'function') {
          await serverState.client.close();
        }
      } catch (e) { /* ignore cleanup errors */ }
      serverState.client = null;
      serverState.transport = null;

      const result = await this.connect(id, config);
      if (!result.success && serverState.status !== McpStatus.CONNECTED) {
        // Retry again if still not connected
        this._reconnect(id, config, serverState.retryCount);
      }
    }, delay);
  }

  // ── Tool accessors ────────────────────────────────────────────────
  /**
   * Get all tools from all connected servers, with serverName__toolName prefix.
   * @returns {Array<McpToolInfo>}
   */
  getTools() {
    /** @type {Array} */
    const all = [];
    for (const [id, state] of this._servers) {
      if (state.status !== McpStatus.CONNECTED || !state.tools) continue;
      for (const tool of state.tools) {
        all.push({
          name: state.config.name + '__' + tool.name,
          originalName: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {},
          serverId: id,
          serverName: state.config.name,
        });
      }
    }
    return all;
  }

  /**
   * Get tools formatted for LLM function calling.
   * @param {'openai'|'anthropic'} provider - LLM provider type
   * @returns {Array<Object>}
   */
  getToolsForLLM(provider) {
    const tools = this.getTools();
    if (provider === 'anthropic') {
      return tools.map(t => ({
        name: t.name,
        description: t.description || 'No description',
        input_schema: t.inputSchema || { type: 'object', properties: {} },
      }));
    }
    // OpenAI format
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || 'No description',
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  /**
   * Execute a tool call on a connected server.
   * @param {number} serverId
   * @param {string} originalToolName - Original tool name (without prefix)
   * @param {Object} args - Tool arguments
   * @returns {Promise<{success: boolean, content?: any, error?: string}>}
   */
  async executeToolCall(serverId, originalToolName, args) {
    const state = this._servers.get(serverId);
    if (!state || !state.client) {
      return { success: false, error: 'MCP server not connected (id=' + serverId + ')' };
    }
    if (state.status !== McpStatus.CONNECTED) {
      return { success: false, error: 'MCP server not in connected state: ' + state.status };
    }

    try {
      log('McpManager: executing tool ' + originalToolName + ' on server #' + serverId + ' args=' + JSON.stringify(args || {}).substring(0, 200));
      const result = await state.client.callTool({
        name: originalToolName,
        arguments: args || {},
      });

      // Check for MCP-level error response
      if (result && result.isError) {
        const errContent = result.content && Array.isArray(result.content)
          ? result.content.map(c => (c && typeof c.text === 'string') ? c.text : '').filter(Boolean).join('\n')
          : 'Unknown error';
        log('McpManager: tool ' + originalToolName + ' returned isError: ' + errContent.substring(0, 200));
        return { success: false, error: errContent };
      }

      // Extract text content from MCP result
      let content = '';
      if (result && result.content && Array.isArray(result.content)) {
        content = result.content
          .map(c => (c && typeof c.text === 'string') ? c.text : '')
          .filter(Boolean)
          .join('\n');
      }

      // Truncate large results to 50KB
      if (content.length > 50000) {
        content = content.substring(0, 50000) + '\n\n[结果已截断，原长度: ' + content.length + ' 字符]';
      }

      log('McpManager: tool result for ' + originalToolName + ' (' + content.length + ' chars)');
      return { success: true, content };
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      log('McpManager: tool execution failed for ' + originalToolName, err);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Execute tool by full prefixed name (format: serverName__toolName).
   * This is the convenience method used by the tool call router.
   * @param {string} prefixedName - e.g. "filesystem__read_file"
   * @param {Object} args - Tool arguments
   * @returns {Promise<{success: boolean, content?: any, error?: string}>}
   */
  async executeTool(prefixedName, args) {
    // Parse prefixed name
    const sepIdx = prefixedName.indexOf('__');
    if (sepIdx === -1) {
      return { success: false, error: 'Invalid prefixed tool name: ' + prefixedName };
    }

    const serverName = prefixedName.substring(0, sepIdx);
    const toolName = prefixedName.substring(sepIdx + 2);

    // Find server by name
    for (const [id, state] of this._servers) {
      if (state.config.name === serverName && state.status === McpStatus.CONNECTED) {
        return this.executeToolCall(id, toolName, args);
      }
    }

    return { success: false, error: 'No connected MCP server found with name: ' + serverName };
  }

  /**
   * Get status snapshot for all servers.
   * @returns {Object<string, {status: string, toolCount: number, error?: string}>}
   */
  getStatusSnapshot() {
    /** @type {Object} */
    const snapshot = {};
    for (const [id, state] of this._servers) {
      snapshot[String(id)] = {
        status: state.status,
        toolCount: state.tools ? state.tools.length : 0,
        error: state.status === McpStatus.ERROR ? (state.error || 'Unknown error') : undefined,
        name: state.config.name,
      };
    }
    return snapshot;
  }

  /**
   * Get tools for a specific server (for UI detail panel).
   * @param {number} serverId
   * @returns {Array<Object>}
   */
  getServerTools(serverId) {
    const state = this._servers.get(serverId);
    if (!state || !state.tools) return [];
    return state.tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));
  }

  /**
   * Disconnect all servers and clean up. Called on app quit.
   */
  async shutdown() {
    log('McpManager: shutting down all connections');
    const ids = Array.from(this._servers.keys());
    for (const id of ids) {
      await this.disconnect(id);
    }
  }
}

// ── Exports ─────────────────────────────────────────────────────────
module.exports = {
  McpClientManager,
  pushStatus,
  setStatusPushFn,
};
