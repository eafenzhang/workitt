// Tauri v2 bridge: sets up window.electronAPI using __TAURI_INTERNALS__
// This replaces the preload script from Electron.

const { invoke } = window.__TAURI_INTERNALS__?.core ?? {};
const { listen } = window.__TAURI_INTERNALS__?.event ?? {};

if (invoke && listen) {
  const platform = navigator.platform;

  window.electronAPI = {
    __isQCPopup: false,
    platform,
    versions: { node: '24', chrome: '120', electron: '32' },

    getVersion: () => invoke("get_version"),

    minimize: () => invoke("window_minimize"),
    maximize: () => invoke("window_maximize"),
    close: () => invoke("window_close"),
    isMaximized: () => invoke("window_is_maximized"),

    onMaximizeChange: (cb) => {
      const unlisten = listen("window-maximized-change", (e) => cb(e.payload));
      window.__unlistenMaximize = unlisten;
      return () => unlisten();
    },

    dbQuery: (method, table, args) => invoke("db_query", { method, table, args }),
    dbUpload: (table, fileData) => invoke("db_upload", { table, fileData }),

    checkForUpdate: () => invoke("check_for_update"),
    downloadUpdate: () => invoke("download_update"),
    installUpdate: () => invoke("install_update"),

    onUpdateAvailable: (cb) => {
      const unlisten = listen("update-available", (e) => cb(e.payload));
      window.__unlistenUpdateAvailable = unlisten;
      return () => unlisten();
    },
    onUpdateProgress: (cb) => {
      const unlisten = listen("update-download-progress", (e) => cb(e.payload));
      window.__unlistenUpdateProgress = unlisten;
      return () => unlisten();
    },
    onUpdateDownloaded: (cb) => {
      const unlisten = listen("update-downloaded", () => cb());
      window.__unlistenUpdateDownloaded = unlisten;
      return () => unlisten();
    },

    getSettings: () => invoke("get_settings"),
    setMinimizeToTray: (enabled) => invoke("set_minimize_to_tray", { enabled }),
    setOpenAtLogin: (enabled) => invoke("set_open_at_login", { enabled }),
    toggleQCWindow: (enabled) => invoke("toggle_qc_window", { enabled }),
    openQCForm: () => invoke("open_qc_form"),
    closeQCForm: () => invoke("close_qc_form"),
    notifyRequirementsChanged: () => invoke("notify_requirements_changed"),
    testModelConnection: (baseUrl, apiKey, modelId) =>
      invoke("test_model_connection", { baseUrl, apiKey, modelId }),

    readClipboardImages: () => invoke("read_clipboard_images"),
    readClipboardText: () => invoke("read_clipboard_text"),
    readClipboardHTML: () => invoke("read_clipboard_html"),
    readClipboardFiles: () => invoke("read_clipboard_files"),
    readLocalFile: (filePath) => invoke("read_local_file", { filePath }),

    onRequirementsChanged: (cb) => {
      const unlisten = listen("requirements-changed", () => cb());
      window.__unlistenReqChanged = unlisten;
      return () => unlisten();
    },
  };

  console.log("[tauri-bridge] electronAPI initialized");
}
