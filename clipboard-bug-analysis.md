# 企业微信（WeCom）剪贴板文件附件丢失 — 根因分析报告

> 分析人：严过关（QA Engineer）  
> 日期：2026-05-27  
> 版本：v1.0

---

## 1. 问题概述

**现象**：用户从企业微信（WeCom）复制包含文件附件（如 `.zip`、`.docx`、`.pdf`）的聊天消息，粘贴到 Workit 采集窗口时，只能看到文字内容，文件附件不显示。

**影响范围**：所有通过 Ctrl+V 粘贴的 WeCom 聊天消息中的文件附件。图片附件不受影响（图片可正常显示）。

---

## 2. 粘贴流程追踪

### 2.1 粘贴入口（QuickCapture.tsx 第 442-530 行）

```
用户 Ctrl+V
  → ClipboardEvent handler (line 444)
    → 读取 text/plain → text 变量
    → 读取 text/html → html 变量
    → 读取二进制 blobs (image/video) → rawBlobs 数组
    → if (html 非空):
        → parseHtmlToItems(html, text, api)     ← 关键路径
    → if (newItems 为空 && text 非空):
        → resolveTextFileItems(text, api)       ← 仅 html 为空时执行
    → 合并 rawBlobs
    → setCaptured() / setShowModal()
```

### 2.2 关键决策点（第 484-511 行）

```typescript
if (html) {
    newItems = await parseHtmlToItems(html, text, api);  // ← WeCom 有 HTML，走这里
}

if (newItems.length === 0 && text) {
    // resolveTextFileItems 仅在 html 为空时被调用
    const fileItems = await resolveTextFileItems(text, api);
} else if (text) {
    // html 非空但 parseHtmlToItems 已返回结果 → 仅检查遗漏的标记
    const missedMarkers = text.match(/\[文件[：:][^\]]+\]/g);
    // ... 补漏逻辑
}
```

**核心问题**：当 WeCom HTML 非空时，`resolveTextFileItems` 不会被直接调用。文件标记的处理完全依赖 `parseHtmlToItems` 内部的文本解析逻辑。

---

## 3. WeCom 剪贴板数据格式分析

### 3.1 图片消息（正常工作）

从日志 `workit.log` 第 5529-5595 行提取：

**text/plain**:
```
杨德强 5/27 20:36:23
你发员工的会员码，给他微信扫码进去看看

途油科技加油站系统1号客服@微信@微信联系人 5/27 20:36:34
好
...
途油科技加油站系统1号客服@微信@微信联系人 5/27 20:40:05
[图片]
...
杨德强 5/27 20:42:57
[图片]
```

**text/html**（关键部分）:
```html
<html><body>
<!--StartFragment-->
<wxwork-data data-type="ChatMessage" data-version="3.1.20.11441"></wxwork-data>
...
途油科技加油站系统1号客服@微信@微信联系人 5/27 20:40:05
<img src="file:///C:/Users/121212/Documents/WXWork/1688851195396186/Cache/Image/2026-05/97b6e0a6-bf64-4896-8351-9cdbfff2e7f4.jpg" />
...
</body></html>
```

✅ **图片正常**：WeCom 在 HTML 中使用 `<img src="file:///...">` 标签引用本地缓存文件，`parseHtmlToItems` 的 `imgRx` 正则能正确提取，`resolveFileItem` 能通过 `api.readLocalFile` 读取为 dataURL。

**日志确认**：
```
[parseHtml] mediaUrls: 2 file:///.../97b6e0a6-bf64-4896-8351-9cdbfff2e7f4.jpg, file:///.../企业微信截图_17798857758243.png
[resolveFile] readLocalFile result: dataURL(144651 chars)  ← 图片数据读取成功
[parseHtmlToItems] text-based: 26 items, 2 media from HTML
```

### 3.2 文件附件消息（BUG）

从日志 `workit.log` 第 6217-6234 行提取：

**text/plain**:
```
张聪聪(12) 2025/12/31 09:06:37
Amy  到你倒垃圾了   景昱跟我换了   ...
...
张聪聪(12) 2/13 16:34:58
[文件：设备图片.7z]              ← 文件标记仅在纯文本中存在
张聪聪(12) 2/13 16:34:58
之前甘总发过一次
```

**text/html**（完整内容）:
```html
<html><body>
<!--StartFragment-->
<wxwork-data data-type="ChatMessage" data-version="3.1.20.11441"></wxwork-data>
张聪聪(12)&nbsp;2025/12/31&nbsp;09:06:37<br>
Amy&nbsp;&nbsp;到你倒垃圾了&nbsp;&nbsp;&nbsp;景昱跟我换了...<BR><BR>
Amy(Amy)&nbsp;2025/12/31&nbsp;09:10:15<br>说了&nbsp;以为是今天<BR><BR>
张聪聪(12)&nbsp;2/13&nbsp;16:34:58<br>
<BR><BR>                          ← 文件附件在这里！仅两个空换行
张聪聪(12)&nbsp;2/13&nbsp;16:34:58<br>之前甘总发过一次
<!--EndFragment--></body></html>
```

