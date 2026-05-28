/// <reference types="vite/client" />
/// <reference types="react" />

declare namespace React {}
declare namespace JSX {
  type Element = React.JSX.Element
  type ElementType = React.JSX.ElementType
  type IntrinsicElements = React.JSX.IntrinsicElements
  interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
  interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
  type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>
}

declare module "lucide-react" {
  export * from "lucide-react/dist/lucide-react.suffixed";
}

// Tauri v2 __TAURI_INTERNALS__
interface Window {
  __TAURI_INTERNALS__?: {
    core: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;
    };
    event: {
      listen: (event: string, handler: (e: { payload: any }) => void) => () => void;
    };
    window?: {
      label?: string;
    };
  };
}

// Electron-style API bridge (set up by tauri-bridge.ts)
interface ElectronAPI {
  __isQCPopup: boolean;
  platform: string;
  versions: Record<string, string>;
  getVersion: () => Promise<string>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  dbQuery: (method: string, table: string, args: any) => Promise<any>;
  dbUpload: (table: string, fileData: number[]) => Promise<any>;
  checkForUpdate: () => Promise<any>;
  downloadUpdate: () => Promise<any>;
  installUpdate: () => Promise<boolean>;
  onUpdateAvailable: (cb: (info: string) => void) => () => void;
  onUpdateProgress: (cb: (progress: number) => void) => () => void;
  onUpdateDownloaded: (cb: () => void) => () => void;
  getSettings: () => Promise<any>;
  setMinimizeToTray: (enabled: boolean) => Promise<boolean>;
  setOpenAtLogin: (enabled: boolean) => Promise<boolean>;
  toggleQCWindow: (enabled: boolean) => Promise<boolean>;
  openQCForm: () => Promise<boolean>;
  closeQCForm: () => Promise<boolean>;
  notifyRequirementsChanged: () => Promise<void>;
  testModelConnection: (baseUrl: string, apiKey: string, modelId: string) => Promise<boolean>;
  readClipboardImages: () => Promise<string[]>;
  readClipboardText: () => Promise<string>;
  readClipboardHTML: () => Promise<string>;
  readClipboardFiles: () => Promise<string[]>;
  readLocalFile: (filePath: string) => Promise<string | null>;
  onRequirementsChanged: (cb: () => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  __unlistenMaximize?: () => void;
  __unlistenReqChanged?: () => void;
  __unlistenUpdateAvailable?: () => void;
  __unlistenUpdateProgress?: () => void;
  __unlistenUpdateDownloaded?: () => void;
}
