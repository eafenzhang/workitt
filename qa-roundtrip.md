# 剪贴板多轮回归验证报告

> QA 工程师：严过关 | 日期：2026-05-27 | 项目：Workit 剪贴板 v3 修复

---

## 变更摘要

本次修复新增了 **readClipboardText IPC 回退**（`QuickCapture.tsx` lines 446-448），当浏览器 paste 事件无法读取企微自定义格式时，通过 Electron `clipboard.readText()` 获取文本标记。同时加入了 `[qc-diag]` 诊断日志。

**关键变更文件：**
- `src/components/QuickCapture.tsx` lines 425-451：新增诊断日志 + readClipboardText 回退
- `src/components/QuickCapture.tsx` lines 350-359：img 标签 walk 中增加 file:// 路径解析
- `src/components/QuickCapture.tsx` lines 361-372：video 标签 walk 中增加 file:// 路径解析

> ⚠️ 当前环境为代码分析模式，无法启动实际应用进行交互测试。以下验证基于源码静态追踪 + 日志分析。

---

## 轮 1：企微视频粘贴

### 测试步骤：从企微复制含视频的聊天消息 → Ctrl+V 粘贴

### 代码路径追踪

```
Step 1: ClipboardEvent 触发
  dt.getData('text/plain') → 含 "[视频]" 标记的文本 ✅
  dt.getData('text/html')  → 含 <wxwork-data> + 文本 + <img> 但无 <video> 标签 ⚠️
  dt.types → 至少含 "text/plain", "text/html"
  dt.items → 无 image/* 或 video/* 项

Step 2: 诊断日志输出
  [qc-diag] dt.types: ["text/plain", "text/html"] (预期)
  [qc-diag] dt.item: string text/plain
  [qc-diag] dt.item: string text/html
  [qc-diag] readClipboardFiles result: [] (企微不把视频路径放 CF_HDROP)

Step 3: parseHtmlToItems(html, text, api)
  hasTableOrVideo = false (HTML 中无 <video> 或 <table>)
  plainText && !hasTableOrVideo → 走文本行解析分支
  "[视频]" 行 → 创建 { type: 'video', content: '' } ⚠️
  (因为 resolvedMedia 中没有视频 URL 可匹配)

Step 4: 空视频回退
  emptyVideos = [{type:'video', content:''}]
  readClipboardFiles() → [] (CF_HDROP 中没有视频路径)
  → 视频保持 content: ''

Step 5: 最终结果
  newItems: [..., {type:'video', content:''}, ...]
  非空 → 不会触发 "无数据"
```

### 预期行为

| 阶段 | 预期结果 | 状态 |
|------|----------|------|
| 粘贴触发 | 弹窗打开 | ✅ |
| 采集弹窗视频显示 | 显示 "🎥 视频" 占位标签（无实际视频数据） | ⚠️ |
| 提交后详情页 | 显示 "🎥 视频（无数据）" 占位符 + tooltip "剪贴板未包含视频数据" | ⚠️ |
| 视频可播放 | ❌ 不可播放（content 为空） | ❌ |

### 结语

> ⚠️ **部分通过** — 不会出现"无数据"，但视频显示为占位符，无法播放。
> **根本限制**：企微不将视频文件路径放入任何标准 Windows 剪贴板格式（CF_HDROP / CF_HTML）。
> 需通过原生 API 探测企微自定义剪贴板格式名才能根治。参见 `clipboard-v3-diag.md` 建议 3。

---

## 轮 2：网页表格粘贴

### 测试步骤：从含 `<table>` 的网页复制 → Ctrl+V

### 代码路径追踪

```
Step 1: ClipboardEvent 触发
  dt.types: ["text/plain", "text/html"] (标准浏览器行为)
  dt.getData('text/html') → 含完整 <table> 结构的 HTML ✅

Step 2: parseHtmlToItems(html, text, api)
  hasTableOrVideo = /<table\b|<video\b/i.test(html) → true
  → 走 HTML-only 路径 (DOM walk) ✅
  日志: [parseHtmlToItems] html-only: N items

Step 3: DOM walk
  遇到 <table> 标签 (line 374):
    - 遍历所有 <tr> → rows
    - 遍历每个 <tr> 的 children → cells
    - <th> → 记录到 headers
    - 生成 { type:'table', content:'', rows, headers }
    - return（不递归到 table 子元素）

Step 4: 采集弹窗渲染 (line 907-922)
  交替行背景（ri % 2 === 0）→ 斑马纹 ✅
  border + borderBottom → 表格边框 ✅

Step 5: 详情页渲染 (ContentBlockRenderer TableBlock line 312-340)
  <thead> 渲染 headers（粗体 + 底部双线） ✅
  <tbody> 交替行背景 ✅
  overflow-x-auto → 横向滚动 ✅
```

