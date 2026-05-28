# Workit 剪贴板视频/表格数据流架构验证

> 架构师：高见远 (Bob)  
> 日期：2025-07-17  
> 项目：workit clipboard v3 — 视频/表格全链路验证

---

## 1. 全链路数据流总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PASTE EVENT (浏览器 ClipboardEvent)               │
│  dt.getData('text/plain')  |  dt.getData('text/html')  |  dt.items (blobs)│
│  api.readClipboardHTML()   (IPC fallback)                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     parseHtmlToItems(html, plainText, api)               │
│  ① clean HTML (nbsp, <br>)                                              │
│  ② extract media URLs (imgRx, videoRx, linkRx)                          │
│  ③ resolveFileItem → resolvedMedia[]  ←── 仅 text-based 路径使用！       │
│  ④ hasTableOrVideo = /<table\b|<video\b/i.test(cleanedHtml)            │
│     ├─ false + plainText → text-based: [图片]/[视频] 标记替换           │
│     └─ true  or !plainText → HTML-only walk()                           │
│          ├─ <img> → { type:'image', content:src }   ⚠ 未解析            │
│          ├─ <video> → { type:'video', content:src }  ⚠ 未解析 file://   │
│          └─ <table> → { type:'table', rows, headers }                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         视频回退 (emptyVideos fallback)                  │
│  filter: type==='video' && !content  ← ⚠ walk() 的 video 有 src 不为空  │
│  api.readClipboardFiles() → videoPaths[]                               │
│  map → resolveFileItem(videoPaths[idx]) → Promise.all                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     raw blobs (dt.items image/video)                     │
│  blobToDataUrl → { type, content: dataURL }                             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        setCaptured → CaptureItem[]                       │
│  展示用：item.type='text'/'image'/'video'/'file'  ⚠ 无 'table' 渲染     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      handleSubmit → captureItemsToBlocks                 │
│  CaptureItem[] → ContentBlock[]  (JSON.stringify → content_blocks)     │
│  POST /api/requirements { content_blocks: string }                      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   handleRequirements POST (main.cjs:578)                 │
│  INSERT INTO requirements (..., content_blocks) VALUES (..., ?)         │
│  content_blocks = TEXT column at index 19 (ALTER TABLE ADD COLUMN)      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      formatReq (main.cjs:720)                            │
│  contentBlocks: JSON.parse(r[19] || '[]')  ← 索引 19 正确                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               Requirements.tsx 详情页 (line 464)                        │
│  rawContentBlocks = detailReq.contentBlocks                            │
│  if (length > 0) → blocks = rawContentBlocks                           │
│  else → rebuildBlocksFromLegacy(desc, images)  (向后兼容)               │
│  <ContentBlockRenderer blocks={blocks} />                               │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              ContentBlockRenderer.tsx switch(block.type)                 │
│  case 'text'   → TextBlock    ✅                                        │
│  case 'image'  → ImageBlock   ✅                                        │
│  case 'video'  → VideoBlock   ✅  (带 dataURL 检测 + 错误回退)           │
│  case 'file'   → FileBlock    ✅                                        │
│  case 'table'  → TableBlock   ✅  (正确使用 rows/headers)               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 逐节点验证

### 节点 1：Paste Event 数据提取 (QuickCapture.tsx:404-443)
**状态：✅ 正确**
- text/plain、text/html、dt.items 三条路径完整
- IPC readClipboardHTML fallback 存在
- Raw blobs (image/video MIME) 从 dt.items 提取

### 节点 2：parseHtmlToItems — hasTableOrVideo 检测 (QuickCapture.tsx:273)
**位置**：第 273 行，在 `resolvedMedia` 构建之后、`if (plainText)` 分支之前  
**状态：✅ 位置正确**

```
const hasTableOrVideo = /<table\b|<video\b/i.test(cleanedHtml);
if (plainText && !hasTableOrVideo) {
  // text-based path: 使用 plainText + resolvedMedia
} else {
  // HTML-only walk(): 直接遍历 DOM
}
```

**逻辑分析**：
- 当 HTML 包含 `<table>` 或 `<video>` 时，跳过 text-based 路径（plainText 会将表格压平、视频丢失）
- 走 HTML-only walk() 路径，由 walk() 处理所有元素
- **隐患**：这个 `hasTableOrVideo` 标志的含义是"跳过 text 路径"，不是"跳过整个解析"。但如果 text 路径被跳过，resolvedMedia（步骤③中成功解析的媒体）也被丢弃了。

