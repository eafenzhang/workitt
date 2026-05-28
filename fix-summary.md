# Workit Fix Summary — P0 & P1 Issues Resolved

## Build Status
✅ `npm run build` passes successfully (vite build, 0 errors)

## P0 Fixes (Security + Critical Bugs)

### P0-01: SQL Injection — Dynamic Table Name
- **File**: `electron/main.cjs`
- **Fix**: Added `ALLOWED_TABLES` whitelist (`['requirements', 'documents', 'mcp_servers', 'models']`). The `default` branch in `handleDbQuery` now validates `resType` against this whitelist before using it in `SELECT * FROM ${resType}`.
- **Line**: ~378-379

### P0-02: SQL Injection — MCP/Models PUT Field Names
- **File**: `electron/main.cjs`
- **Fix**: Added `MCP_FIELDS` and `MODEL_FIELDS` whitelist Maps at module top. While the existing code already used explicit `if (field !== undefined)` checks with parameterized values (not truly injectable), the whitelists document allowed fields and could be used for stricter validation in the future.
- **Line**: ~14-30

### P0-03: API Key Stored in Plaintext
- **File**: `electron/main.cjs`
- **Fix**: Added `encryptApiKey()` and `decryptApiKey()` functions using Electron's `safeStorage` API. `handleModels` POST/PUT now encrypt before storage; `getDefaultModel` decrypts on read. Fallback: if `safeStorage` unavailable, stores plaintext; if decryption fails, assumes old plaintext data and returns as-is.
- **Line**: ~153-182, ~502 (POST), ~515 (PUT), ~194/197 (getDefaultModel)

### P0-04: IPC No Source Validation — QC Window
- **File**: `electron/main.cjs`
- **Fix**: In `ipcMain.handle('db-query')`, added QC window source check. If the sender is `qcWindow.webContents`, only `GET` on `requirements` is allowed; all other operations return `{ error: 'Access denied from QC window' }`. Moved `qcWindow` to module-level scope so `setupIPC()` can access it.
- **Line**: ~260-271

### P0-05: XSS — Unsanitized dangerouslySetInnerHTML
- **File**: `src/pages/Knowledge.tsx`
- **Fix**: Installed `dompurify` + `@types/dompurify`. All 4 `dangerouslySetInnerHTML` usages now use `DOMPurify.sanitize()`:
  - `previewHtml` (2 occurrences — tab mode detail + side panel)
  - `showDoc.content` (2 occurrences — tab mode detail + side panel)
- **Dependency**: `dompurify@^3.2.6`, `@types/dompurify@^3.2.0`

### P0-06: Remote Code Execution — executeJavaScript
- **File**: `electron/main.cjs`, `electron/preload.cjs`, `src/pages/Requirements.tsx`
- **Fix**: Replaced `mainWindow.webContents.executeJavaScript('window.dispatchEvent(...)')` with `mainWindow.webContents.send('requirements-changed')`. Added `onRequirementsChanged` in preload that listens for the IPC event and returns an unsubscribe function. Updated `Requirements.tsx` to use `api.onRequirementsChanged()` instead of `window.addEventListener('requirements-changed', ...)`.
- **Line**: main.cjs ~776-779, preload.cjs ~53-58, Requirements.tsx ~75-79

### P0-07: No Confirmation Dialog on Status Advance
- **File**: `src/pages/Requirements.tsx`
- **Fix**: Added `confirm()` check before the `apiFetch` PUT call in the status advance button's `onClick` handler. If user cancels, the operation is aborted.
- **Line**: ~337

### P0-08: Model Dropdown Uses Wrong Provider
- **File**: `src/pages/Model.tsx`
- **Fix**: Changed the model card dropdown to use `PROVIDER_LIST.find(p => p.id === m.provider)?.models` instead of `currentModels` (which was based on `form.provider`). Both the display label and the dropdown list items now correctly reflect the model's own provider.
- **Line**: ~191, ~196

## P1 Fixes (Should Fix)

### P1-01: Synchronous DB Save on Every Write
- **File**: `electron/main.cjs`
- **Fix**: Replaced `saveDb()` call in `run()` with `debouncedSaveDb()` (200ms debounce). Added atomic write: `saveDb()` now writes to a `.tmp` file first, then `fs.renameSync()` to the final path.
- **Line**: ~116-134, ~150

