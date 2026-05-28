# Workit 桌面应用 — 性能分析报告

> **分析人**: 严过关（QA 工程师）
> **分析日期**: 2025-05-27
> **目标版本**: v1.0.8
> **技术栈**: Electron 42 + React 19 + TypeScript + Vite + sql.js

---

## 一、总体概况

| 指标 | 当前值 | 评估 |
|------|--------|------|
| JS Bundle 大小 | 1.2 MB（单文件） | ⚠️ 偏大 |
| CSS Bundle 大小 | 31 KB | ✅ 良好 |
| 首屏加载方式 | 全量加载（无懒加载） | ❌ 需优化 |
| 代码分割 | 无 | ❌ 需优化 |
| React 性能优化 | 无 React.memo/useMemo/useCallback | ⚠️ 可改进 |
| IPC 通信 | 单次查询，无批处理 | ⚠️ 可改进 |
| 数据库查询 | 多次独立 COUNT 查询 | ⚠️ 可合并 |

---

## 二、发现的问题清单

### P0 — 关键问题（影响用户体验和启动性能）

#### P0-01: 1.2MB 单文件 JS Bundle，零代码分割

**位置**: `dist/assets/index-BuLVdEMG.js`

**现状**:
- 整个应用打包为一个 1.2MB 的 JS 文件
- `recharts`（~300KB）、`@tiptap/react`（~200KB）、`lucide-react`（~200KB）全部打包进主 bundle
- `src/pages/Index.tsx` 第 4-11 行，所有页面组件被静态 import，Vite 无法做 tree-shaking 级别的拆分

**影响**:
- 应用启动时需解析和执行全部 1.2MB JS
- 即使用户只访问仪表盘，也加载了知识库编辑器（Tiptap）、洞察分析图表（Recharts）等
- 对低配机器（如 4GB 内存 Windows 笔记本），启动时间可感知延迟

**优化建议**:
```tsx
// 使用 React.lazy + Suspense 进行路由级代码分割
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Requirements = lazy(() => import('./pages/Requirements'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Insights = lazy(() => import('./pages/Insights'));
const MCP = lazy(() => import('./pages/MCP'));
const Model = lazy(() => import('./pages/Model'));
const Messages = lazy(() => import('./pages/Messages'));
const Settings = lazy(() => import('./pages/Settings'));
```

同时在 `vite.config.ts` 中添加 manualChunks:
```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-charts': ['recharts'],
        'vendor-editor': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image', '@tiptap/extension-placeholder'],
        'vendor-icons': ['lucide-react'],
        'vendor-utils': ['dompurify', 'sonner'],
      },
    },
  },
},
```

**预期收益**: 首屏 JS 从 1.2MB 降到 ~300KB（仅仪表盘所需），其他页面按需加载。

---

#### P0-02: Dashboard 统计查询存在 N+1 模式

**位置**: `electron/main.cjs` 第 321-355 行

**现状**:
```js
// dashboard/stats: 5 次独立 COUNT 查询
const total = query('SELECT COUNT(*) FROM requirements')[0][0];
const completed = query("SELECT COUNT(*) FROM requirements WHERE status='已完成'")[0][0];
const inProgress = query("SELECT COUNT(*) FROM requirements WHERE status='实现中'")[0][0];
const docCount = query('SELECT COUNT(*) FROM documents')[0][0];
// 每次 query() 打开 → bind → step loop → free
```

同样的问题在 `insights/ai-insights` POST 中更严重（9 次独立查询，第 378-386 行）。

**影响**:
- sql.js 是内存数据库，虽然每次查询很快（微秒级），但 5-9 次独立的 prepare/bind/step/free 循环仍有开销
- 当数据量增大到数千条时，每次 COUNT 都需要全表扫描

**优化建议**:
```js
// 合并为一条 SQL
case 'dashboard/stats': {
  const stats = query(`
    SELECT
      (SELECT COUNT(*) FROM requirements) as total,
      (SELECT COUNT(*) FROM requirements WHERE status='已完成') as completed,
      (SELECT COUNT(*) FROM requirements WHERE status='实现中') as in_progress,
      (SELECT COUNT(*) FROM documents) as doc_count
  `)[0];
  // ...
}
```

**预期收益**: 将 5 次 DB 交互减少为 1 次，减少 IPC round-trip。

---