❌ **文件丢失**：WeCom 在 HTML 中**完全没有**文件附件的任何引用！

| 格式 | 图片 | 文件附件 |
|------|------|----------|
| text/plain | `[图片]` | `[文件：设备图片.7z]` ✅ |
| text/html | `<img src="file:///...">` ✅ | `<BR><BR>` ❌（空行） |
| 是否有 file:// URL | 有 | **无** |

文件附件的 HTML 表示仅为 `<BR><BR>`（两个换行），没有任何 `<a>`、`<img>` 或其他可提取的 HTML 元素。

---

## 4. 根因分析

### 4.1 直接原因

**WeCom 剪贴板 HTML 格式对文件附件缺乏 `file://` URL 引用。** `parseHtmlToItems` 从 HTML 中提取 media URLs 时结果为 0，而 `resolvedMedia` 为空数组。

### 4.2 代码层面的因果链

```
parseHtmlToItems(html, text, api)
  │
  ├─ 步骤 2：从 HTML 提取 mediaUrls (img/video/a 标签)
  │   └─ 对于文件附件：mediaUrls = [] （HTML 中无任何引用）
  │
  ├─ 步骤 3：resolve mediaUrls → resolvedMedia = []
  │   └─ 无任何 file:// URL，resolvedMedia 为空
  │
  ├─ 步骤 4：文本标记计数
  │   └─ markerCount = 1（检测到 [文件：设备图片.7z]）
  │
  ├─ 步骤 4a：标记匹配判断
  │   └─ markerCount(1) === resolvedMedia.length(0) → FALSE
  │   └─ 进入"mismatch fallback"路径
  │
  └─ 步骤 4b：mismatch fallback（第 352-386 行）
      └─ 匹配 [文件：xxx] 正则 → mediaCursor(0) < resolvedMedia.length(0) → FALSE
      └─ 创建 { type: 'file', content: '', name: '设备图片.7z' }
      └─ content 为空！无实际文件数据
```

### 4.3 关键代码位置

| 位置 | 行号 | 说明 |
|------|------|------|
| 粘贴入口 | 484-487 | `if (html)` → 调用 `parseHtmlToItems` |
| resolveTextFileItems 跳过 | 489 | `newItems.length === 0` 为 false，不执行 |
| HTML media 提取 | 248-262 | 提取 `<img>`、`<video>`、`<a href="file://">` |
| 标记匹配判断 | 292 | `markerCount === resolvedMedia.length` → 不匹配 |
| fallback 文件处理 | 360-366 | 创建空 content 的 file item |
| 遗漏标记补漏 | 497-511 | 安全网：检查 `missedMarkers` |

### 4.4 与图片的对比

| | 图片 | 文件附件 |
|---|---|---|
| HTML 中有引用 | ✅ `<img src="file:///...">` | ❌ 仅有 `<BR><BR>` |
| mediaUrls 提取 | ✅ 提取到 file:// URL | ❌ 0 个 URL |
| resolvedMedia | ✅ 包含 dataURL | ❌ 空数组 |
| markerCount vs resolvedMedia | 匹配（如 2 vs 2） | 不匹配（1 vs 0） |
| 最终结果 | 图片正确显示 | 仅有空壳文件 chip |

---

## 5. 现有修复评估

### 5.1 已实施的修复

**修复 1：`parseHtmlToItems` 文本解析 fallback（第 352-386 行）**

当标记数与 resolvedMedia 数量不匹配时，代码进入 fallback 路径，仍然会处理 `[文件：xxx]` 标记：
```typescript
if (/^\[文件[：:].+?\]$/.test(trimmed)) {
    if (mediaCursor < resolvedMedia.length) {
        items.push(resolvedMedia[mediaCursor]);  // 从不执行（resolvedMedia 为空）
    } else {
        items.push({ type: 'file', content: '', name: ..., size: undefined });
    }
}
```

**效果**：文件 chip 能在 UI 中显示（显示文件名），但 `content` 为空。

**修复 2：粘贴处理器安全网（第 497-511 行）**

```typescript
const missedMarkers = text.match(/\[文件[：:][^\]]+\]/g);
if (missedMarkers && missedMarkers.length > 0) {
    const existingFileCount = newItems.filter(i => i.type === 'file').length;
    if (existingFileCount < missedMarkers.length) {
        const fileItems = await resolveTextFileItems(missedMarkers.join('\n'), api);
        // ... 替换空壳文本为文件 items
    }
}
```