### P1-02: Null Crash — query()/run() Without DB Check
- **File**: `electron/main.cjs`
- **Fix**: Added `if (!db)` guard at the top of both `query()` and `run()`. `query()` returns `[]` if db is null; `run()` returns early.
- **Line**: ~137-151

### P1-03: Wrong Table Name in Models POST
- **File**: `electron/main.cjs`
- **Fix**: Changed `query('SELECT MAX(id) FROM documents')` to `query('SELECT MAX(id) FROM models')` in `handleModels` POST case.
- **Line**: ~505

### P1-04: Double Increment on Document Views
- **File**: `electron/main.cjs`
- **Fix**: Changed `formatDoc()` from `views: r[5]+1` to `views: r[5]`. The SQL `views = views + 1` already increments in the database, so the +1 in JavaScript was a double-count.
- **Line**: ~553

### P1-05: Event Listener Leak — onMaximizeChange
- **File**: `electron/preload.cjs`, `src/components/TitleBar.tsx`
- **Fix**: `onMaximizeChange` in preload now returns an unsubscribe function (`() => ipcRenderer.removeListener(...)`). `TitleBar.tsx` calls the unsubscribe function in the `useEffect` cleanup.
- **Line**: preload.cjs ~14-18, TitleBar.tsx ~17-21

### P1-06: Event Listener Leak — Update Events
- **File**: `electron/preload.cjs`, `src/pages/Settings.tsx`
- **Fix**: `onUpdateAvailable`, `onUpdateProgress`, `onUpdateDownloaded` in preload all return unsubscribe functions. `Settings.tsx` stores all unsubscribe functions and calls them in the `useEffect` cleanup.
- **Line**: preload.cjs ~28-42, Settings.tsx ~24-38

### P1-07: AI Call Has No Timeout
- **File**: `electron/main.cjs`
- **Fix**: Added `signal: AbortSignal.timeout(30000)` (30 seconds) to the `fetch()` call in `callAI()`.
- **Line**: ~229

### P1-08: Anthropic API Uses Wrong Auth Headers
- **File**: `electron/main.cjs`
- **Fix**: In both `callAI()` and `test-model-connection`, when `isAnthropic` is true, set `headers['x-api-key']` and `headers['anthropic-version'] = '2023-06-01'` instead of `Authorization: Bearer`. Non-Anthropic APIs continue using `Authorization: Bearer`.
- **Line**: ~212-218, ~745-750

### P1-09: IPC Method Not Whitelisted
- **File**: `electron/main.cjs`
- **Fix**: Added `ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE']` whitelist. `db-query` handler returns `{ error: 'Method not allowed' }` for any method not in the list.
- **Line**: ~12, ~262-263

### P1-10: Database Corruption Recovery
- **File**: `electron/main.cjs`
- **Fix**: Wrapped `initDatabase` in try-catch. If the DB file is corrupted (fails to parse), the corrupted file is backed up with a `.corrupt.{timestamp}` suffix, and a fresh empty database is created.
- **Line**: ~59-80

## Files Modified
1. `electron/main.cjs` — P0-01, P0-02, P0-03, P0-04, P0-06, P1-01, P1-02, P1-03, P1-04, P1-07, P1-08, P1-09, P1-10
2. `electron/preload.cjs` — P0-06, P1-05, P1-06
3. `src/pages/Knowledge.tsx` — P0-05
4. `src/pages/Requirements.tsx` — P0-06, P0-07
5. `src/pages/Model.tsx` — P0-08
6. `src/components/TitleBar.tsx` — P1-05
7. `src/pages/Settings.tsx` — P1-06
8. `package.json` — Added `dompurify` + `@types/dompurify` dependencies

## Design Decisions
- **P0-03 (API Key Encryption)**: Uses Electron's `safeStorage` with fallback to plaintext. On decryption failure (old data), falls back to returning the raw stored value. This ensures backward compatibility with existing databases.
- **P1-01 (Debounced Save)**: 200ms debounce window. Atomic write via tmp+rename to prevent partial writes on crash.
- **P1-04 (Views Fix)**: The SQL `UPDATE ... SET views = views + 1` already handles increment, so the JS-side +1 was removed from `formatDoc()`.
- **P0-04 (QC Window)**: `qcWindow` was moved from local scope inside `app.whenReady()` to module-level scope, so `setupIPC()` can access it for source validation.
