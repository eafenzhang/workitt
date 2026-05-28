# 企微剪贴板视频 & 表格解析问题分析报告

> QA 工程师：Edward（严过关）
> 日期：2026-05-27
> 项目：Workit 剪贴板采集功能

---

## 一、粘贴数据的原始格式

### 1.1 企微聊天消息 HTML 样例（完整）

从日志中提取的企微 Ctrl+C 复制聊天记录时，HTML 内容如下：

```html
<html>
<body>
<!--StartFragment--><wxwork-data data-type="ChatMessage" data-version="3.1.20.11441"></wxwork-data>
张聪聪(12)&nbsp;5/27&nbsp;22:54:48<br>123<BR><BR>
Mino&nbsp;5/27&nbsp;22:54:59<br>思考中…<BR><BR>
Mino&nbsp;5/27&nbsp;22:55:00<br>嗯，在呢。<BR><BR>
张聪聪(12)&nbsp;5/27&nbsp;23:19:17<br>
<img src="file:///C:/Users/121212/Documents/WXWork/1688851195396186/Cache/Image/2026-05/企业微信截图_17798819808906.png" />
<BR><BR>
Mino&nbsp;5/27&nbsp;23:19:21<br>⚠&nbsp;所选模型不可用，请检查&nbsp;IM&nbsp;Bot&nbsp;的模型和供应商配置<BR><BR>
张聪聪(12)&nbsp;5/27&nbsp;23:19:29<br>
Workit 架构大重构 — 完成
去掉了 Express 后端 + IPC 桥...
<BR><BR>
Mino&nbsp;5/27&nbsp;23:19:31<br>⚠&nbsp;所选模型不可用...<BR><BR>
张聪聪(12)&nbsp;5/27&nbsp;23:20:17<br>[视频]<BR><BR>
Mino&nbsp;5/27&nbsp;23:...
</body>
</html>
```

### 1.2 纯文本内容（plainText）

```
张聪聪(12) 5/27 22:54:48
123

Mino 5/27 22:54:59
思考中…

Mino 5/27 22:55:00
嗯，在呢。

张聪聪(12) 5/27 23:19:17
[图片]

Mino 5/27 23:19:21
⚠ 所选模型不可用，请检查 IM Bot 的模型和供应商配置

张聪聪(12) 5/27 23:19:29
Workit 架构大重构 — 完成
...

Mino 5/27 23:19:31
⚠ 所选模型不可用，请检查 IM Bot 的模型和供应商配置

张聪聪(12) 5/27 23:20:17
[视频]

Mino 5/27 23:...
```

### 1.3 关键观察

| 媒体类型 | HTML 中如何表示 | 纯文本中如何表示 |
|----------|----------------|-----------------|
| 图片     | `<img src="file:///C:/.../xxx.png" />` | `[图片]` |
| **视频** | **无任何标签！** 既不包含 `<video>`、`<source>`、也不包含 `<a href="file://...">` | `[视频]` |
| 文件     | `<a href="file:///..." ...>xxx.xlsx</a>` (推测) | `[文件:覆盖会员.xlsx]` |
| **表格** | HTML 中大概率包含 `<table>` 标签 | 按行拆分，结构丢失 |

---

## 二、代码路径追踪

### 2.1 Ctrl+V 粘贴流程（`paste` handler, 约 L385-458）

```
paste 事件触发
  → 读取 text/plain（dt.getData('text/plain')）
  → 读取 text/html（dt.getData('text/html')）
  → 备用: IPC readClipboardHTML()
  → 读取 blob items（dt.items，仅 image/* 和 video/*）
  → if (html): parseHtmlToItems(html, text, api)  ← 核心路径
  → if (newItems.length === 0 && text): resolveTextFileItems(text, api)
  → 追加 rawBlobs（dataUrl 转换）
  → setCaptured()
```

**关键发现**：Ctrl+V 路径 **不调用 `readClipboardFiles`**。

### 2.2 `parseHtmlToItems` 流程（L223-382）

