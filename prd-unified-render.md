# PRD：采集弹窗与需求详情统一渲染

## 项目信息

- **项目名称**：workit_unified_render
- **编程语言**：TypeScript (Electron + React + Vite + sql.js)
- **原始需求**：采集弹窗和需求详情使用相同渲染格式，详情页支持图片预览/视频播放/文档预览/压缩包下载/URL 识别，多媒体按原始顺序显示

---

## 1. 产品目标

| # | 目标 | 衡量标准 |
|---|------|---------|
| G1 | **采集与详情的"所见即所得"一致** | 采集弹窗中看到的内容顺序和格式，与提交后在详情页看到的内容完全一致 |
| G2 | **多媒体内容按原始顺序渲染** | 文字、图片、视频、文件在详情页中的排列顺序 = 用户在采集时的粘贴/添加顺序 |
| G3 | **详情页支持全类型预览** | 图片可预览、视频可播放、文档(doc/pdf)可预览下载、压缩包可下载、URL 自动识别为链接 |

---

## 2. 用户故事

| # | 用户故事 |
|---|---------|
| US1 | **作为产品经理**，我从微信/飞书复制一段含文字+图片+文件的聊天记录到采集弹窗，提交后详情页中这些内容的顺序和格式应该跟我在弹窗中看到的一模一样，这样我就不需要二次排版。 |
| US2 | **作为开发人员**，我在详情页查看需求时，图片可以直接点击放大预览，视频可以内联播放，文档和压缩包可以一键下载打开，不需要跑到服务器上手动找文件。 |
| US3 | **作为团队成员**，我在需求描述中粘贴的 URL 链接应该自动变成可点击的，不需要手动复制到浏览器打开。 |
| US4 | **作为产品经理**，当我粘贴的是微信聊天记录时，详情页应该保留对话气泡的样式，方便我快速定位是哪个人的发言。 |

---

## 3. 功能需求（优先级分级）

### P0 — 必须实现（核心闭环）

| 编号 | 需求 | 说明 |
|------|------|------|
| P0-1 | **统一数据结构 `content_blocks`** | 用 JSON 数组替代当前分离的 `desc` + `images`。每个 block 有 `type`（text/image/video/file）和 `content`。顺序即显示顺序。 |
| P0-2 | **采集弹窗提交时按顺序写入 `content_blocks`** | 将当前 `CaptureItem[]` 的顺序完整保存到数据库。文字保持原始换行，聊天格式的文字 block 标记 `chatFormat: true`。 |
| P0-3 | **详情页按 `content_blocks` 顺序渲染** | 遍历 blocks 依次渲染，不再"文字归文字、图片归图片"分开两段展示。 |
| P0-4 | **共享渲染组件 `ContentBlockRenderer`** | 采集弹窗和详情页使用同一个渲染组件/逻辑，确保格式 100% 一致。 |

### P1 — 应该实现（提升体验）

| 编号 | 需求 | 说明 |
|------|------|------|
| P1-1 | **图片 lightbox 预览** | 详情页图片点击放大，支持左右箭头切换、ESC 关闭（采集弹窗已有此功能，复用即可）。 |
| P1-2 | **视频内联播放** | 视频 block 渲染为 `<video controls>` 标签，支持播放/暂停/全屏。 |
| P1-3 | **文件 block 下载** | 文档(doc/pdf/xls 等)和压缩包(zip/rar/7z 等)渲染为可点击文件卡片，点击下载或新窗口打开。 |
| P1-4 | **URL 自动识别** | 文字 block 中的 `https?://` 链接自动渲染为可点击的 `<a>` 标签。 |
| P1-5 | **向后兼容** | 读取旧数据时，若 `content_blocks` 为空，自动从 `desc` + `images` 重建 order（先 text 再 images 再附件）。 |

### P2 — 锦上添花

| 编号 | 需求 | 说明 |
|------|------|------|
| P2-1 | **文档内联预览** | doc/pdf 文件点击后在详情页内 iframe 预览，而非仅下载。 |
| P2-2 | **代码文件语法高亮预览** | 代码类文件(.py/.js/.ts 等)渲染为带行号的代码块。 |
| P2-3 | **拖拽排序** | 采集弹窗中支持拖拽调整已添加 block 的顺序。 |

---

## 4. 数据结构方案

### 4.1 新增字段 `content_blocks`

在 `requirements` 表中新增一个 TEXT 字段，存储有序的内容块 JSON 数组：

