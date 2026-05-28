# Workit

智能体工作台 — 需求管理与知识库工具

基于 **Tauri v2 + React + TypeScript** 构建的桌面端应用。集成 AI 分析能力，支持需求采集、知识管理、模型配置、MCP 工具等。

## 功能

- **需求管理** — 创建/编辑/追踪需求，支持状态流转、图片附件、AI 分析总结
- **知识库** — 文档管理，支持 Markdown 编辑器、文件上传预览（图片、PDF、Office 文档等）
- **模型配置** — 支持 DeepSeek、MiniMax、智谱 AI 等主流大模型供应商
- **MCP 工具** — 配置和管理 MCP 服务器
- **快速采集** — 系统级粘贴板监听，随时采集图文内容为需求条目
- **AI 分析** — 需求摘要、自动打标、图片识别、文档总结
- **洞察分析** — 数据可视化，活动趋势图表
- **多主题** — 深色/浅色/跟随系统

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发环境（需要两个终端）
npm run dev                          # Vite 前端开发服务器 → http://localhost:5173
cd src-tauri && cargo run            # Tauri 桌面应用（连接 Vite dev server）

# 或者一键构建发布版本
npm run build                        # 构建前端到 dist/
cd src-tauri && cargo build --release  # 构建 Tauri 二进制
```

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 7 |
| 样式 | Tailwind CSS 4 + CSS Variables |
| 桌面端 | Tauri v2 (Rust) |
| 数据库 | SQLite (rusqlite, bundled) |
| AI | 多供应商适配（DeepSeek / Anthropic / 智谱 / 硅基流动 等）|
| IPC | Tauri invoke + electronAPI 兼容桥接 |

## 架构

```
┌─────────────────────────────────────────────────────┐
│                  Tauri Window                        │
│  ┌───────────────────────────────────────────────┐  │
│  │           React WebView (前端)                 │  │
│  │  Dashboard / Requirements / Knowledge / ...   │  │
│  │           ↓ window.electronAPI                │  │
│  └───────────────┬───────────────────────────────┘  │
│                  │ Tauri IPC (invoke)                │
│  ┌───────────────┴───────────────────────────────┐  │
│  │           Rust 后端                            │  │
│  │  db_query / clipboard / crypto / window ctrl  │  │
│  │           ↓                                   │  │
│  │  SQLite (rusqlite, bundled)                   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### IPC 桥接

前端通过 `window.electronAPI` 调用 Rust 后端，兼容原 Electron 版本的 API 接口：

```typescript
// 前端调用
const data = await window.electronAPI.dbQuery('GET', 'requirements');

// Rust 端处理
#[tauri::command]
fn db_query(method: String, table: String, args: Option<Value>) -> Result<Value, String> {
    // SQLite 查询并返回 JSON
}
```

桥接层通过 `append_invoke_initialization_script` 在所有 WebView 窗口加载前注入。

## 项目结构

```
workit/
├── src/                    # React 前端源码
│   ├── pages/              # 页面组件
│   │   ├── Dashboard.tsx   # 仪表盘
│   │   ├── Requirements.tsx # 需求管理
│   │   ├── Knowledge.tsx   # 知识库
│   │   ├── Settings.tsx    # 系统设置
│   │   └── ...
│   ├── components/         # 通用组件
│   ├── api.ts              # 统一 API 层（IPC / fetch 双通道）
│   └── tauri-bridge.ts     # Tauri electronAPI 类型定义
├── src-tauri/              # Tauri Rust 后端
│   ├── src/
│   │   ├── lib.rs          # 主入口、IPC 命令注册、桥接脚本
│   │   ├── db.rs           # SQLite 数据库操作
│   │   ├── clipboard.rs    # 剪贴板读取
│   │   └── crypto.rs       # API Key 加解密
│   ├── Cargo.toml          # Rust 依赖
│   └── tauri.conf.json     # Tauri 配置
├── vite.config.ts          # Vite 配置（含 Tauri 兼容插件）
├── index.html              # 入口 HTML
└── package.json
```

## 开发说明

### Vite 插件

`vite.config.ts` 包含 `remove-crossorigin` 插件，移除构建时 Vite 自动添加的 `crossorigin` 属性，修复 Tauri dev 模式下的 CORS 加载问题。

### Cargo Features

```toml
[features]
default = ["custom-protocol"]  # dev 模式：连接 Vite dev server
# default = []                  # release 模式：加载 dist/ 静态文件
custom-protocol = ["tauri/custom-protocol"]
```

### 数据库

SQLite 数据库文件位于 `%LOCALAPPDATA%/workit/workit-data.db`（Windows）或 `~/Library/Application Support/workit/workit-data.db`（macOS）。

表结构在 `db.rs` 的 `init()` 中自动创建。

## 构建与发布

```bash
# 完整发布构建
npm run build                           # 构建前端
cd src-tauri && cargo build --release   # 构建 Tauri 二进制

# 产物位置
# src-tauri/target/release/workit-tauri.exe
```

## 许可证

MIT