```
parseHtmlToItems(html, plainText, api)
  → 1. 清洗 HTML（&nbsp; → 空格, <br> → \n）
  → 2. 提取 mediaUrls:
      - imgRx: /<img[^>]+src=["']([^"']+)["']/gi  → 匹配 <img> 的 src
      - videoRx: /<(?:video|source)[^>]+src=["']([^"']+)["']/gi  → 匹配 <video>/<source> 的 src
      - linkRx: /<a[^>]+href=["'](file:\/\/[^"']+)["']/gi  → 匹配 <a> 的 file:// href
  → 3. 遍历 mediaUrls，调用 resolveFileItem()：
      - data: → image
      - http(s):// → image
      - file:// + readLocalFile → resolveFileItem
      - 其他 → SKIPPED
  → 4. 有 plainText?
      YES → 按行处理（L270-327）
          - [文件:xxx] → type: 'file'
          - [图片] → 取 resolvedMedia[mediaIdx]
          - [视频] → 取 resolvedMedia[mediaIdx]
          - 否则 → type: 'text'
      NO → HTML-only walk（L331-382）
          - BLOCK_TAGS: 'p','div','li','h1'..'h6','blockquote','tr','section','article'
          - 处理 <img>、<video> 标签
          - 普通文本提取（不保留表格结构）
```

### 2.3 `handleFloatClick` 流程（L461-598）

```
handleFloatClick
  → 1. readClipboardImages()  ← Electron 原生剪贴板
  → 2. readClipboardFiles()   ← ★ 获取文件路径（Ctrl+V 不调用！）
      - 对每条路径：检查是否为 video/文件，调用 resolveFileItem
  → 3. readClipboardText()
  → 4. readClipboardHTML() → parseHtmlToItems()
  → 5. 浏览器 fallback: navigator.clipboard.read()
```

**关键发现**：`readClipboardFiles` **仅在 `handleFloatClick` 中调用**。

---

## 三、根因结论

### 🔴 根因 1：视频丢失 — WeChat Work HTML 中不含视频 URL 或标签

**问题链路**：

```
企微 Ctrl+C
  → HTML 中: 无 <video>, 无 <source>, 无 <a href="file://...">（视频）
  → HTML 中: 有 <img src="file:///...">（图片 ✓）
  → plainText 中: [图片]  和  [视频] 两个标记
  → parseHtmlToItems 步骤2:
      imgRx  匹配到 1 个 file:// PNG  → mediaUrls = [图片URL]
      videoRx 匹配到 0 个              → 无视频
      linkRx  匹配到 0 个              → 无视频链接
  → parseHtmlToItems 步骤3:
      resolvedMedia = [image(dataURL)]  ← 只有 1 个媒体
  → parseHtmlToItems 步骤4（plainText 分支）:
      遍历到 [视频] 时: mediaIdx=1, resolvedMedia.length=1
      条件 1 < 1 为 false → 走 else 分支
      → items.push({ type: 'video', content: '' })  ← ★ 空内容视频！
  → 日志类型分布: video:? ← type='video', content=''(空)
  → 最终用户看到: "🎥 视频" 占位符，无实际视频数据
```

**为什么 handleFloatClick 可能有救**：
- `handleFloatClick` 中调用 `readClipboardFiles()` 会获取剪贴板中的文件路径
- 如果企微复制时将视频文件路径放入剪贴板文件列表，`resolveFileItem(fp, api)` 可以正确读取视频并生成 dataURL
- **但 Ctrl+V 路径没有调用 `readClipboardFiles`**

**根本原因总结**：
1. **企微 HTML 不包含视频的任何引用**（无 URL、无标签、无链接）
2. `parseHtmlToItems` 的视频 URL 提取正则无法匹配到企微视频
3. `[视频]` 标记被转换为 **空内容的 video item**（`content: ''`）
4. Ctrl+V paste handler **未调用 `readClipboardFiles`**，无法从剪贴板文件列表中获取视频