```sql
ALTER TABLE requirements ADD COLUMN content_blocks TEXT DEFAULT '[]';
```

### 4.2 Block 类型定义

```typescript
type BlockType = 'text' | 'image' | 'video' | 'file';

interface ContentBlock {
  type: BlockType;
  content: string;       // text内容 / image URL / video URL / file URL
  // 可选元数据
  fileName?: string;     // 文件名（file 类型必填）
  fileSize?: number;     // 文件大小（file 类型）
  mimeType?: string;     // MIME 类型（用于区分 doc/pdf/zip 等）
  chatFormat?: boolean;  // 是否为聊天消息格式（text 类型可选）
  sender?: string;       // 发送者名称（chatFormat=true 时）
  timestamp?: string;    // 消息时间（chatFormat=true 时）
}
```

### 4.3 新旧数据兼容策略

```
读取需求时：
  if (content_blocks 非空) → 直接使用 content_blocks 渲染
  else → 从 desc + images 兼容重建：
    1. 解析 desc 中的文本行 → text blocks
    2. 解析 desc 中的 [附件:name|url] → file blocks
    3. images 数组 → image blocks
    4. 顺序：先 text、再 images、再 file（此为兼容模式，不保证精确顺序）
```

### 4.4 采集弹窗提交逻辑变更

```
当前：text → desc, images → images[], files → desc末尾 [附件:xxx]
变更后：
  CaptureItem[] → ContentBlock[]（直接映射，保留顺序）
  → JSON.stringify(contentBlocks) → content_blocks 字段
  → desc 字段保留纯文本（用于搜索兼容）
  → images 字段保留图片 URL 数组（用于兼容旧详情页）
```

---

## 5. 交互设计要点

### 5.1 共享渲染逻辑

抽取 `ContentBlockList` 组件：

```
ContentBlockList
├── TextBlock        → 纯文本 / 聊天气泡
├── ImageBlock       → 缩略图，点击触发 lightbox
├── VideoBlock       → <video controls>
└── FileBlock        → 文件卡片（图标+文件名+大小），点击触发下载/预览
```

### 5.2 聊天消息渲染规则

- text block 若 `chatFormat: true`，渲染为对话气泡（左对齐，发送者名称+时间头）
- 发送者颜色沿用现有 `buildSenderColorMap` 逻辑
- 气泡内支持内联图片（聊天中的 `[图片]` 会变成独立的 image block，按原始顺序穿插在 text block 之间）

### 5.3 文件类型预览策略

| 文件类型 | 详情页交互 |
|---------|-----------|
| 图片 (.png/.jpg/.gif 等) | 缩略图 → 点击 lightbox 放大 |
| 视频 (.mp4/.webm 等) | `<video controls>` 内联播放 |
| PDF | 新窗口打开 / iframe 内嵌预览 (P2) |
| Office 文档 (.doc/.xls/.ppt) | 下载（浏览器不支持内联预览） |
| 压缩包 (.zip/.rar/.7z) | 直接下载 |
| 代码 (.py/.js/.ts 等) | 下载 / 代码块展示 (P2) |

### 5.4 采集弹窗 UI 调整

- 当前"补充描述"输入框保留，但提交时其内容作为最后一个 text block 追加到 content_blocks
- 当前"添加文件"按钮上传后自动追加 file block 到末尾
- 采集弹窗的预览区已经是按 CaptureItem[] 顺序渲染的，与详情页布局保持一致即可

---

## 6. Open Questions

| # | 问题 | 决策建议 |
|---|------|---------|
| Q1 | `content_blocks` 是否完全替代 `desc`+`images`？还是并存？ | **建议并存过渡**：新版读写用 `content_blocks`，同时维护 `desc`+`images` 作为兼容字段，一两个版本后再移除旧字段。 |
| Q2 | 聊天消息中的 `[图片]` 占位符如何处理？ | 当前采集弹窗中 `[图片]` 会尝试匹配 HTML 中的 `<img>` 并替换为实际图片；若无实际图片数据则保留占位标记。详情页中：有图片数据的渲染为 ImageBlock，无数据的渲染为占位文本。 |
| Q3 | 视频文件超过多大需要限制？ | 建议单个视频 ≤100MB，超出提示用户。详情页视频不自动播放，需用户手动点击。 |
| Q4 | 文件上传后的 URL 是否持久可靠？ | 当前上传到本地 `backend/src/static/uploads/`，URL 为相对路径。若数据库迁移到其他机器，文件需要同步迁移。短期 OK，长期建议加文件清理策略。 |
