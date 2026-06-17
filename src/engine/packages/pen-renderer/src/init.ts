import type { CanvasKit } from 'canvaskit-wasm';

let ckInstance: CanvasKit | null = null;
let ckPromise: Promise<CanvasKit> | null = null;

export interface LoadCanvasKitOptions {
  locateFile?: string | ((file: string) => string);
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Resolve the canvaskit-wasm bin directory.
 *
 * The canvaskit.wasm file is copied to public/canvaskit/ at build time.
 * Returns a relative path WITHOUT leading slash so it works in both:
 *   - Vite dev server  (relative to http://localhost:5173/)
 *   - Electron prod    (relative to file://.../dist/index.html)
 */
function resolveDefaultPath(): string {
  const win = typeof window !== 'undefined' ? (window as any) : null;
  if (win?.electronAPI?.getCanvasKitWasmDir) {
    return win.electronAPI.getCanvasKitWasmDir();
  }
  return 'canvaskit/';
}

/** IPC-aware logger that also reaches the main process (for packaged-app debugging). */
function makeLogger() {
  const win = typeof window !== 'undefined' ? (window as any) : null;
  return (level: 'log' | 'warn' | 'error', ...args: any[]) => {
    const c = console[level] || console.log;
    c('[CanvasKit]', ...args);
    try { win?.electronAPI?.logToMain?.(level, '[CanvasKit]', ...args); } catch {}
  };
}

/**
 * Extract CanvasKitInit from Vite's CJS→ESM interop wrapper.
 *
 * canvaskit-wasm has `module.exports = CanvasKitInit` (a function).
 * Vite may bundle this as:
 *   - `{ default: CanvasKitInit }`        (standard CJS interop)
 *   - `{ c: { default: CanvasKitInit } }` (named chunk export wrapping CJS)
 *   - direct function (rare, but handled)
 */
function extractInit(mod: any): (opts?: { locateFile?: (file: string) => string }) => Promise<CanvasKit> {
  // Direct function
  if (typeof mod === 'function') return mod;
  // Standard default export
  if (typeof mod?.default === 'function') return mod.default;
  // Search named exports for a function or { default: fn }
  const keys = Object.keys(mod || {});
  for (const key of keys) {
    const v = mod[key];
    if (typeof v === 'function') return v;
    if (v && typeof v === 'object' && typeof v.default === 'function') return v.default;
  }
  throw new Error(`Cannot find CanvasKitInit in module. typeof mod=${typeof mod}, keys=[${keys.join(',')}]`);
}

/**
 * Load CanvasKit WASM singleton. Returns the same instance on subsequent calls.
 */
export async function loadCanvasKit(
  locateFileOrOptions?: string | ((file: string) => string) | LoadCanvasKitOptions,
): Promise<CanvasKit> {
  if (ckInstance) return ckInstance;
  if (ckPromise) return ckPromise;

  const log = makeLogger();

  let resolver: (file: string) => string;
  let onProgress: ((loaded: number, total: number) => void) | undefined;

  if (
    typeof locateFileOrOptions === 'object' &&
    locateFileOrOptions !== null &&
    !('call' in locateFileOrOptions)
  ) {
    const opts = locateFileOrOptions as LoadCanvasKitOptions;
    resolver =
      typeof opts.locateFile === 'function'
        ? opts.locateFile
        : (file: string) => `${opts.locateFile ?? resolveDefaultPath()}${file}`;
    onProgress = opts.onProgress;
  } else {
    const locateFile = locateFileOrOptions as string | ((file: string) => string) | undefined;
    resolver =
      typeof locateFile === 'function'
        ? locateFile
        : (file: string) => `${locateFile ?? resolveDefaultPath()}${file}`;
  }

  ckPromise = (async () => {
    const wasmUrl = resolver('canvaskit.wasm');
    log('log', 'Loading WASM from:', wasmUrl);
    log('log', 'Page:', typeof window !== 'undefined' ? window.location.href : 'N/A');

    // Test WASM fetch before CanvasKitInit
    try {
      const r = await fetch(wasmUrl);
      const ab = await r.clone().arrayBuffer();
      log('log', `WASM fetch test OK → status=${r.status}, size=${ab.byteLength}`);
    } catch (e: any) {
      log('error', `WASM fetch test FAILED: ${e.message || e} (name=${e.name})`);
    }

    // Dynamic import of the CJS module
    let mod: any;
    try {
      mod = await import('canvaskit-wasm');
      log('log', `JS module loaded, typeof=${typeof mod}, keys=[${Object.keys(mod || {}).join(',')}]`);
    } catch (e: any) {
      log('error', `JS module import FAILED: ${e.message || e}`);
      throw e;
    }

    const CanvasKitInit = extractInit(mod);
    log('log', `CanvasKitInit resolved, type=${typeof CanvasKitInit}`);

    try {
      const ck = await CanvasKitInit({ locateFile: resolver });
      ckInstance = ck;
      log('log', 'Init SUCCESS');
      onProgress?.(1, 1);
      return ck;
    } catch (e: any) {
      log('error', `Init FAILED: ${e.message || e}`);
      throw e;
    }
  })();

  return ckPromise;
}

/**
 * Get the already-loaded CanvasKit instance. Returns null if not yet loaded.
 */
export function getCanvasKit(): CanvasKit | null {
  return ckInstance;
}
