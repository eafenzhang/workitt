import { useState, useEffect, useCallback } from 'react';

export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerState {
  status: McpStatus;
  toolCount: number;
  error?: string;
  name?: string;
}

export interface McpStatusPayload {
  id: number;
  status: McpStatus;
  error?: string;
  toolCount: number;
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
}

/**
 * React hook that subscribes to MCP server status updates from the Electron main process.
 * Returns a snapshot of all known server states.
 */
export function useMcpStatus(): {
  servers: Record<string, McpServerState>;
  requestRefresh: () => void;
} {
  const [servers, setServers] = useState<Record<string, McpServerState>>({});

  // Fetch initial status snapshot
  const requestRefresh = useCallback(() => {
    const api = (window as any).electronAPI;
    if (api?.mcpGetStatus) {
      api.mcpGetStatus().then((snapshot: Record<string, McpServerState>) => {
        if (snapshot && typeof snapshot === 'object') {
          setServers(prev => ({ ...prev, ...snapshot }));
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.mcpSubscribeStatus) return;

    // Subscribe to real-time status updates
    const unsubscribe = api.mcpSubscribeStatus((payload: McpStatusPayload) => {
      if (!payload) return;
      setServers(prev => ({
        ...prev,
        [String(payload.id)]: {
          status: payload.status,
          toolCount: payload.toolCount || 0,
          error: payload.error,
          name: (prev[String(payload.id)]?.name) || '',
        },
      }));
    });

    // Fetch initial state
    requestRefresh();

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [requestRefresh]);

  return { servers, requestRefresh };
}

/**
 * Get a human-readable status label for display.
 */
export function getStatusLabel(status: McpStatus): string {
  switch (status) {
    case 'connected': return '已连接';
    case 'connecting': return '连接中...';
    case 'disconnected': return '未连接';
    case 'error': return '错误';
    default: return '未知';
  }
}

/**
 * Get a color class for the status indicator dot.
 */
export function getStatusColor(status: McpStatus): string {
  switch (status) {
    case 'connected': return '#10b981';  // green
    case 'connecting': return '#f59e0b'; // yellow
    case 'disconnected': return '#9ca3af'; // gray
    case 'error': return '#ef4444';       // red
    default: return '#9ca3af';
  }
}