#### P0-03: Tiptap 编辑器在非编辑场景下也被实例化

**位置**: `src/pages/Knowledge.tsx` 第 111 行

**现状**:
```tsx
const editor = useEditor({
  extensions: [StarterKit.configure({...}), Placeholder.configure({...}), Image.configure({...})],
  content: '',
  onUpdate: ({ editor }) => setShowEdit(prev => prev ? ({ ...prev, content: editor.getHTML() }) : prev),
});
```

`useEditor()` 在组件顶层被无条件调用，即使是浏览文档列表视图时也会创建一个完整的 ProseMirror 编辑器实例。

**影响**:
- ProseMirror + StarterKit + Image plugin 的初始化有相当的内存和 CPU 开销
- 在列表视图中完全不需要编辑器

**优化建议**:
```tsx
// 只在编辑视图中延迟创建编辑器
const [editorEnabled, setEditorEnabled] = useState(false);
const editor = useEditor({
  // ... same config
}, [editorEnabled]); // 依赖 editorEnabled

// 在进入编辑模式时：
useEffect(() => {
  if (initialView === 'knowledge-create' || initialView === 'knowledge-edit') {
    setEditorEnabled(true);
  }
}, [initialView]);
```

或者在组件内部做条件渲染，将编辑器提取为独立组件。

**预期收益**: 浏览文档列表时节省 ~200KB 的编辑器运行时内存和初始化时间。

---

#### P0-04: Requirements 状态统计每次渲染都重新计算

**位置**: `src/pages/Requirements.tsx` 第 267-272 行

**现状**:
```tsx
{requirements.filter(r => r.status === '待评估').length}
{requirements.filter(r => r.status === '设计中').length}
{requirements.filter(r => r.status === '实现中').length}
{requirements.filter(r => r.status === '测试中').length}
{requirements.filter(r => r.status === '已完成').length}
```

5 次 O(n) 遍历在每次渲染时都执行（每次搜索输入变化、切换筛选都会触发）。

**影响**:
- 当需求数量达到数百条时，每次渲染进行 5 次全量遍历
- 这是典型的不必要重复计算

**优化建议**:
```tsx
const statusCounts = useMemo(() => {
  const counts: Record<string, number> = { '待评估': 0, '设计中': 0, '实现中': 0, '测试中': 0, '已完成': 0 };
  requirements.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  return counts;
}, [requirements]);
```

**预期收益**: 从 O(5n) 降低到 O(n)，在 500 条需求下效果显著。

---

### P1 — 高优先级问题

#### P1-01: React 组件缺少 memo 优化

**位置**: 所有页面组件

**现状**:
- `Dashboard`、`Requirements`、`Knowledge`、`Insights` 等均未使用 `React.memo`
- Dashboard 包含 Recharts 图表（AreaChart + BarChart），每次父组件 Index 的 state 变化都会触发 Dashboard 的 re-render
- 实际上如果 props 没变，不需要 re-render

**优化建议**:
```tsx
// 对包含图表的组件使用 memo
const Dashboard = memo(function Dashboard({ onOpenSubTab }: DashboardProps) { ... });

// 对列表项组件提取并使用 memo
const RequirementCard = memo(function RequirementCard({ req, onClick }: {...}) { ... });
```

**预期收益**: 减少不必要的 re-render，特别是在 tab 切换和 sidebar 交互时。

---

#### P1-02: 搜索输入缺少防抖

**位置**: 
- `src/pages/Requirements.tsx` 第 226 行
- `src/pages/Knowledge.tsx` 第 554 行

**现状**:
```tsx
<input ... value={search} onChange={(e) => setSearch(e.target.value)} />
```

每次按键都触发 state 更新 → 重新渲染 → 重新过滤列表。

**影响**:
- 快速输入时（如 "用户端需求"），触发 5 次 state 更新和过滤计算
- 在需求列表中还要触发 5×5=25 次 `.filter()` 状态统计计算

**优化建议**:
```tsx
const [searchInput, setSearchInput] = useState('');
const [search, setSearch] = useState('');

// 300ms 防抖
useEffect(() => {
  const timer = setTimeout(() => setSearch(searchInput), 300);
  return () => clearTimeout(timer);
}, [searchInput]);
```

**预期收益**: 减少 70% 以上的中间态渲染。

---