### 🟡 根因 2：表格结构丢失 — plainText 路径完全扁平化

**问题链路**：

```
企微 Ctrl+C（含表格消息）
  → HTML 中有 <table><tr><td>...</td></tr></table>
  → plainText 中表格内容按行展开（列分隔符丢失）
  
  → parseHtmlToItems 步骤4（plainText 分支）:
      const lines = plainText.split('\n');
      对每行: items.push({ type: 'text', content: line });
      → ★ 表格结构完全丢失！
  
  → 即使走 HTML-only 分支:
      BLOCK_TAGS 包含 'tr'（块级标签，追加 \n）
      但 'table'、'td'、'th' 不在任何特殊处理列表中
      walk() 对 <td> 只是递归处理子节点
      → 表格单元格内容被扁平化拼接，无列分隔
```

**根本原因总结**：
1. `parseHtmlToItems` 的 **plainText 分支是"权威源"**（注释：authoritative source for content structure），但纯文本天然不含表格结构
2. HTML-only 分支虽然有 `tr` 作为块标签，但 `<td>`/`<th>` 的列分隔符（如 `\t` 或 ` | `）完全没有插入
3. 最终表格内容变成一堆无结构的文本行，用户看到的是混乱的文本

### 🟢 根因 3：`readClipboardFiles` 只在 FloatClick 路径调用

```
Ctrl+V paste handler (L385-458):
  - readClipboardHTML   ✓（备用）
  - readClipboardFiles  ✗（未调用！）
  - readClipboardImages ✗（未调用！）

handleFloatClick (L461-598):
  - readClipboardImages  ✓
  - readClipboardFiles   ✓（调用并正确处理视频/文件）
  - readClipboardHTML    ✓
  - readClipboardText    ✓
```

两个路径的功能不对称，导致 Ctrl+V 路径缺少剪贴板文件读取能力。

---

## 四、修复建议

### 修复 1：在 paste handler 中增加 `readClipboardFiles` 调用

**位置**：`QuickCapture.tsx` paste handler（约 L400-412 之后）

```typescript
// 在 paste handler 中，rawBlobs 提取之后，增加剪贴板文件读取
if (api?.readClipboardFiles) {
  try {
    const files = await api.readClipboardFiles();
    if (Array.isArray(files) && files.length > 0) {
      for (const fp of files) {
        if (!fp || fp.startsWith('data:') || fp.startsWith('http')) continue;
        const item = await resolveFileItem(fp, api);
        if (item) newItems.push(item);
      }
    }
  } catch {}
}
```

**优先级**：🔴 高 — 直接解决视频丢失问题

### 修复 2：在 `parseHtmlToItems` 中为视频标记增加 fallback 文件查找

**位置**：`parseHtmlToItems` 处理 `[视频]` 时（L290-298）

当 `resolvedMedia` 不足时，不要直接创建空内容 video item。改为：
1. 尝试通过 IPC `readClipboardFiles` 查找是否有视频文件
2. 至少给出明确的警告日志

```typescript
if (trimmed === '[视频]') {
  if (mediaIdx < resolvedMedia.length) {
    items.push(resolvedMedia[mediaIdx]);
  } else {
    // Fallback: 尝试从剪贴板文件列表获取视频
    let found = false;
    if (api?.readClipboardFiles) {
      try {
        const files = await api.readClipboardFiles();
        for (const fp of files || []) {
          const ext = getFileExt(fp);
          if (VIDEO_EXTS.includes(ext)) {
            const item = await resolveFileItem(fp, api);
            if (item) { items.push(item); found = true; break; }
          }
        }
      } catch {}
    }
    if (!found) {
      items.push({ type: 'video', content: '' });
      console.warn('[parseHtmlToItems] [视频] marker without matching media');
    }
  }
  mediaIdx++;
}
```

**优先级**：🔴 高

### 修复 3：HTML-only 分支增加表格结构保留

**位置**：`parseHtmlToItems` HTML-only 分支 `walk()` 函数（L338-364）

