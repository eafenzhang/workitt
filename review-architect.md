# Workit 项目代码审查报告

**审查人**：架构师 高见远  
**审查日期**：2025-07  
**项目**：Workit 智能体工作台  
**技术栈**：Electron 42 + React 19 + TypeScript + Vite + sql.js（内存数据库）

---

## 审查摘要

| 严重程度 | 数量 |
|---------|------|
| P0（必须修复） | 6 |
| P1（应该修复） | 10 |
| P2（建议优化） | 9 |

---

## P0 — 必须修复（安全漏洞 / 数据丢失风险 / 崩溃问题）

### P0-01: SQL 注入漏洞 — 动态表名未参数化
**文件**：`electron/main.cjs` 行 269-272  
**描述**：`handleDbQuery` 的 default 分支从 URL 路径提取 `resType`，直接拼接进 SQL 语句：  
```js
const req = query(`SELECT * FROM ${resType} WHERE id = ?`, [parseInt(resId)])[0];
```
`resType` 来源于前端 `table` 参数，经 `split('?')[0]` 处理后直接拼入 SQL。攻击者可以通过 IPC 发送恶意 `table` 值（如 `requirements; DROP TABLE requirements--`）注入 SQL。  
**修复建议**：使用白名单校验 `resType`，只允许 `requirements`、`documents` 等已知表名：  
```js
const ALLOWED_TABLES = ['requirements', 'documents'];
if (!ALLOWED_TABLES.includes(resType)) return { error: 'Invalid table' };
```

### P0-02: SQL 注入漏洞 — MCP 更新动态字段拼接
**文件**：`electron/main.cjs` 行 410-418  
**描述**：`handleMcp` PUT 分支将字段名动态拼接进 SQL：  
```js
if (name !== undefined) { fields.push('name=?'); vals.push(name); }
...
run(`UPDATE mcp_servers SET ${fields.join(',')} WHERE id=?`, vals);
```
字段名本身来自硬编码，当前不存在注入风险，但同样的问题出现在 `handleModels` PUT（行 446-452）。如果未来有人在动态字段名中引入用户输入，将造成 SQL 注入。  
**修复建议**：对所有动态拼接的字段名使用白名单校验，或者使用 Map 映射来确保字段名来自安全来源。

### P0-03: API Key 明文存储在数据库中
**文件**：`electron/main.cjs` 行 64  
**描述**：模型 API Key 以明文存储在 SQLite 数据库文件 `workit-data.db` 中：  
```sql
api_key TEXT DEFAULT ''
```
数据库文件存储在用户目录，任何有文件系统访问权限的程序或用户都能读取 API Key。  
**修复建议**：使用 Electron 的 `safeStorage` API 对 API Key 进行加密后再存入数据库，读取时解密：  
```js
const { safeStorage } = require('electron');
// 存储: safeStorage.encryptString(apiKey)
// 读取: safeStorage.decryptString(encryptedBuffer)
```

### P0-04: IPC 无验证 — 渲染进程可执行任意数据库操作
**文件**：`electron/preload.cjs` 行 16, `electron/main.cjs` 行 165-174  
**描述**：`db-query` IPC handler 接受渲染进程传来的任意 `method` 和 `table` 参数，没有对来源（QC 窗口 vs 主窗口）或操作类型进行鉴权。QC 弹窗虽然使用了相同的 preload，但没有限制其只调用特定的 IPC 方法。恶意网页或 XSS 攻击可以通过 `db-query` 执行任意增删改查操作，包括删除所有数据。  
**修复建议**：
1. 在 preload 中为 QC 窗口暴露受限的 API 子集
2. 在 IPC handler 中校验调用来源窗口（`event.sender`）
3. 对危险操作（DELETE、DROP）增加确认机制

### P0-05: `dangerouslySetInnerHTML` 直接渲染用户内容 — XSS 风险
**文件**：`src/pages/Knowledge.tsx` 行 408, 422, 675, 689  
**描述**：文档内容通过 `dangerouslySetInnerHTML={{ __html: showDoc.content }}` 直接渲染。如果文档内容包含恶意 `<script>` 标签或事件处理器（如 `<img onerror="alert(1)">`），将导致 XSS 攻击。AI 生成的摘要或用户输入的需求描述未经过 HTML 净化就插入到页面中。  
**修复建议**：使用 DOMPurify 或 sanitize-html 对所有 `dangerouslySetInnerHTML` 的内容进行净化：  
```tsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(showDoc.content) }} />
```

