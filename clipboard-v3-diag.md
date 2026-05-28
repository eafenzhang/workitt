# 剪贴板视频/表格粘贴诊断报告

> 日期：2026-05-27 | 版本：v3 | 项目：Workit 剪贴板粘贴 pipeline

---

## 1. 实际剪贴板内容（所有格式）

### 1.1 正常文本消息（企微 → Workit 粘贴）

| 格式 | 内容 |
|------|------|
| `text/plain` | ✅ 有内容，如 `"张聪聪(12) 5/27 22:54:48\n123\n..."` |
| `text/html` | ✅ 有内容，含 `<wxwork-data>` + 消息文本 + `<img src="file:///...png">` |
| `image/*` (dt.items) | ❌ 无 — 企微不通过标准 image 格式传递图片 |
| `video/*` (dt.items) | ❌ 无 — 企微不通过标准 video 格式传递视频 |

**关键 HTML 内容示例**（行 6360）：
```html
<html><body>
<!--StartFragment--><wxwork-data data-type="ChatMessage" data-version="3.1.20.11441"></wxwork-data>
张聪聪(12)&nbsp;5/27&nbsp;22:54:48<br>123<BR><BR>Mino&nbsp;5/27&nbsp;22:54:59<br>...
<img src="file:///C:/Users/121212/Documents/WXWork/.../企业微信截图_xxx.png" />
...
```

**注意**：HTML 中**有** `<img>` 标签，但**没有** `<video>` 或 `<table>` 标签。视频仅在 `text/plain` 中以 `[视频]` 标记表示。

### 1.2 含视频的消息

| 格式 | 内容 |
|------|------|
| `text/plain` | ✅ 含 `[视频]` 标记 |
| `text/html` | ⚠️ 含 `<wxwork-data>` + 文本 + `<img>`，但 **无 `<video>` 标签** |
| `blobs` | ❌ 0 |

### 1.3 含文件（如 .xlsx）的消息 — "无数据"场景

| 格式 | 内容 |
|------|------|
| `text/plain` | ❌ **浏览器 paste 获取为空** |
| `text/html` | ❌ **浏览器 paste 获取为空** |
| `blobs` | ❌ 0 |
| 后端 `clipboard.readText()` | ✅ `[文件：覆盖会员.xlsx]` |
| 后端 `clipboard.readHTML()` | ❌ `(empty)` |

**日志证据**（行 6380-6397）：
```
[qc-paste] text:  | html: (empty) | blobs: 0
[qc-paste] final items: 0          ← "无数据"
...
Clipboard: text=[文件：覆盖会员.xlsx] | html=(empty) | rtf=(empty)
```

> 🔴 **根因**：浏览器 paste 事件获取到 **零数据**（text 空，html 空，blobs 为 0）。
> 但 Electron 后端 `clipboard.readText()` **能**读到 `[文件：覆盖会员.xlsx]`。
> 说明企微使用了浏览器不可访问的自定义剪贴板格式。

---

## 2. 代码路径追踪（paste → parse → store 每步做了什么）

