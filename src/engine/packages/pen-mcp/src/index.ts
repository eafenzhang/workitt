// Core
export { configureMcpHooks, getMcpHooks } from './hooks';
export type { McpHooks } from './hooks';
// server.ts is a standalone entry point (MCP server binary), not re-exported

// Constants
export { MCP_DEFAULT_PORT, PORT_FILE_DIR_NAME, PORT_FILE_NAME, ICONIFY_API_URL } from './constants';

// Document manager
export {
  openDocument,
  saveDocument,
  resolveDocPath,
  createEmptyDocument,
  getCachedDocument,
  setCachedDocument,
  getSyncUrl,
  setSyncUrl,
  clearSyncUrl,
  getLiveSyncState,
  fetchLiveSelection,
  fileExists,
  invalidateCache,
  LIVE_CANVAS_PATH,
} from './document-manager';
export type { LiveSyncState } from './document-manager';

// Tools (MinoPencil: simplified to 10 core tools)
export { handleOpenDocument } from './tools/open-document';
export { handleGetSelection } from './tools/get-selection';
export {
  handleInsertNode,
  handleUpdateNode,
  handleDeleteNode,
  handleMoveNode,
  handleCopyNode,
  handleReplaceNode,
  postProcessNode,
} from './tools/node-crud';
export { handleBatchDesign } from './tools/batch-design';
export { handleDesignSkeleton } from './tools/design-skeleton';
export { handleDesignContent } from './tools/design-content';
export { handleGetDesignMd, handleSetDesignMd, handleExportDesignMd } from './tools/design-md';
export { buildDesignPrompt, listPromptSections } from './tools/design-prompt';
export { handleGetVariables, handleSetVariables, handleSetThemes } from './tools/variables';
export {
  handleAddPage,
  handleRemovePage,
  handleRenamePage,
  handleReorderPage,
  handleDuplicatePage,
} from './tools/pages';

// Utils
export { generateId } from './utils/id';
export { sanitizeObject } from './utils/sanitize';
export { buildDesignMdStylePolicy } from './utils/design-md-style-policy';
export {
  parseDesignMd,
  generateDesignMd,
  extractDesignMdFromDocument,
} from './utils/design-md-parser';
export { validateContract } from './utils/validate-contract';
export { readNodeWithDepth } from './utils/node-operations';

// Log utilities (sensitive redaction + log tail reading)
export { SENSITIVE_LOG_PATTERN, readDebugTail, readLogTail } from './utils/log-utils';
export type { ReadLogTailOptions } from './utils/log-utils';