### P0-06: `executeJavaScript` 从主进程注入渲染进程 — 远程代码执行
**文件**：`electron/main.cjs` 行 656-659  
**描述**：`notify-requirements-changed` IPC handler 使用 `executeJavaScript` 向渲染进程注入代码：  
```js
mainWindow.webContents.executeJavaScript(`
  window.dispatchEvent(new CustomEvent('requirements-changed'));
`);
```
虽然当前注入的代码是安全的，但 `executeJavaScript` 是最高危的 Electron API 之一。如果未来代码被修改、或参数被注入，可能导致在渲染进程上下文中执行任意代码。  
**修复建议**：改用 `webContents.send()` 从主进程向渲染进程发送事件：  
```js
mainWindow.webContents.send('requirements-changed');
```
然后在 preload 中监听并转发给渲染进程。

---

## P1 — 应该修复（错误处理缺失 / 内存泄漏 / 逻辑错误）

### P1-01: 每次写操作后同步保存整个数据库 — 性能和数据安全风险
**文件**：`electron/main.cjs` 行 94-97  
**描述**：`run()` 函数在每次 SQL 写操作后都调用 `saveDb()`，将整个内存数据库导出并写入磁盘。高频操作（如批量创建需求）会导致大量磁盘 I/O，且在写入过程中如果进程崩溃，数据库文件可能处于不完整状态。  
**修复建议**：
1. 使用防抖（debounce）机制，如 500ms 内合并多次保存
2. 使用原子写入（先写临时文件，再 rename）
3. 考虑 WAL 模式或定期保存策略

### P1-02: `query()` 函数在 `db` 为 null 时崩溃
**文件**：`electron/main.cjs` 行 85-92  
**描述**：`query()` 函数直接调用 `db.prepare(sql)` 但没有检查 `db` 是否为 null。如果 `initDatabase()` 失败（如 sql.js 加载错误），后续所有 IPC 调用都会抛出未捕获异常。  
**修复建议**：在 `query()` 和 `run()` 开头加入 null 检查：  
```js
function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  ...
}
```

### P1-03: `handleModels` POST 返回错误的 ID
**文件**：`electron/main.cjs` 行 440  
**描述**：创建新模型后，返回的 ID 来自错误的查询：  
```js
return { success: true, id: query('SELECT MAX(id) FROM documents')[0][0] };
```
应该查 `models` 表，而不是 `documents` 表。这导致新建模型后返回一个无关的文档 ID。  
**修复建议**：  
```js
return { success: true, id: query('SELECT MAX(id) FROM models')[0][0] };
```

### P1-04: `formatDoc` 中 views 计数偏移错误
**文件**：`electron/main.cjs` 行 474  
**描述**：`formatDoc` 函数硬编码 `views: r[5]+1`，但在 `handleDocuments` GET by id 时已经执行了 `UPDATE documents SET views = views + 1`，导致每次查看文档时 views 增加 2 而不是 1。  
**修复建议**：移除 `formatDoc` 中的 `+1`，只依赖数据库中的 UPDATE 操作：  
```js
views: r[5], // 不要 +1，数据库已经递增了
```

### P1-05: TitleBar `onMaximizeChange` 监听器未清理 — 内存泄漏
**文件**：`src/components/TitleBar.tsx` 行 17-21  
**描述**：`useEffect` 中调用 `api?.onMaximizeChange?.(cb)` 注册了 `ipcRenderer.on` 监听器，但在 cleanup 函数中没有移除。每次组件重新挂载都会添加新监听器，导致内存泄漏和重复回调。  
**修复建议**：在 preload 中返回取消函数，并在 useEffect cleanup 中调用：  
```js
// preload.cjs
onMaximizeChange: (cb) => {
  const handler = (_, v) => cb(v);
  ipcRenderer.on('window-maximized-change', handler);
  return () => ipcRenderer.removeListener('window-maximized-change', handler);
}
// TitleBar.tsx
useEffect(() => {
  const unsub = api?.onMaximizeChange?.(setMaximized);
  return () => unsub?.();
}, []);
```