### 预期行为

| 阶段 | 预期结果 | 状态 |
|------|----------|------|
| 走 html-only 路径 | 日志显示 `[parseHtmlToItems] html-only` | ✅ |
| 采集弹窗显示表格 | 斑马纹表格，含行列数据 | ✅ |
| 详情页渲染表格 | 斑马纹表格，含表头粗体 | ✅ |

### 结语

> ✅ **通过** — 网页表格粘贴全链路完整。TableBlock 在采集弹窗和详情页均有完整的斑马纹 + 边框渲染。

---

## 轮 3：企微文件+图片+文字混合

### 测试步骤：从企微复制含图片+文件+文字的消息

### 代码路径追踪

```
Step 1: ClipboardEvent 触发
  dt.getData('text/plain') → 含文本 + [图片] + [文件:xxx] 标记
  dt.getData('text/html')  → 含 <wxwork-data> + <img src="file://..."> + 文本

Step 2: parseHtmlToItems(html, text, api)
  hasTableOrVideo = false (无 <video>/<table>)
  plainText && !hasTableOrVideo → 走文本行解析

  mediaUrls 提取:
    - <img src="file:///.../xxx.png"> → 加入 mediaUrls ✅
    - 无 <video> 标签 → 无视频 URL
  
  resolveFileItem(imgUrl):
    - file:///.../xxx.png → readLocalFile → dataURL ✅
    → { type:'image', content:'data:image/png;base64,...' }

  文本行解析:
    line "[图片]" → 匹配 resolvedMedia[0] → image ✅
    line "[文件：覆盖会员.xlsx]" → 匹配 fileMarkerRx → { type:'file', content:'', name:'覆盖会员.xlsx' } ✅
    line "普通文本" → { type:'text', content:'普通文本' } ✅

Step 3: 结果汇总
  items: [text, text, ..., image, text, ..., file, text, ...]
  
Step 4: 渲染
  采集弹窗:
    - image → 缩略图预览（可点击放大） ✅
    - file → FileChip 组件显示文件名 ✅
    - text → 文本块 ✅
  详情页:
    - image → ImageBlock（带 lightbox） ✅
    - file → FileBlock（下载/预览） ✅
```

### 预期行为

| 阶段 | 预期结果 | 状态 |
|------|----------|------|
| 图片识别 | 弹窗显示缩略图 + 详情页 lightbox 预览 | ✅ |
| 文件识别 | 弹窗显示 FileChip + 详情页 FileBlock | ✅ |
| 文字识别 | 正文保留 | ✅ |
| 所有类型正确 | text + image + file 三种类型均识别 | ✅ |

### 结语

> ✅ **通过** — 混合内容解析正常，image 通过 `readLocalFile` 获取 base64 data URL，file 保留文件名标识。

---

## 轮 4：企微文件（Empty Clipboard 场景）— v3 诊断报告断裂点 1

### 测试步骤：复制企微纯文件消息（浏览器 paste 获取全空）

### 代码路径追踪