在 `BLOCK_TAGS` 中增加 `'table'`，并在处理 `<td>`/`<th>` 时追加列分隔符：

```typescript
// 在 walk 函数中
if (tag === 'table') {
  for (const child of Array.from(el.childNodes)) walk(child);
  items.push({ type: 'text', content: '\n' }); // 表格后加空行
  return;
}
if (tag === 'tr') {
  for (const child of Array.from(el.childNodes)) walk(child);
  items.push({ type: 'text', content: '\n' }); // 每行后换行
  return;
}
if (tag === 'td' || tag === 'th') {
  for (const child of Array.from(el.childNodes)) walk(child);
  // 在单元格后追加列分隔符
  const last = items[items.length - 1];
  if (last?.type === 'text') {
    last.content += '\t'; // Tab 作为列分隔
  }
  return;
}
```

**优先级**：🟡 中 — 取决于用户在企微中使用表格的频率

### 修复 4：清理调试日志

`resolveFileItem` 函数（L201-217）存在多条 `console.log` 调试语句，建议条件化或移除：

```typescript
// 当前代码（调试用）→ 改为仅在开发环境输出
if (process.env.NODE_ENV === 'development') {
  console.log('[resolveFile] ...');
}
```

**优先级**：🟢 低 — 不影响功能，但会污染生产日志

---

## 五、总结

| 问题 | 严重度 | 根因 |
|------|--------|------|
| 视频丢失（video:?） | 🔴 严重 | 企微 HTML 无视频标签/URL；`[视频]` 标记生成空内容 item；Ctrl+V 路径未调用 `readClipboardFiles` |
| 表格结构丢失 | 🟡 中等 | plainText 分支将表格扁平化为行文本；HTML-only 分支不保留列结构 |
| 路径不对称 | 🔴 严重 | Ctrl+V paste handler 缺少 `readClipboardFiles`/`readClipboardImages` 调用 |
| 调试日志残留 | 🟢 低 | `resolveFileItem` 中的 `console.log` 未条件化 |

**核心修复方向**：在 Ctrl+V paste handler 中增加 IPC `readClipboardFiles` 调用，即可同时解决视频丢失问题。

---

## 六、修复实施验证（2026-05-27）

> 验证范围：T01–T05 全部变更

### V1 ✅ `src/types/content.ts` — BlockType & ContentBlock

| 检查项 | 结果 | 实际代码 |
|--------|------|----------|
| `BlockType` 含 `'table'` | ✅ | L2: `type BlockType = 'text' \| 'image' \| 'video' \| 'file' \| 'table';` |
| `ContentBlock` 有 `rows` 字段 | ✅ | L14: `rows?: string[][]; // 表格数据（二维数组，table 类型时）` |
| `ContentBlock` 有 `headers` 字段 | ✅ | L15: `headers?: string[]; // 表头（table 类型时可选）` |
| `isContentBlock` 守卫含 `'table'` | ✅ | L22: `['text', 'image', 'video', 'file', 'table'].includes(b.type)` |

### V2 ✅ `src/utils/contentBlocks.ts` — CaptureItem 接口 & 转换

| 检查项 | 结果 | 实际代码 |
|--------|------|----------|
| `CaptureItem.type` 含 `'table'` | ✅ | L5: `type: 'text' \| 'image' \| 'video' \| 'file' \| 'table';` |
| `CaptureItem` 有 `rows` | ✅ | L9: `rows?: string[][]; // 表格数据（二维数组）` |
| `CaptureItem` 有 `headers` | ✅ | L10: `headers?: string[]; // 表头（可选）` |
| `captureItemsToBlocks` 传递 rows/headers | ✅ | L20-21: `rows: item.rows, headers: item.headers` |
| `blocksToCaptureItems` 传递 rows/headers | ✅ | L32-33: `rows: block.rows, headers: block.headers` |

### V3 ✅ `src/components/QuickCapture.tsx` — walk() 表格检测 & paste handler 视频回退