### P1-06: Settings 页面更新事件监听器未清理 — 内存泄漏
**文件**：`src/pages/Settings.tsx` 行 30-32  
**描述**：`api?.onUpdateAvailable`、`onUpdateProgress`、`onUpdateDownloaded` 注册了 ipcRenderer 事件监听器，但 useEffect 的 cleanup 为空数组 `[]`，没有移除监听器。  
**修复建议**：同 P1-05，在 preload 中为每个事件监听返回取消函数，在 useEffect cleanup 中调用。

### P1-07: QuickCapture `mountedRef` 模式不可靠
**文件**：`src/components/QuickCapture.tsx` 行 21  
**描述**：使用 `mountedRef` 检查组件是否已卸载来避免 state 更新，这是反模式。React 官方推荐使用 AbortController 或 useEffect cleanup 函数。`mountedRef` 在并发模式下不可靠。  
**修复建议**：使用 AbortController 或在 Promise 回调中通过 cleanup 标志位控制。

### P1-08: AI 调用缺乏超时控制
**文件**：`electron/main.cjs` 行 127  
**描述**：`callAI` 函数使用 `fetch` 调用 AI API，但没有设置超时。如果 AI 服务无响应，IPC 调用将无限等待，前端也无法取消或重试。`testModelConnection` 使用了 `AbortSignal.timeout(10000)`，但 `callAI` 没有。  
**修复建议**：为 `callAI` 添加超时控制：  
```js
const res = await fetch(url, {
  ...opts,
  signal: AbortSignal.timeout(30000), // 30 秒超时
});
```

### P1-09: `callAI` Anthropic 格式缺少认证头
**文件**：`electron/main.cjs` 行 121-125, 129  
**描述**：当检测到 Anthropic API 时，URL 被改为 `/v1/messages`，但请求头只设置了 `Authorization: Bearer`，缺少 Anthropic API 必需的 `x-api-key` 头和 `anthropic-version` 头。这会导致 Anthropic API 调用始终失败。  
**修复建议**：根据 API 类型设置不同的认证头：  
```js
const headers = { 'Content-Type': 'application/json' };
if (isAnthropic) {
  headers['x-api-key'] = model.apiKey;
  headers['anthropic-version'] = '2023-06-01';
} else {
  headers['Authorization'] = 'Bearer ' + model.apiKey;
}
```

### P1-10: `db-query` IPC 不验证 `method` 参数
**文件**：`electron/main.cjs` 行 165  
**描述**：`db-query` 接受任意 `method` 参数（GET/POST/PUT/DELETE），没有校验。渲染进程可以发送任何 method 组合，如对 `dashboard/stats` 发送 DELETE。虽然当前代码不会匹配到 DELETE 分支，但这是一个设计缺陷。  
**修复建议**：在 `setupIPC` 中对 method 进行白名单校验，或为不同操作注册独立的 IPC channel。

---

## P2 — 建议优化（代码质量 / 可维护性 / 性能）

### P2-01: 数据库行使用数组索引访问 — 可读性和健壮性差
**文件**：`electron/main.cjs` 行 99-113, 321-346 等  
**描述**：所有数据库查询结果都通过数组索引（如 `rows[0][3]`）访问列值，而不是通过列名。这使得代码极难阅读和维护，且在表结构变更时非常容易出错。  
**修复建议**：使用 sql.js 的 `stmt.getAsObject()` 或在查询后构建对象映射：  
```js
function queryObjects(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
```

### P2-02: 大量重复代码 — Knowledge.tsx 的编辑器 UI 重复
**文件**：`src/pages/Knowledge.tsx` 行 450-475 vs 732-765  
**描述**：工具栏（粗体、斜体、标题、列表、引用、代码块、图片、链接、撤销/重做）在 tab 模式和 modal 模式中完全重复渲染，代码量约 80 行完全相同。  
**修复建议**：提取为 `EditorToolbar` 组件。

### P2-03: Knowledge.tsx 文档详情视图重复
**文件**：`src/pages/Knowledge.tsx` 行 367-432 vs 631-700  
**描述**：文档详情视图在 tab 模式和 side panel 模式中几乎完全重复，包括文件类型判断、预览逻辑、AI 总结按钮等。  
**修复建议**：提取为 `DocumentDetail` 共享组件。