### 节点 3：walk() — `<table>` 和 `<video>` 分支 (QuickCapture.tsx:342-384)
**状态：⚠️ 部分正确，存在数据丢失风险**

| 标签 | 行号 | 处理方式 | 问题 |
|------|------|---------|------|
| `<img>` | 350-354 | `{ type:'image', content:src }` | ⚠ src 可能是 `file://` 路径，未解析为 dataURL |
| `<video>` | 355-359 | `{ type:'video', content:src }` | 🔴 **严重**：src 可能是 `file:///C:/...`，未通过 resolveFileItem 解析 |
| `<table>` | 360-374 | `{ type:'table', content:'', rows, headers }` | ⚠ headers 提取逻辑脆弱（见下文） |

**`<video>` 分支的严重问题**：
1. walk() 中的 `<video>` 只取 `src` 属性值，不调用 `resolveFileItem`
2. 如果 HTML 中 `<video src="file:///C:/video.mp4">`，content 被设为 `"file:///C:/video.mp4"`
3. 后续 emptyVideos 回退检查 `!i.content` → 这里 content 不为空（是文件路径）→ **回退不触发**
4. 结果：视频 item 以文件路径字符串存储，无法在 VideoBlock 中播放

### 节点 4：视频回退逻辑 (QuickCapture.tsx:461-483)
**状态：⚠️ 逻辑正确但无法覆盖 walk() 产出的视频**

```javascript
const emptyVideos = newItems.filter(i => i.type === 'video' && !i.content);
```

这个回退只捕获 `content === ''` 的视频（text-based 路径中 `[视频]` 标记无对应媒体时产生）。walk() 产出的视频 content 是原始 src 字符串，不为空，**绕过此回退**。

**正确流程应该是**：
1. 检测 video.content 是否是 file:// 路径或文件路径 → 也应触发 resolveFileItem
2. 或者 walk() 中主动调用 resolveFileItem（需要改为 async walk）

### 节点 5：raw blobs 合并 (QuickCapture.tsx:485-488)
**状态：✅ 正确**
- Blob → dataURL 转换正确
- 追加到 newItems 末尾

### 节点 6：QuickCapture 预览 UI (QuickCapture.tsx:830-878)
**状态：🔴 缺少 table 渲染**

```javascript
{captured.items.map((item, i) => {
  if (item.type === 'text') { ... }
  if (item.type === 'image') { ... }
  if (item.type === 'video') { ... }
  if (item.type === 'file') { ... }
  return null;  // ← table 类型落到这里，不可见
})}
```

**影响**：用户在提交前看不到表格内容，无法确认表格是否正确解析。

### 节点 7：handleSubmit → captureItemsToBlocks (QuickCapture.tsx:689-757)
**状态：✅ 正确**

```javascript
const contentBlocks = captureItemsToBlocks(finalItems);
const contentBlocksStr = JSON.stringify(contentBlocks);
// POST: { content_blocks: contentBlocksStr }
```

`captureItemsToBlocks` (contentBlocks.ts:14-23) 正确映射所有类型：
```javascript
{
  type: item.type,    // 'table' 直接映射
  rows: item.rows,    // 二维数组传递
  headers: item.headers, // 表头传递
}
```

### 节点 8：handleRequirements POST (main.cjs:578-587)
**状态：✅ 正确**

```javascript
const contentBlocksStr = typeof content_blocks === 'string'
  ? content_blocks
  : JSON.stringify(content_blocks || []);
run(`INSERT INTO requirements (..., content_blocks) VALUES (..., ?)`, [... , contentBlocksStr]);
```

### 节点 9：formatReq — contentBlocks 列索引 (main.cjs:720-733)
**状态：✅ 正确**

```javascript
// NOTE: ALTER TABLE ADD COLUMN appends to end. content_blocks is at index 19
contentBlocks: (() => { try { return JSON.parse(r[19] || '[]'); } catch { return []; } })(),
```

- Index 19 正确（ALTER TABLE ADD COLUMN 追加到末尾）
- 带 try/catch 容错
- 注释清晰记录了为什么是 19 而不是 15

### 节点 10：Requirements 详情页 (Requirements.tsx:463-475)
**状态：✅ 正确**

```javascript
const rawContentBlocks = detailReq.contentBlocks;
let blocks: ContentBlock[];
if (rawContentBlocks && rawContentBlocks.length > 0) {
  blocks = rawContentBlocks;
} else {
  blocks = rebuildBlocksFromLegacy(detailReq.desc || '', detailReq.images || []);
}
<ContentBlockRenderer blocks={blocks} />
```

- contentBlocks 优先，desc/images 作为向后兼容回退
- 直接传给 ContentBlockRenderer