### 路径 A：浏览器 paste 事件（主路径）

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: paste 事件触发 (QuickCapture.tsx ~405)                       │
│   dt = e.clipboardData                                              │
│   text = dt.getData('text/plain')   → 可能为空（企微自定义格式）      │
│   html = dt.getData('text/html')    → 可能为空或含 <wxwork-data>     │
│   rawBlobs = dt.items 中的 image/*, video/* → 通常为 []              │
├─────────────────────────────────────────────────────────────────────┤
│ Step 1b: HTML 回退 (line ~416)                                      │
│   if (!html) html = await api.readClipboardHTML()                   │
│   → 后端调用 clipboard.readHTML()                                   │
│   → 对于企微自定义格式，同样返回空                                    │
├─────────────────────────────────────────────────────────────────────┤
│ Step 2: parseHtmlToItems(html, text, api) — 仅在 html 非空时调用     │
│                                                                      │
│   ┌─ Step 2a: 正则提取 media URLs                                   │
│   │   从 HTML 中提取 <img src>, <video src>, <source src>,          │
│   │   <a href="file://..."> 的 URL                                  │
│   │   → 视频场景：提取不到视频 URL（HTML 中无 <video> 标签）         │
│   │                                                                  │
│   ├─ Step 2b: 解析 media URLs → CaptureItem                         │
│   │   file:// URL → api.readLocalFile(fp) → data URL / file item    │
│   │   图片文件成功解析 ✅                                            │
│   │   视频文件：如果 URL 存在也能解析 ✅                              │
│   │                                                                  │
│   ├─ Step 2c: 分流决策                                              │
│   │   hasTableOrVideo = /<table\b|<video\b/i.test(html)             │
│   │                                                                  │
│   │   IF plainText && !hasTableOrVideo:                             │
│   │     → 文本行解析：处理 [图片]/[视频]/[文件:xxx] 标记             │
│   │     → 视频场景走这里（因为 HTML 中无 <video>）                   │
│   │     → 创建 type:'video' content:'' 的空项 ⚠️                    │
│   │                                                                  │
│   │   ELSE (无 plainText 或有 table/video):                         │
│   │     → DOM walk：递归遍历 HTML 节点                              │
│   │     → <table> → 提取 rows/headers                               │
│   │     → <video> → 提取 src                                        │
│   │     → <img> → 提取 src                                          │
│   │                                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Step 3: 文本回退 (line ~451)                                         │
│   IF items.length === 0 && text:                                     │
│     → resolveTextFileItems(text, api) 或 {type:'text', content:text}│
├─────────────────────────────────────────────────────────────────────┤
│ Step 4: 空视频回退 (line ~462)                                       │
│   emptyVideos = items.filter(i => i.type==='video' && !i.content)   │
│   → api.readClipboardFiles() → CF_HDROP / FileNameW                 │
│   → 对企微视频：CF_HDROP 中无视频路径 → 视频保持为空 ⚠️              │
├─────────────────────────────────────────────────────────────────────┤
│ Step 5: 追加 rawBlobs (line ~485)                                   │
│   将 dt.items 中的 image/video blob 转 data URL 追加                │
│   → 企微场景：rawBlobs 为空，无效果                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Step 6: 空检查 → 返回 "无数据" (line ~491)                           │
│   if (newItems.length === 0) return;                                 │
│   → 用户看到的 "无数据"                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 路径 B：悬浮按钮点击（备用路径）

```
┌─────────────────────────────────────────────────────────────────────┐
│ handleFloatClick (QuickCapture.tsx ~505)                             │
│   1. api.readClipboardImages() → Electron clipboard.readImage()     │
│   2. api.readClipboardFiles() → Electron CF_HDROP / FileNameW       │
│   3. api.readClipboardText() → Electron clipboard.readText()        │
│   4. api.readClipboardHTML() → Electron clipboard.readHTML()        │
│   5. 回退：navigator.clipboard.read() → 浏览器 clipboard API         │
│                                                                      │
│   注意：路径 B 的后端能读到 text（因为使用 Electron API），           │
│   但 HTML 同样为空。视频/表格数据依然无法获取。                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 断裂点（哪一步丢失了数据）

### 🔴 断裂点 1：浏览器 paste 事件收不到数据

**场景**：企微消息含视频或文件（如 .xlsx）时

| 层 | 能否读取 | 说明 |
|----|---------|------|
| 浏览器 `ClipboardEvent.getData('text/plain')` | ❌ 空 | 企微使用自定义剪贴板格式，Chromium 不识别 |
| 浏览器 `ClipboardEvent.getData('text/html')` | ❌ 空 | 同上 |
| Electron `clipboard.readText()` | ✅ 有 | 可读到 `[文件：覆盖会员.xlsx]` |
| Electron `clipboard.readHTML()` | ❌ 空 | 标准 HTML 格式中无内容 |

**根本原因**：企微企业版对含附件/视频的消息使用了 Windows 自定义剪贴板格式（通过 `RegisterClipboardFormat` 注册），而不是标准的 `CF_TEXT` / `CF_HTML` 格式。Chromium/Electron 的浏览器 paste 管道无法访问这些自定义格式。Electron 的 `clipboard.readText()` 能读到是因为它走的是 `CF_UNICODETEXT` 回退路径。

### 🟠 断裂点 2：视频在 HTML 中无 `<video>` 标签

**场景**：paste 能获取到 HTML 时（含文本+图片+视频的消息）

- HTML 中只有 `<img>` 标签表示图片
- 视频在 HTML 中**完全没有对应元素**（无 `<video>` 标签，无 `<source>` 标签）
- 视频仅在 `text/plain` 中以 `[视频]` 文本标记表示
- 因为 `hasTableOrVideo` 检查 HTML 中的 `<video` 标签 → false
- 走文本行解析：`[视频]` → 创建 `{ type: 'video', content: '' }` — **空内容**

### 🟠 断裂点 3：空视频回退找不到文件路径

**场景**：Step 4 尝试修复空视频

- `api.readClipboardFiles()` → 读 `FileNameW` (CF_HDROP)
- 企微**不**将视频文件路径放入 CF_HDROP
- `readClipboardFiles` 返回 `[]`
- 视频保持 `content: ''` → 用户看到空视频

### 🟡 断裂点 4：readClipboardHTML 回退也无数据

**场景**：paste handler line 416-418

```typescript
if (!html && api?.readClipboardHTML) {
  try { html = await api.readClipboardHTML() || ''; } catch {}
}
```

- 后端 `read-clipboard-html` handler (main.cjs:1087-1089) 调用 `clipboard.readHTML()`
- `clipboard.readHTML()` 读取的是标准 `CF_HTML` 格式
- 企微使用自定义格式 → `clipboard.readHTML()` 返回空
- 回退无效

---

## 4. 修复建议

### 建议 1（推荐）：paste handler 中增加 `readClipboardText` IPC 回退

**问题**：当浏览器 paste 事件获取 text/html 均为空时，不检查 Electron 的 `clipboard.readText()`。

**修复**：在 paste handler 的 `readClipboardHTML` 回退旁，增加 `readClipboardText` 回退：

```typescript
// 在 line 418 之后增加：
if (!text && api?.readClipboardText) {
  try { text = await api.readClipboardText() || ''; } catch {}
}
```

**效果**：至少能读到 `[文件：覆盖会员.xlsx]` 这样的标记，避免完全"无数据"。

### 建议 2（推荐）：后端增加企微自定义格式探测

**问题**：`read-clipboard-html` handler 只读标准 `CF_HTML`，读不到企微的自定义格式。

**修复**：在 `main.cjs` 的 `read-clipboard-html` handler 中增加：

```javascript
ipcMain.handle('read-clipboard-html', () => {
  try {
    let html = clipboard.readHTML() || '';
    
    // 尝试读取企微自定义 HTML 格式
    // 企微可能使用 "WeChat Work HTML Format" 或类似名称
    if (!html && process.platform === 'win32') {
      try {
        // 尝试读取 "HTML Format" 的原始 buffer
        const buf = clipboard.readBuffer('HTML Format');
        if (buf && buf.length > 0) {
          html = buf.toString('utf-8');
        }
      } catch {}
    }
    
    return html || '';
  } catch { return ''; }
});
```

### 建议 3（激进）：使用 Windows 原生 API 枚举所有剪贴板格式

在 `read-clipboard-files` handler 或新的诊断 handler 中，使用 `win32` 原生模块枚举剪贴板上的所有格式名称：

```javascript
// 需要 win32 API 或 node-ffi
const formats = [];
if (process.platform === 'win32') {
  // EnumClipboardFormats 遍历所有格式
  // 记录格式名（通过 GetClipboardFormatName）
}
```

这样可以发现企微使用的具体自定义格式名称，后续可以针对性地读取。

### 建议 4：视频处理——在文本解析时标记待解析 URL

**问题**：`[视频]` 标记无法匹配到 HTML 中不存在的视频 URL。

**修复**：当检测到 `[视频]` 标记时：
- 在 paste handler 中调用 `api.readClipboardFiles()` 查找视频扩展名文件
- 或使用 Windows Shell API 查询剪贴板中是否有视频文件的拖放数据

### 建议 5：表格处理——确保 `<table>` 标签被正确识别

当前逻辑：`hasTableOrVideo = /<table\b|<video\b/i.test(cleanedHtml)`

如果企微在某些场景下使用 `<div>` 模拟表格（而非 `<table>` 标签），则无法被识别。需要确认企微实际输出的表格 HTML 结构。

---

## 5. 后续验证步骤

1. **重建并测试**：用户复制含视频的企微消息 → 粘贴到 Workit
2. **检查新日志**：`[qc-diag] dt.types:` 会显示浏览器实际拿到哪些 MIME 类型
3. **检查后端**：`[qc-diag] readClipboardFiles result:` 显示 CF_HDROP 内容
4. **确认修复方向**：根据 dt.types 和 readClipboardFiles 结果，决定走建议 1-5 中的哪个方案

---

## 附录：代码索引

| 文件 | 行号 | 功能 |
|------|------|------|
| `src/components/QuickCapture.tsx` | 405-500 | paste handler 主逻辑 |
| `src/components/QuickCapture.tsx` | 411-424 | 🆕 诊断日志（本次新增） |
| `src/components/QuickCapture.tsx` | 225-401 | `parseHtmlToItems` 解析器 |
| `src/components/QuickCapture.tsx` | 273-274 | `hasTableOrVideo` 分流决策 |
| `src/components/QuickCapture.tsx` | 462-483 | 空视频 CF_HDROP 回退 |
| `src/components/QuickCapture.tsx` | 505-650 | `handleFloatClick` 悬浮按钮路径 |
| `electron/main.cjs` | 1050-1081 | `read-clipboard-files` handler |
| `electron/main.cjs` | 1087-1089 | `read-clipboard-html` handler |
| `electron/preload.cjs` | 54-58 | API bridge 定义 |