#### P1-03: IPC 通信中的日志同步写盘

**位置**: `electron/main.cjs` 第 47-52 行

**现状**:
```js
function log(msg, err) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}${err ? ': ' + (err.message || err) : ''}\n`);
}
```

每次 `log()` 调用都是同步文件写入。在 dev 模式下，每个渲染进程的 `console.log` 都会触发 IPC（第 733-735 行），进而产生大量日志写入。

**影响**:
- 同步 I/O 阻塞 Node.js 事件循环
- 高频日志场景下（如快速操作），可能造成 UI 卡顿

**优化建议**:
```js
let logBuffer = [];
let logTimer = null;

function log(msg, err) {
  logBuffer.push(`[${new Date().toISOString()}] ${msg}${err ? ': ' + (err.message || err) : ''}`);
  if (!logTimer) {
    logTimer = setTimeout(() => {
      const batch = logBuffer.join('\n') + '\n';
      logBuffer = [];
      logTimer = null;
      fs.appendFile(logPath, batch, () => {}); // async
    }, 1000);
  }
}
```

**预期收益**: 消除同步 I/O 阻塞，日志场景不再影响 UI 响应。

---

#### P1-04: Vite 构建缺少压缩和资源优化配置

**位置**: `vite.config.ts`

**现状**:
- 无 `build.minify` 配置（默认 esbuild，尚可）
- 无 `build.cssCodeSplit`
- 无 `build.chunkSizeWarningLimit` 调整
- 无 gzip/brotli 压缩插件
- 无 `rollupOptions.output.manualChunks`

**优化建议**:
```ts
build: {
  target: 'es2022',
  cssCodeSplit: true,
  chunkSizeWarningLimit: 500,
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'charts': ['recharts'],
        'editor': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image', '@tiptap/extension-placeholder'],
        'icons': ['lucide-react'],
      },
    },
  },
},
```

**预期收益**: 更好的缓存策略，vendor 代码不会随业务代码变化而失效。

---

#### P1-05: Knowledge 页面存在重复代码 — 标签页模式和侧边栏模式

**位置**: `src/pages/Knowledge.tsx`

**现状**:
- 文档详情面板有两份几乎完全相同的实现：
  - Tab mode: 第 369-433 行
  - Side panel: 第 632-703 行
- 编辑器面板也有两份：
  - Tab mode: 第 437-484 行
  - Modal mode: 第 706-779 行

**影响**:
- 增加 bundle 大小（重复的 JSX 代码）
- 维护成本高，修改需要同步两处
- 重复的 `dangerouslySetInnerHTML` + DOMPurify 调用

**优化建议**:
提取为独立的 `DocumentDetailPanel` 和 `DocumentEditorPanel` 组件，通过 props 控制布局差异。

**预期收益**: 减少约 200 行重复代码，减小 bundle 约 5-8KB。

---

#### P1-06: ThemeProvider 双重初始化渲染

**位置**: `src/context/ThemeContext.tsx` 第 78-87 行和第 14-25 行

**现状**:
- `useState` 初始化时（第 14-18 行）已读取 localStorage 确定初始值
- `useEffect`（第 78-87 行）在 mount 时又一次调用 `applyTheme`
- 两次调用在相同参数下重复设置 DOM 属性

**优化建议**:
移除 mount effect 中的 applyTheme 调用，或合并到初始化逻辑中。

---

### P2 — 中优先级问题

#### P2-01: AuthContext 缺少 Context value 缓存

**位置**: `src/context/AuthContext.tsx` 第 35-39 行

**现状**:
```tsx
return (
  <AuthContext.Provider value={{ user, setUser, isLoading }}>
    {children}
  </AuthContext.Provider>
);
```

每次渲染都创建新的 value 对象，即使 user/isLoading/setUser 都没变。

**优化建议**:
```tsx
const value = useMemo(() => ({ user, setUser, isLoading }), [user, isLoading]);
```

#### P2-02: API Key 解密在 render 路径中执行

**位置**: `electron/main.cjs` 第 636 行的 `handleModels GET`

**现状**:
```js
apiKey: r[4] ? (() => {
  try { const dec = decryptApiKey(r[4]); return '******' + (dec ? dec.slice(-4) : ''); } catch { return '******'; }
})() : '',
```

每次 GET 请求都会对每个模型的 API Key 进行解密操作。如果 safeStorage 解密较慢（涉及系统密钥链），可能影响响应速度。

**优化建议**:
预解密并缓存，仅在 API Key 更新时重新解密。

#### P2-03: 无离线支持/Service Worker

**现状**: 应用无 Service Worker 或缓存策略，所有数据依赖 IPC 实时查询。

**优化建议**:
- 对仪表盘统计数据添加简单的内存缓存（已有 `insightsCache`，可扩展）
- 添加 localStorage 缓存层，5 分钟内不重复查询
- 对知识库文档列表添加 LRU 缓存

#### P2-04: lucide-react 全量导入

**位置**: `vite.config.ts` 第 13-15 行

**现状**:
```ts
const lucideIconNames = Object.keys(lucide).filter(
  (k) => /^[A-Z]/.test(k) && k.endsWith("Icon")
);
```

虽然 auto-import 不需要在代码中显式 import，但 `lucide-react` 的整个模块仍然被打包进 bundle。实际上只有部分图标被使用（约 30-40 个）。

**优化建议**:
- 确认 `lucide-react` 是否支持 tree-shaking（v0.555 最新版默认支持）
- 如果 bundle 中仍包含未使用的图标，考虑使用 `lucide-react/dist/esm` 直接路径导入

#### P2-05: 缺少关键渲染路径优化

**位置**: `index.html`

**现状**:
- 无 `<link rel="preload">` 预加载关键资源
- 无 `<link rel="modulepreload">`（Vite 会自动注入，但在生产环境中可进一步优化）
- 启动加载动画只是 CSS spinner，无骨架屏

**优化建议**:
添加骨架屏或至少对首屏关键路径资源做 preload 标记。

---

## 三、优化路线图

### 第一阶段（1-2 天，改善启动性能 ~60%）

| 优先级 | 任务 | 预期文件变化 |
|--------|------|-------------|
| P0-01 | 添加 React.lazy + Suspense 代码分割 | `Index.tsx` |
| P0-01 | 配置 Vite manualChunks | `vite.config.ts` |
| P0-03 | 延迟初始化 Tiptap 编辑器 | `Knowledge.tsx` |
| P1-04 | Vite 构建优化（target/cssCodeSplit） | `vite.config.ts` |

### 第二阶段（2-3 天，改善运行时性能 ~30%）

| 优先级 | 任务 | 预期文件变化 |
|--------|------|-------------|
| P0-02 | 合并 Dashboard SQL COUNT 查询 | `main.cjs` |
| P0-04 | useMemo 缓存状态统计 | `Requirements.tsx` |
| P1-01 | React.memo 包裹关键组件 | `Dashboard.tsx`, `Requirements.tsx` |
| P1-02 | 搜索输入防抖 | `Requirements.tsx`, `Knowledge.tsx` |
| P2-01 | AuthContext value useMemo | `AuthContext.tsx` |

### 第三阶段（2-3 天，长期优化）

| 优先级 | 任务 | 预期文件变化 |
|--------|------|-------------|
| P1-03 | 日志异步批处理写入 | `main.cjs` |
| P1-05 | 提取重复面板为独立组件 | `Knowledge.tsx` |
| P1-06 | ThemeProvider 去重初始化 | `ThemeContext.tsx` |
| P2-02 | API Key 解密缓存 | `main.cjs` |
| P2-03 | 添加数据缓存层 | `main.cjs` |

---

## 四、附录：Bundle 审计

### 当前 Bundle 组成（估算）

| 模块 | 大小 | 可优化 |
|------|------|--------|
| React + ReactDOM | ~130KB | 独立 chunk |
| react-router-dom | ~30KB | 独立 chunk |
| recharts + d3 sub-deps | ~300KB | 独立 chunk，懒加载 |
| @tiptap + extensions | ~200KB | 独立 chunk，懒加载 |
| lucide-react（全量） | ~200KB | tree-shaking 可降 ~80% |
| dompurify | ~50KB | 独立 chunk |
| 业务代码 | ~290KB | 按路由拆分 |

**优化后目标**:
- 首屏加载（仪表盘）: ~350KB JS
- 其他页面按需加载: 各 50-150KB
- 总 bundle 不变，但首屏体积减少 ~70%

---

*报告结束。如需对任何问题深入分析或讨论优化方案细节，请随时联系。*