| 检查项 | 结果 | 实际代码 |
|--------|------|----------|
| `CaptureItem` 接口 (L8-15) 含 `'table'`/`rows`/`headers` | ✅ | L9: `type: 'text' \| 'image' \| 'video' \| 'file' \| 'table';` L13-14: `rows?`, `headers?` |
| `walk()` 有 `<table>` 检测 | ✅ | L358: `if (tag === 'table')` |
| 用 `querySelectorAll('tr')` 提取行 | ✅ | L361: `for (const tr of Array.from(el.querySelectorAll('tr')))` |
| 区分 `<th>` 为 headers | ✅ | L364: `const isHeader = cell.tagName === 'TH';` L367: 仅首行 `<th>` 填充 headers |
| 构建 `rows: string[][]` | ✅ | L359-369: rows 数组，cells 数组 |
| 生成 `{ type: 'table' }` item | ✅ | L371: `items.push({ type: 'table', content: '', rows, headers: ... })` |
| paste handler 有空视频检测 | ✅ | L460: `const emptyVideos = newItems.filter(i => i.type === 'video' && !i.content);` |
| paste handler 调 `readClipboardFiles` | ✅ | L461: `if (emptyVideos.length > 0 && api?.readClipboardFiles)` |
| 按扩展名过滤视频 | ✅ | L465-469: `VIDEO_EXTS_FALLBACK` 过滤 |
| 用 `resolveFileItem` 替换空视频 | ✅ | L474: `resolveFileItem(videoPaths[vidIdx++], api)` |
| `Promise.all` 等待异步 | ✅ | L478: `newItems = await Promise.all(newItems);` |

### V4 ✅ `src/components/ContentBlockRenderer.tsx` — TableBlock 组件 & switch case

| 检查项 | 结果 | 实际代码 |
|--------|------|----------|
| `TableBlock` 组件存在 | ✅ | L312-340: 完整 `<table>` 渲染，含 `<thead>`/`<tbody>` |
| 处理空表格 | ✅ | L314: `if (rows.length === 0) return <div>（空表格）</div>` |
| 表头渲染 | ✅ | L319-326: `hasHeaders` 条件下渲染 `<thead><tr><th>` |
| 交替行背景 | ✅ | L330: `ri % 2 === 0 ? 'transparent' : 'var(--wiki-surface)'` |
| switch 有 `case 'table'` | ✅ | L470-471: `case 'table': return <TableBlock key={i} block={block} />;` |
| switch 覆盖所有 5 种类型 | ✅ | text / image / video / file / table + default |

### V5 ✅ `npx vite build` — 构建通过

```
vite v7.3.3 building client environment for production...
✓ 2397 modules transformed.
✓ built in 7.78s
```

无编译错误，无类型错误，输出正常。

### 附加观察 ⚠️

`QuickCapture.tsx` 采集预览弹窗（L829-873）中 `captured.items.map()` 的渲染分支未包含 `table` 类型处理：

```typescript
// L829-873: 缺少 case 'table'
if (item.type === 'text') { ... }
if (item.type === 'image') { ... }
if (item.type === 'video') { ... }
if (item.type === 'file') { return <FileChip ... />; }
return null; // ← table items 返回 null，采集预览中不可见
```

**影响**：采集弹窗中表格不显示（但提交后在需求详情页通过 `ContentBlockRenderer` 正常渲染）。建议添加简易表格预览或占位提示。

### 验证结论

T01–T05 全部变更**已正确实施**：
- 类型系统完整闭环（`content.ts` → `contentBlocks.ts` → `QuickCapture.tsx`）
- 表格解析：HTML-only 分支中使用 `querySelectorAll('tr')` 完整提取表格结构
- 视频回退：paste handler 在检测到空内容视频后调用 `readClipboardFiles` 兜底
- 渲染管线：`ContentBlockRenderer` 的 `TableBlock` 组件完整支持表头、交替行色
- 构建通过，零编译错误
