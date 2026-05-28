import { invoke } from "@tauri-apps/api/core";

const platform = navigator.platform;
const isQC = window.__TAURI_INTERNALS__?.window?.label?.includes('qc') ?? false;

(window as any).electronAPI = {
  __isQCPopup: isQC,
  platform,
  versions: { node: '24', chrome: '120', electron: '32' },

  getVersion: () => invoke("get_version"),

  minimize: () => invoke("window_minimize"),
  maximize: () => invoke("window_maximize"),
  close: () => invoke("window_close"),
  isMaximized: () => invoke("window_is_maximized"),
  onMaximizeChange: (cb: (v: boolean) => void) => {
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen<boolean>("window-maximized-change", (e) => cb(e.payload))
    );
    return () => { unlisten.then((fn) => fn()); };
  },

  dbQuery: (method: string, table: string, args: any) =>
    invoke("db_query", { method, table, args }),

  dbUpload: (table: string, fileData: number[]) =>
    invoke("db_upload", { table, fileData }),

  checkForUpdate: () => invoke("check_for_update"),
  downloadUpdate: () => invoke("download_update"),
  installUpdate: () => invoke("install_update"),
  onUpdateAvailable: (cb: (v: string) => void) => {
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("update-available", (e) => cb(e.payload))
    );
    return () => { unlisten.then((fn) => fn()); };
  },
  onUpdateProgress: (cb: (p: number) => void) => {
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen<number>("update-download-progress", (e) => cb(e.payload))
    );
    return () => { unlisten.then((fn) => fn()); };
  },
  onUpdateDownloaded: (cb: () => void) => {
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen("update-downloaded", () => cb())
    );
    return () => { unlisten.then((fn) => fn()); };
  },

  getSettings: () => invoke("get_settings"),
  setMinimizeToTray: (enabled: boolean) => invoke("set_minimize_to_tray", { enabled }),
  setOpenAtLogin: (enabled: boolean) => invoke("set_open_at_login", { enabled }),
  toggleQCWindow: (enabled: boolean) => invoke("toggle_qc_window", { enabled }),
  openQCForm: () => invoke("open_qc_form"),
  closeQCForm: () => invoke("close_qc_form"),
  notifyRequirementsChanged: () => invoke("notify_requirements_changed"),
  testModelConnection: (baseUrl: string, apiKey: string, modelId: string) =>
    invoke("test_model_connection", { baseUrl, apiKey, modelId }),

  readClipboardImages: () => invoke("read_clipboard_images"),
  readClipboardText: () => invoke("read_clipboard_text"),
  readClipboardHTML: () => invoke("read_clipboard_html"),
  readClipboardFiles: () => invoke("read_clipboard_files"),
  readLocalFile: (filePath: string) => invoke("read_local_file", { filePath }),

  onRequirementsChanged: (cb: () => void) => {
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen("requirements-changed", () => cb())
    );
    return () => { unlisten.then((fn) => fn()); };
  },
};