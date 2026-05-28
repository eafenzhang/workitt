# Workit

Agent Wiki 需求管理应用 — 智能体工作台

一款基于 Electron + React + TypeScript 的桌面端需求管理与知识库工具。集成 AI 分析能力，支持需求采集、知识管理、模型配置、MCP 工具等。

## 功能

- **需求管理** — 创建/编辑/追踪需求，支持状态流转、图片附件、AI 分析总结
- **知识库** — 文档管理，支持 Markdown 编辑器、文件上传预览（图片、PDF、Office 文档等）
- **模型配置** — 支持 DeepSeek、MiniMax、智谱 AI 等主流大模型供应商
- **MCP 工具** — 配置和管理 MCP 服务器
- **快速采集** — 系统级粘贴板监听，随时采集图文内容为需求条目
- **AI 分析** — 需求摘要、自动打标、图片识别、文档总结
- **外网访问** — 后端监听 `0.0.0.0`，配合 Tailscale 可外网访问
- **自动更新** — 集成 electron-updater，支持 GitHub Releases 静默更新
- **多主题** — 深色/浅色/跟随系统，支持 Ocean、Minimal 等主题

## 快速开始

```bash
# 安装依赖
npm install
cd backend && npm install && cd ..

# 启动开发环境
npm run dev                 # 前端开发服务器 → http://localhost:5173
cd backend && node src/index.js  # 后端 API 服务器 → http://localhost:3001

# 构建
npm run build               # 构建前端
npm run electron:dist       # 构建安装包
```

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 7 |
| 样式 | Tailwind CSS 4 + CSS Variables |
| 桌面端 | Electron 42 |
| 后端 | Express + SQLite (sql.js) |
| AI | 多供应商适配（DeepSeek / Anthropic / 智谱 / 硅基流动 等）|
| 自动更新 | electron-updater + GitHub Releases |

## 项目结构

```
workit/
├── electron/          # Electron 主进程
│   ├── main.js        # 窗口管理、后端启动、自动更新
│   └── preload.js     # 上下文桥接 API
├── src/               # 前端源码
│   ├── pages/         # 页面组件
│   ├── components/    # 通用组件
│   └── context/       # React Context
├── backend/           # 后端 API
│   ├── src/
│   │   ├── db/        # SQLite 数据库初始化与迁移
│   │   ├── routes/    # API 路由（需求/文档/MCP/模型）
│   │   └── index.js   # Express 入口
│   └── static/        # 文件上传存储目录
├── public/            # 静态资源（图标等）
└── scripts/           # 工具脚本
```

## 构建与发布

每次推送 `master` 分支自动触发 GitHub Actions 构建：

1. 安装依赖 → 构建前端 → 构建 Electron 安装包
2. 生成 NSIS 安装包 + 完整运行目录 ZIP
3. 上传至 GitHub Releases

版本号使用 GitHub Actions `run_number` 自动生成。

## 许可证

Apache-2.0
