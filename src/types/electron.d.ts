export {};

declare global {
  interface ElectronAPI {
    /** Read images from the system clipboard */
    readClipboardImages: () => Promise<string[]>;
    /** Read structured file data from clipboard (WeChat/WeCom) */
    readClipboardFiles: () => Promise<any[]>;
    /** Read plain text from clipboard */
    readClipboardText: () => Promise<string>;
    /** Read HTML content from clipboard */
    readClipboardHTML: () => Promise<string>;
    /** Read a local file and return as data URL, or null if not found */
    readLocalFile: (path: string) => Promise<string | null>;
    /** Check for available app updates */
    checkForUpdate: () => Promise<any>;
    /** Download the available update */
    downloadUpdate: () => Promise<any>;
    /** Install the downloaded update (quits & restarts) */
    installUpdate: () => void;
    /** Subscribe to requirements-changed events; returns unsubscribe function */
    onRequirementsChanged: (cb: () => void) => () => void;
    /** Subscribe to window maximize state changes */
    onWindowMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
    /** Get the current app version string */
    getAppVersion: () => Promise<string>;
    /** Open a URL in the default external browser */
    openExternal: (url: string) => void;
    /** Open a local file/folder path in the default system handler */
    openPathExternal?: (path: string) => void;

    // ── QuickCapture window control ──
    /** Show the QuickCapture popup window */
    showQC: () => void;
    /** Hide (minimize) the QuickCapture popup window */
    hideQC: () => void;
    /** Close the QuickCapture popup window */
    closeQC: () => void;
    /** Indicates whether the current window is the QC popup */
    __isQCPopup?: boolean;
    /** Close the QC form (standalone mode) */
    closeQCForm?: () => void;
    /** Subscribe to QC form data events */
    onQCFormData: (cb: (data: any) => void) => () => void;
    /** Notify the main window that requirements have changed */
    notifyRequirementsChanged: () => void;
    /** Toggle the QuickCapture popup visibility */
    toggleQC: () => void;

    // ── Database IPC (used by api.ts) ──
    /** Execute a database query via IPC */
    dbQuery: (method: string, table: string, params: { data?: any; id?: number | string }) => Promise<any>;

    /** Send chat message to AI model */
    chatSend: (payload: { providerId?: string; modelId?: string; messages: { role: string; content: string }[]; systemPrompt?: string; toolsEnabled?: boolean }) => Promise<{ content?: string; error?: string; toolCallHistory?: any[] }>;
    
    // ── Agent Memory ──
    memoryGetAll: () => Promise<{ id: number; key: string; value: string; source: string; createdAt: string; updatedAt: string }[]>;
    memoryUpsert: (key: string, value: string, source?: string) => Promise<{ created?: boolean; updated?: boolean; key: string }>;
    memoryDelete: (key: string) => Promise<{ deleted: boolean; key: string }>;
    memoryClear: () => Promise<{ cleared: boolean }>;
    memorySummary: () => Promise<string>;
    // ── CLI Tools ──
    cliCheckCommand: (command: string) => Promise<{ exists: boolean; path: string | null }>;
    cliInstall: (command: string) => Promise<{ success: boolean; output?: string; error?: string }>;
    /** Test connection to a specific model configuration by ID */
    testModelConnection: (modelId: number) => Promise<boolean>;
    /** Get application settings */
    getSettings: () => Promise<{ minimizeToTray: boolean; openAtLogin: boolean }>;
    /** Set open at login preference */
    setOpenAtLogin: (v: boolean) => Promise<void>;
    /** Set minimize to tray preference */
    setMinimizeToTray: (v: boolean) => Promise<void>;
    /** Get application version string */
    getVersion: () => Promise<string>;
    /** Subscribe to update available events */
    onUpdateAvailable: (cb: (version: string) => void) => () => void;
    /** Subscribe to update progress events */
    onUpdateProgress: (cb: (progress: number) => void) => () => void;
    /** Subscribe to update downloaded events */
    onUpdateDownloaded: (cb: () => void) => () => void;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}