### 节点 11：ContentBlockRenderer (ContentBlockRenderer.tsx:447-476)
**状态：✅ 正确**

switch 分支完整覆盖所有类型：
```javascript
case 'text'  → <TextBlock>    ✅
case 'image' → <ImageBlock>   ✅ (支持 lightbox)
case 'video' → <VideoBlock>   ✅ (dataURL 检测 + onError fallback)
case 'file'  → <FileBlock>    ✅ (PDF 预览、Google Docs Viewer、下载)
case 'table' → <TableBlock>   ✅ (rows + headers + 斑马纹)
```

### 节点 12：read-clipboard-files IPC Handler (main.cjs:1050-1081)
**状态：✅ 正确**

```javascript
// Windows: readBuffer('FileNameW') → UTF-16LE → split by null
if (process.platform === 'win32') {
  const buf = clipboard.readBuffer('FileNameW');
  if (buf && buf.length > 0) {
    const text = buf.toString('utf16le').replace(/\0/g, '\n');
    const paths = text.split('\n').map(s => s.trim()).filter(Boolean);
    if (paths.length > 0) return paths;
  }
}
// Fallback: text-based path detection
```

三层回退：readFinderFiles (macOS) → readBuffer('FileNameW') (Windows) → text parse

---

## 3. 🔴 断裂点汇总

### 🔴 BREAK 1 (CRITICAL)：walk() 视频 src 未解析
**位置**：QuickCapture.tsx:355-359  
**影响**：粘贴含 `<video>` 的 HTML 时，视频以文件路径存储而非 dataURL  
**原因**：
1. `hasTableOrVideo` = true → 跳过 text-based 路径
2. walk() 中 `<video>` 分支直接使用原始 src
3. `resolvedMedia`（步骤③解析好的媒体）被丢弃
4. 视频回退检查 `!i.content`，但原始 src 不为空

**症状**：详情页显示"视频（无数据）"或"视频加载失败"

### 🔴 BREAK 2 (CRITICAL)：resolvedMedia 在 HTML-only 路径中丢失
**位置**：QuickCapture.tsx:253-332  
**影响**：当 hasTableOrVideo=true 时，步骤③中已成功解析为 dataURL 的媒体被完全忽略  
**原因**：resolvedMedia 数组只在 text-based 路径（line 274-332）中使用，walk() 路径完全不引用

**症状**：
- 即使 resolveFileItem 成功读取了视频文件，walk() 产出的仍是原始路径
- 表格+图片的 HTML 中，图片可能也丢失

### 🟡 BREAK 3 (MEDIUM)：QuickCapture UI 无 table 渲染
**位置**：QuickCapture.tsx:830-878  
**影响**：用户在提交前看不到表格内容  
**症状**：粘贴表格后预览区不显示表格行

### 🟡 BREAK 4 (LOW)：Table header 提取逻辑脆弱
**位置**：QuickCapture.tsx:360-375  
**问题**：
1. headers 仅从 `<tr>` 的第一个子行收集，且只在 `headers.length === 0` 时
2. 如果表头在 `<thead>` 中，但 walk() 不区分 thead/tbody
3. headers 长度可能与 rows[0] 不匹配（混合 TH/TD 行）

### 🟢 BREAK 5 (MINOR)：Promise.all 类型安全性
**位置**：QuickCapture.tsx:474-480  
**问题**：`map` 返回值是 `Promise<CaptureItem | null>[]`，无 null 过滤  
**影响**：实际因 `r || item` 回退，无运行时问题，仅类型不精确

---

## 4. 推荐修复方案

### 修复 1：walk() 改为 async，在 `<video>` 和 `<img>` 分支调用 resolveFileItem

```typescript
// walk() 改为 async 函数
const walk = async (node: Node) => {
  // ...
  if (tag === 'img') {
    const src = el.getAttribute('src');
    if (src) {
      const resolved = await resolveFileItem(src, api);
      items.push(resolved || { type: 'image', content: src });
    }
    return;
  }
  if (tag === 'video') {
    const src = el.getAttribute('src') || el.querySelector('source')?.getAttribute('src');
    if (src) {
      const resolved = await resolveFileItem(src, api);
      items.push(resolved || { type: 'video', content: src });
    }
    return;
  }
  // ...
  for (const child of Array.from(el.childNodes)) await walk(child);
};

// 调用处
for (const child of Array.from(body.childNodes)) await walk(child);
```

### 修复 2：walk() 生成的 video 也应触发 emptyVideos 回退