**效果**：如果 `parseHtmlToItems` 遗漏了文件标记，此安全网会捕获并补充。但当 `parseHtmlToItems` 已创建了 file item（即使 content 为空），`existingFileCount` 与 `missedMarkers.length` 相等，安全网**不会被触发**。

### 5.2 遗留问题

**即使两个修复都生效，文件附件的 `content` 始终为空。**

原因是 WeCom 剪贴板对于文件附件**根本不提供任何可访问的文件路径或二进制数据**：
- HTML 中无 `file://` 引用
- 剪贴板无二进制 blob（与图片不同，图片可以从 WXWork Cache 读取）
- 纯文本仅有 `[文件：设备图片.7z]` 标记（文件名）

这意味着：
1. ✅ UI 中**能显示文件 chip**（显示文件名，如 "设备图片.7z"）
2. ❌ 文件 chip **无实际文件内容**（content 为空字符串）
3. ❌ 提交时**文件不会被上传**（`handleSubmit` 第 718 行：`if (item.type === 'file' && item.content)` → content 为空，跳过上传）

---

## 6. 建议方案

### 方案 A：保留文件名占位符（当前状态）

**实现**：维持现状，file chip 显示文件名但无实际数据。  
**优点**：至少用户能看到「这里有个文件」，不会完全丢失信息。  
**缺点**：文件无法上传，用户体验不完整。

### 方案 B：从 WXWork 文件缓存搜索文件

**实现**：根据文件名（如 `设备图片.7z`），在以下目录搜索：
- `C:\Users\{user}\Documents\WXWork\{corpId}\Cache\File\`
- `C:\Users\{user}\Documents\WXWork\{corpId}\Cache\`

通过 `api.readLocalFile` 读取搜索到的文件。

**优点**：可能找到原始文件并成功上传。  
**缺点**：
- 文件缓存路径不固定，搜索可能失败
- 文件名可能不唯一
- 增加了复杂度和 I/O 开销

### 方案 C：引导用户手动上传

**实现**：当检测到 `[文件：xxx]` 标记且 content 为空时，在 UI 中显示提示「文件 "设备图片.7z" 无法从剪贴板获取，请手动上传」。

**优点**：明确告知用户限制，提供手动补救路径。  
**缺点**：增加了用户操作步骤。

### 方案 D：尝试通过 WeCom API 获取文件

**实现**：如果 WeCom 提供了本地 API 或 IPC 通道来获取文件内容，通过该通道获取。  
**优点**：最彻底的解决方案。  
**缺点**：需要调研 WeCom 是否暴露此类接口。

### 推荐：B + C 组合

1. 先尝试在 WXWork Cache 目录搜索文件（方案 B）
2. 搜索失败时，在 UI 中显示「文件未找到，请手动上传」提示（方案 C）

---

## 7. 日志证据汇总

### 7.1 图片粘贴（正常）— 日志行 5529-5597

| 字段 | 值 |
|------|-----|
| mediaUrls | `file:///.../97b6e0a6-...jpg`, `file:///.../企业微信截图_....png` |
| resolvedMedia count | 2 |
| readLocalFile 结果 | `dataURL(144651 chars)`, `dataURL(107586 chars)` |
| 最终 items | 26（含 2 个图片） |

### 7.2 文件附件粘贴（BUG）— 日志行 6217-6234

| 字段 | 值 |
|------|-----|
| text 中的文件标记 | `[文件：设备图片.7z]` |
| HTML 中的文件引用 | **无**（仅有 `<BR><BR>`） |
| mediaUrls | **0** |
| resolvedMedia count | **0** |
| type breakdown | `T,T,T,T,T,F:设备图片.7z,T,T` |
| WeCom file markers log | `[文件：设备图片.7z]` |
| 最终 items | 8（含 1 个空壳 file item） |

### 7.3 resolveTextFileItems 调用记录

整个日志中 `resolveTextFileItems` 仅被调用 **1 次**（日志行 5306）：
```
[qc-paste] text: sk-cp--wQoyLQWAIwgvS9NxW0fE... | html: (empty) | blobs: 0
[qc-paste] resolveTextFileItems result: null
```

该次调用是因为 HTML 为空（纯文本粘贴），非 WeCom 场景。所有 WeCom 粘贴（HTML 非空）均未触发 `resolveTextFileItems`。

---

## 8. 结论

| 项目 | 结论 |
|------|------|
| **根因** | WeCom 剪贴板 HTML 格式对文件附件不提供 `file://` URL 或二进制数据 |
| **直接后果** | `parseHtmlToItems` 的 `resolvedMedia` 为空，文件只能创建空壳 item |
| **当前状态** | 有部分修复（text-based fallback + 安全网），文件 chip 能显示但无实际数据 |
| **剩余问题** | 文件 `content` 始终为空，提交时无法上传 |
| **建议** | 尝试 WXWork Cache 目录搜索 + 搜索失败时引导用户手动上传 |