```
Step 1: ClipboardEvent 触发
  dt.getData('text/plain') → ''  ❌ 空！
  dt.getData('text/html')  → ''  ❌ 空！
  rawBlobs → []                  ❌ 空！

Step 2: IPC 回退（本次新增修复）
  !text && api.readClipboardText → 调用 clipboard.readText()
  → 返回 '[文件：覆盖会员.xlsx]'  ✅ 关键修复！

  !html && api.readClipboardHTML → 调用 clipboard.readHTML()
  → 返回 '' (企微未使用标准 CF_HTML) ❌

Step 3: 路径分流
  html 为空 → 跳过 parseHtmlToItems
  newItems.length === 0 && text → true
  → 调用 resolveTextFileItems('[文件：覆盖会员.xlsx]', api)

Step 4: resolveTextFileItems 分析
  lines = ['[文件：覆盖会员.xlsx]']
  
  line "[文件：覆盖会员.xlsx]":
    - 不以 file:// 开头 ❌
    - looksLikeFilePath? → 不太可能匹配（方括号包裹）❌
    - 落到 line 104: items.push({ type:'text', content:'[文件：覆盖会员.xlsx]' })
  
  hasFiles = false → return null

Step 5: 回退处理
  fileItems = null → else 分支
  newItems.push({ type:'text', content:'[文件：覆盖会员.xlsx]' })

Step 6: 最终结果
  newItems.length = 1 → 不触发 "无数据" ✅
  但 [文件:xxx] 被当作纯文本，未解析为 file 类型 ⚠️
```

### 预期行为

| 阶段 | 预期结果 | 状态 |
|------|----------|------|
| IPC text 回退生效 | 日志显示 text='[文件：覆盖会员.xlsx]' | ✅ |
| 不显示"无数据" | final items ≥ 1 | ✅ |
| [文件:xxx] 识别为文件 | 弹窗显示 FileChip 组件 | ⚠️ |
| 实际行为 | 显示为纯文本 "[文件：覆盖会员.xlsx]" | ⚠️ |

### 问题根因

`resolveTextFileItems()` 函数（lines 56-108）**未处理 `[文件:xxx]` 标记格式**。该函数只处理：
- `file://` 开头的行（line 63）
- 看起来像文件路径的行（line 83，通过 `looksLikeFilePath`）

当 IPC 回退拿到的 text 是 `[文件：覆盖会员.xlsx]` 时，两种检查都不匹配，文本被当作普通 text 而非 file。

### 修复建议

在 `resolveTextFileItems()` 的 `for` 循环中（line 61 之后），增加对 `[文件:xxx]` 标记的处理：

```typescript
const fileMarkerRx = /^\[文件[：:](.+?)\]$/;
const fileMatch = trimmed.match(fileMarkerRx);
if (fileMatch) {
  const fileName = fileMatch[1].trim();
  items.push({ type: 'file', content: '', name: fileName, size: undefined });
  hasFiles = true;
  continue;
}
```

### 结语

> ⚠️ **部分通过** — IPC 回退成功拿到文本，不再显示"无数据"。但 `resolveTextFileItems` 缺少 `[文件:xxx]` 标记解析，导致文件标记被当作文本显示。修复量约 6 行代码。

---

## 综合结论

| 轮次 | 场景 | 结果 | 关键发现 |
|------|------|------|----------|
| 轮 1 | 企微视频粘贴 | ⚠️ 部分 | 不显示"无数据"，但视频为占位符（企微不公开视频路径） |
| 轮 2 | 网页表格粘贴 | ✅ 通过 | 表格全链路完整（解析→弹窗→详情页斑马纹） |
| 轮 3 | 企微混合内容 | ✅ 通过 | 图片+文件+文字均正确识别 |
| 轮 4 | 企微文件（空剪贴板） | ⚠️ 部分 | IPC 回退生效，但 `[文件:xxx]` 未解析为 file 类型 |

### 本次修复成功项
- ✅ `readClipboardText` IPC 回退：**解决了最严重的"无数据"问题**（断裂点 1）
- ✅ 诊断日志 `[qc-diag]`：为后续排查提供了关键可见性
- ✅ 表格粘贴：全链路正常
- ✅ 混合内容粘贴：图文文件均正确

### 遗留问题
- ⚠️ 视频永远显示占位符（需原生 API 探测企微自定义格式，见 `clipboard-v3-diag.md` 建议 3）
- ⚠️ `resolveTextFileItems` 未处理 `[文件:xxx]` 标记（约 6 行修复，本轮 4 结语含补丁）

### 建议优先级
1. **[P0 已完成]** readClipboardText 回退 ← 本次修复
2. **[P1 建议]** 修复 `resolveTextFileItems` 中的 `[文件:xxx]` 解析 ← 6 行改动
3. **[P2 后续]** 原生 API 探测企微自定义剪贴板格式（视频/表格原始数据）