在 emptyVideos filter 中增加检测非 dataURL 的情况：
```typescript
const emptyVideos = newItems.filter(i =>
  i.type === 'video' && (!i.content || !i.content.startsWith('data:'))
);
```

### 修复 3：QuickCapture UI 添加 table 渲染

在 item map 中增加 table 分支：
```tsx
if (item.type === 'table') {
  return (
    <div key={i} className="overflow-x-auto rounded" style={{ border: '1px solid var(--wiki-border)' }}>
      <table className="w-full text-[10px] text-wiki-text2">
        {item.headers && item.headers.length > 0 && (
          <thead><tr>{item.headers.map((h, hi) => <th key={hi} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
        )}
        <tbody>
          {item.rows?.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="px-2 py-0.5">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 修复 4：合并 resolvedMedia 到 walk() 路径

在 walk() 之前，将 resolvedMedia 注入到 HTML DOM 中（替换原始 src），或者让 walk() 主动使用 resolvedMedia 队列：

```typescript
// 方案A：将 resolvedMedia 注入 DOM（替换 file:// src 为 data: URL）
let mediaIdx = 0;
const resolvedHtml = cleanedHtml.replace(
  /<(?:img|video|source)[^>]+src\s*=\s*["']([^"']+?)["']/gi,
  (match) => {
    if (mediaIdx < resolvedMedia.length) {
      const resolved = resolvedMedia[mediaIdx++];
      return match.replace(/src\s*=\s*["'][^"']+["']/, `src="${resolved.content}"`);
    }
    return match;
  }
);
```

---

## 5. 已验证正确的节点

| 节点 | 文件 | 状态 |
|------|------|------|
| Paste event 数据提取 | QuickCapture.tsx:404-443 | ✅ |
| hasTableOrVideo 位置 | QuickCapture.tsx:273 | ✅ |
| walk() `<table>` 分支 | QuickCapture.tsx:360-374 | ✅ (结构正确) |
| walk() `<img>` 分支 | QuickCapture.tsx:350-354 | ✅ (结构正确) |
| raw blobs 处理 | QuickCapture.tsx:485-488 | ✅ |
| captureItemsToBlocks 映射 | contentBlocks.ts:14-23 | ✅ |
| handleRequirements POST | main.cjs:578-587 | ✅ |
| formatReq contentBlocks 索引 | main.cjs:720-733 | ✅ |
| Requirements 详情页读取 | Requirements.tsx:463-475 | ✅ |
| ContentBlockRenderer switch | ContentBlockRenderer.tsx:447-476 | ✅ |
| TableBlock 组件 | ContentBlockRenderer.tsx:312-340 | ✅ |
| VideoBlock 组件 | ContentBlockRenderer.tsx:115-166 | ✅ |
| read-clipboard-files handler | main.cjs:1050-1081 | ✅ |
| CaptureItem 接口 ('table' + rows + headers) | QuickCapture.tsx:9-14 | ✅ |
| ContentBlock 类型 ('table' + rows + headers) | types/content.ts:5-16 | ✅ |

---

## 6. 数据流完整性评分

| 数据类型 | 采集路径 | 存储 | 渲染 | 总分 |
|---------|---------|------|------|------|
| 文本 | ✅ | ✅ | ✅ | 🟢 无问题 |
| 图片 | ✅ (file:// 未解析但 dataURL 路径正常) | ✅ | ✅ | 🟢 基本正常 |
| **视频** | 🔴 walk() 路径未解析 file:// | ✅ | ✅ | 🔴 **需修复** |
| **表格** | ✅ | ✅ | ✅ 详情页 / 🔴 采集预览 | 🟡 **采集预览缺失** |
| 文件 | ✅ (resolveFileItem) | ✅ | ✅ | 🟢 无问题 |

---

## 7. 结论

全链路在**架构层面**是正确的——类型定义、数据转换、持久化、渲染各层接口一致。但存在 **2 个关键断裂点**和 **1 个 UI 缺失**：

1. **🔴 P0**：walk() 路径中的 `<video>` 和 `<img>` 未调用 resolveFileItem，导致文件路径无法解析为 dataURL
2. **🔴 P0**：resolvedMedia（已成功解析的媒体）在 hasTableOrVideo=true 时被丢弃
3. **🟡 P1**：QuickCapture 采集预览 UI 缺少 table 类型渲染

修复优先级建议：修复 #1 + #2（合并为一个 PR，修改 walk() 为 async 并使用 resolvedMedia）→ 修复 #3（添加 table 预览）

---

*本文档由架构师 Bob 生成，基于 v3 代码实际审查。*