### P2-04: `uploadImage` 在 Requirements.tsx 中使用 multipart 但通过 IPC 发送 ArrayBuffer
**文件**：`src/pages/Requirements.tsx` 行 181-189, `src/api.ts` 行 33-35  
**描述**：前端创建 FormData 并尝试通过 `apiFetch` 发送，但 `apiFetch` 将 body 作为字符串解析（`JSON.parse(opts.body)`），FormData 无法被 JSON 序列化。实际的图片上传通过 `uploadImage` 函数使用 `dbUpload` 传递 ArrayBuffer，但 `apiFetch` 路径不支持文件上传。  
**修复建议**：统一图片上传路径，在 `apiFetch` 中增加对 FormData 的特殊处理。

### P2-05: Dashboard 图表数据硬编码月份
**文件**：`electron/main.cjs` 行 218-228  
**描述**：`dashboard/charts` 返回的 `areaData` 硬编码了 1-7 月，且只有 5 月有数据，其他月份都是 0。这不是真实的时间序列数据。  
**修复建议**：根据 `created_at` 字段按月聚合真实数据。

### P2-06: `db-upload` 不验证文件类型和大小
**文件**：`electron/main.cjs` 行 176-187  
**描述**：`db-upload` 接受任意二进制数据，没有文件类型白名单和大小限制。恶意用户可以通过 IPC 上传超大文件或可执行文件。  
**修复建议**：
1. 添加文件大小限制（如 10MB）
2. 添加文件类型白名单
3. 使用安全的文件名生成策略（当前只有时间戳+随机数，可预测性较高）

### P2-07: `api.ts` 开发模式回退路径无服务器实现
**文件**：`src/api.ts` 行 14-26  
**描述**：当 `electronAPI` 不可用时，代码回退到 `fetch('/api/...')` 路径，但项目中没有实现对应的 HTTP 服务器。这意味着在浏览器中直接访问（非 Electron）时所有 API 调用都会失败，且错误信息不友好。  
**修复建议**：要么移除回退路径并给出明确错误提示，要么实现一个开发模式的 Express 服务器。

### P2-08: 前端缺少全局错误处理和加载状态
**文件**：`src/api.ts` 全文  
**描述**：`call()` 和 `apiFetch()` 函数没有统一的错误处理机制。每个调用点都需要自己 try-catch 或 `.catch()`。如果忘记处理，Promise 错误将被静默吞没。  
**修复建议**：添加全局错误拦截器，在 API 返回 `{ error: ... }` 时自动 toast 提示。

### P2-09: `AuthContext` 中用户信息持久化到 localStorage 缺乏安全性
**文件**：`src/context/AuthContext.tsx` 行 24-29  
**描述**：用户信息（包括 id、phone、role 等）以明文 JSON 存储在 localStorage 中，可以被任何同源脚本读取或篡改。  
**修复建议**：对敏感字段加密存储，或仅存储必要的非敏感标识，从后端验证用户身份。

---

## 架构层面建议

### 1. 缺乏数据库迁移机制
当前使用 `CREATE TABLE IF NOT EXISTS` 和硬编码的 `UPDATE` 语句进行迁移（如行 70）。缺乏版本化的迁移机制，未来表结构变更将难以管理。建议引入简单的迁移框架或版本号表。

### 2. 缺乏类型安全
`electron/main.cjs` 使用纯 CommonJS，没有 TypeScript 类型检查。`handleDbQuery` 的 `args` 参数是 `any`，`data` 也是 `any`。建议将主进程迁移到 TypeScript，至少添加 JSDoc 类型注解。

### 3. 缺乏日志分级
`log()` 函数不区分日志级别（debug/info/warn/error），所有日志都写入同一个文件。建议引入日志级别，并在生产环境减少 verbose 日志。

### 4. QC 窗口复用主窗口的 preload
QC 弹窗使用与主窗口完全相同的 preload 脚本，暴露了所有 IPC 方法（包括窗口控制、模型管理、自动更新等）。QC 窗口只需要 `db-query`（受限的创建需求）和 `close-qc-form` 等少量方法。建议为 QC 窗口使用独立的 preload 脚本，仅暴露必要 API。

---

*报告结束*
