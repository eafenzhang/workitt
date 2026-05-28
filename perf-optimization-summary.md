# Workit 性能优化报告

## 构建结果对比

| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| 首屏主入口 | ~1.2 MB (单文件) | **86 kB** (gzip 23 kB) | **~93% ↓** |
| 总构建大小 | ~1.2 MB (单文件) | ~1.27 MB (13 chunks) | 拆分后并行加载 |
| 首次加载时间估算 | ~2-3s | ~0.3-0.5s | **~6x 快** |

### Chunk 分布

```
dist/assets/index-BjDgMqDV.js             86.17 kB │ gzip:  22.85 kB  ← 首屏主入口
dist/assets/Knowledge-stQiNXd7.js          71.16 kB │ gzip:  17.96 kB  ← lazy
dist/assets/Settings-CRweTfJd.js           16.49 kB │ gzip:   8.13 kB  ← lazy
dist/assets/Model-DnlxsvzS.js              12.70 kB │ gzip:   3.58 kB  ← lazy
dist/assets/Insights-Caa6LC_A.js            8.87 kB │ gzip:   2.62 kB  ← lazy
dist/assets/MCP-CT9T2wR_.js                 8.33 kB │ gzip:   2.14 kB  ← lazy
dist/assets/Messages-B2FnT0Ut.js            0.59 kB │ gzip:   0.40 kB  ← lazy
dist/assets/vendor-react-C4VFeA03.js       281.58 kB │ gzip:  89.38 kB  ← 共享
dist/assets/vendor-tiptap-BW6mkQku.js      366.01 kB │ gzip: 116.36 kB  ← 共享
dist/assets/vendor-recharts-CG_uriOA.js    385.15 kB │ gzip: 104.86 kB  ← 共享
dist/assets/index-CUSbWQA4.css             31.35 kB │ gzip:   6.79 kB
```

---

## P0 优化（已实施）

### 1. React.lazy 代码分割

**文件**: `src/pages/Index.tsx`

- Dashboard 和 Requirements（最高频页面）保持同步加载
- Knowledge, Insights, MCP, Model, Messages, Settings 改为 `React.lazy(() => import(...))`
- 添加通用 `<Lazy>` wrapper 组件，提供统一的 `<Suspense fallback={加载动画}>`
- 首屏 JS 从 ~1.2 MB 降至 ~86 kB

### 2. Vite manualChunks 分包

**文件**: `vite.config.ts`

- 使用函数式 `manualChunks(id)` 按依赖来源分包
- vendor-react: react, react-dom, react-router-dom
- vendor-recharts: recharts
- vendor-tiptap: @tiptap/* 全家桶
- vendor-ui: @radix-ui/* 组件库
- vendor-icons: lucide-react
- vendor-utils: sql.js, jszip, file-saver

### 3. Dashboard SQL 合并（N+1 优化）

**文件**: `electron/main.cjs` (dashboard/stats handler)

- 原来 4 次独立 COUNT 查询 → 1 次聚合 SQL + 1 次文档 COUNT
- 使用 `SUM(CASE WHEN ...)` 在一次扫描中获取 total/completed/inProgress
- 减少 2 次 round-trip

```sql
-- 旧: 4 条查询
SELECT COUNT(*) FROM requirements
SELECT COUNT(*) FROM requirements WHERE status='已完成'
SELECT COUNT(*) FROM requirements WHERE status='实现中'
SELECT COUNT(*) FROM documents

-- 新: 2 条查询
SELECT COUNT(*), SUM(CASE WHEN status='已完成' THEN 1...), SUM(CASE WHEN status='实现中' THEN 1...) FROM requirements
SELECT COUNT(*) FROM documents
```

### 4. Requirements 状态统计 useMemo

**文件**: `src/pages/Requirements.tsx`

- 6 个 `requirements.filter().length` 计算改为 `useMemo(() => [...], [requirements])`
- 避免每次 render 重复计算状态统计数组
- 仅在 requirements 数据变化时重新计算

---

## P1 优化（已实施）

### 5. React.memo 页面组件

**文件**: `src/pages/Dashboard.tsx`, `src/pages/Requirements.tsx`, `src/pages/Insights.tsx`

- 三个核心页面组件添加 `export default memo(Component)`
- 当 props 未变化时跳过 re-render

### 6. 搜索输入 300ms 防抖

**文件**: `src/pages/Requirements.tsx`, `src/pages/Knowledge.tsx`

- 新增 `searchInput` 本地状态（即时响应输入）
- `useEffect` 中 300ms setTimeout 延迟更新实际 `search` 状态
- 减少高频输入时的列表重过滤和 API 请求

### 7. IPC 日志异步写盘

**文件**: `electron/main.cjs`

- `log()` 函数: `fs.appendFileSync` → `fs.appendFile(path, data, callback)`
- `uncaughtException` 处理器同样改为异步
- 避免日志写入阻塞主进程事件循环

---

## P2 优化（已实施）

### 8. Tiptap 编辑器懒初始化

**文件**: `src/pages/Knowledge.tsx`

- `useEditor` 仅在 `showEdit !== null`（编辑/创建视图）时创建编辑器实例
- 传入 `null` 配置 + `[isEditing]` 依赖数组，非编辑时 Editor 不初始化
- 编辑器的 StarterKit / Placeholder / Image 扩展仅在需要时加载
- **注意**: html-duration-picker.js 第三方库警告来自外部依赖，不影响功能

### 9. ThemeContext 值稳定化

**文件**: `src/context/ThemeContext.tsx`

- Context value 用 `useMemo` 包裹，依赖 `[theme, resolvedTheme, setTheme, resolvedAccent]`
- 避免每次 Provider render 都创建新对象引用，减少消费者不必要的 re-render

---

## 验证

- ✅ `npx vite build` 构建通过
- ✅ TypeScript 类型检查通过（无新增错误）
- ✅ 所有页面路由正常工作
- ✅ Lazy loading 正确触发 Suspense fallback

---

## 后续建议

1. **Recharts tree-shaking**: 当前 whole library 打包为 385 kB。可按需导入图表类型。
2. **图片懒加载**: 需求详情中的图片可添加 `loading="lazy"` 属性。
3. **Service Worker 缓存**: 可考虑添加 Workbox 实现 vendor chunk 的离线缓存。
4. **Bundle 分析**: 建议运行 `npx vite build --debug` 或使用 `rollup-plugin-visualizer` 进一步分析。
