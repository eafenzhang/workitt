# Workit P0/P1 修复回归验证报告

**验证人**: QA 工程师 严过关  
**验证日期**: 2025-07-09  
**项目**: Workit 智能体工作台  
**验证范围**: P0（8个）+ P1（10个）共 18 项修复的回归验证  
**构建状态**: ✅ `npm run build` 通过（vite v7.3.3, 2391 modules, 11.61s）  

---

## 一、验证总览

| 类别 | 总数 | 验证通过 | 验证失败 | 新发现问题 |
|------|------|----------|----------|-----------|
| P0 修复 | 8 | 7 | 0 | 1（P1 级别，非阻断） |
| P1 修复 | 10 | 10 | 0 | 0 |
| **合计** | **18** | **17** | **0** | **1** |

---

## 二、P0 修复逐项验证

### P0-01: SQL 注入 — 表名白名单 ✅ PASS
- **文件**: `electron/main.cjs:9, 380`
- **验证**:
  - `ALLOWED_TABLES = ['requirements', 'documents', 'mcp_servers', 'models']` 已定义（行9）
  - `handleDbQuery` default 分支新增 `if (!ALLOWED_TABLES.includes(table))` 校验
  - 覆盖所有4张表的动态查询路径
- **评估**: 白名单覆盖完整，无遗漏表

### P0-02: SQL 注入 — 字段名白名单 ✅ PASS
- **文件**: `electron/main.cjs:14-30`
- **验证**:
  - `MCP_FIELDS` Map 定义了 mcp_servers 表允许更新的6个字段（name, base_url, api_key, enabled, description, endpoint）
  - `MODEL_FIELDS` Map 定义了 models 表允许更新的5个字段（name, api_key, model_id, is_default, enabled）
  - `handleMcp PUT` 和 `handleModels PUT` 均通过 Map.has() 校验字段名
- **评估**: 字段白名单完整，杜绝了通过字段名注入 SQL 的风险

### P0-03: API Key 加密存储 ✅ PASS（含新发现问题）
- **文件**: `electron/main.cjs:155-183, 549, 563`
- **验证**:
  - `encryptApiKey()` 正确使用 `safeStorage.encryptString().toString('base64')` 加密（行155-165）
  - `decryptApiKey()` 使用 `Buffer.from(stored, 'base64')` 解密，catch 回退至明文（行168-183）
  - `handleModels POST` 在存储前调用 `encryptApiKey()`（行549）
  - `handleModels PUT` 在更新时调用 `encryptApiKey()`（行563）
  - `getDefaultModel()` 和 `callAI()` 在使用时调用 `decryptApiKey()` 还原
- **评估**: 加密/解密逻辑正确，向后兼容明文数据
- **⚠️ 新发现问题 REGRESS-01（P1）**: `handleModels GET`（行542）返回 `apiKey: r[4] ? '******' + r[4].slice(-4) : ''`，但 `r[4]` 现在是 base64 编码的加密数据，而非明文 API key。`slice(-4)` 取的是 base64 字符串的最后4个字符，显示无意义内容（如 `******ZW==`），而不是预期的 key 末4位。建议改为 `hasApiKey: !!r[4]` 仅展示是否已配置，不再尝试显示末位字符。

### P0-04: QC 窗口来源校验 ✅ PASS
- **文件**: `electron/main.cjs:266-272`
- **验证**:
  - `db-query` handler 中新增 `event.sender === qcWindow.webContents` 判断
  - 仅允许 QC 窗口执行 `GET` + `requirements` 组合
  - 非 GET/非 requirements 请求被 BLOCKED 并记录日志
- **评估**: 权限限制正确，防止 QC 窗口越权操作

### P0-05: XSS 防护 — DOMPurify ✅ PASS
- **文件**: `src/pages/Knowledge.tsx:10, 410, 424, 677, 691`
- **验证**:
  - `import DOMPurify from 'dompurify'` 已添加（行10）
  - 4处 `dangerouslySetInnerHTML` 全部包裹 `DOMPurify.sanitize()`:
    1. 行410: Office 文件预览 — `DOMPurify.sanitize(previewHtml || '')`
    2. 行424: 文档内容展示（tab模式）— `DOMPurify.sanitize(showDoc.content || '')`
    3. 行677: Office 文件预览（侧边面板）— `DOMPurify.sanitize(previewHtml || '')`
    4. 行691: 文档内容展示（侧边面板）— `DOMPurify.sanitize(showDoc.content || '')`
- **评估**: 所有用户可控 HTML 渲染路径均已消毒，XSS 风险消除

### P0-06: RCE 修复 — executeJavaScript → webContents.send ✅ PASS
- **文件**: `electron/main.cjs:777-781`, `electron/preload.cjs:54-58`, `src/pages/Requirements.tsx:77-81`
- **验证**:
  - main.cjs: `notify-requirements-changed` handler 使用 `webContents.send('requirements-changed')` 替代 `executeJavaScript`
  - preload.cjs: 新增 `onRequirementsChanged` 转发（行54-58），通过 `ipcRenderer.on('requirements-changed', callback)` 监听
  - Requirements.tsx: 使用 `api?.onRequirementsChanged?.(() => fetchRequirements())` 并正确 unsubscribe（行79-80）
- **评估**: 完整消除了 RCE 攻击面，IPC 通道通信安全

### P0-07: 状态推进确认对话框 ✅ PASS
- **文件**: `src/pages/Requirements.tsx:337`
- **验证**:
  - 状态推进按钮已添加 `confirm('确定推进到「${so[ni]}」？')` 确认
  - 用户必须确认才会执行 PUT 请求更新状态
- **评估**: 防止误操作，交互安全性提升

### P0-08: 模型下拉框使用正确 Provider ✅ PASS
- **文件**: `src/pages/Model.tsx:192, 198`
- **验证**:
  - 模型卡片下拉按钮文本使用 `PROVIDER_LIST.find(p => p.id === m.provider)` （行192）
  - 下拉列表也使用 `PROVIDER_LIST.find(p => p.id === m.provider)` 获取模型列表（行198）
  - 不再使用 `form.provider`（仅新建/编辑表单使用）
- **评估**: 修复正确，下拉列表现在展示与当前模型对应供应商的模型

---

## 三、P1 修复逐项验证

### P1-01: 防抖保存 + 原子写入 ✅ PASS
- **文件**: `electron/main.cjs:118-131`
- **验证**:
  - `debouncedSaveDb()` 使用 200ms debounce 替代同步 `saveDb()`
  - `saveDb()` 实现 tmp+rename 原子写入模式
  - `run()` 调用 `debouncedSaveDb()` 替代 `saveDb()`
- **评估**: 防止高频写入和写入中断导致的数据损坏

### P1-02: 数据库 null 安全 ✅ PASS
- **文件**: `electron/main.cjs:139, 149`
- **验证**:
  - `query()` 添加 `if (!db) return []` 检查
  - `run()` 添加 `if (!db) return` 检查
- **评估**: 防止 DB 未初始化时的空指针异常

### P1-03: 修复错误表名 documents → models ✅ PASS
- **文件**: `electron/main.cjs:553`
- **验证**:
  - `handleModels POST` 返回值改为 `SELECT MAX(id) FROM models`
- **评估**: 修复正确，新建模型后能正确返回 ID

### P1-04: 修复文档浏览量双重递增 ✅ PASS
- **文件**: `electron/main.cjs:589`
- **验证**:
  - `formatDoc` 中 `views: r[5]` 替代了旧的 `r[5]+1`
  - 浏览量在 SQL 层已做 +1（`handleDocuments GET /:id` 中 `UPDATE documents SET views=views+1`）
- **评估**: 不再双重计数

### P1-05: onMaximizeChange 返回 unsubscribe ✅ PASS
- **文件**: `electron/preload.cjs:14-18`, `src/components/TitleBar.tsx:19-22`
- **验证**:
  - preload: `onMaximizeChange` 返回 `() => ipcRenderer.removeListener('maximize-change', handler)`
  - TitleBar.tsx: useEffect 中 `const unsub = api?.onMaximizeChange?.(...)` 并在 cleanup `if (unsub) unsub()`
- **评估**: 内存泄漏修复完整

### P1-06: 更新事件 unsubscribe ✅ PASS
- **文件**: `electron/preload.cjs:28-42`, `src/pages/Settings.tsx:29-43`
- **验证**:
  - preload: `onUpdateAvailable`, `onUpdateProgress`, `onUpdateDownloaded` 均返回 unsubscribe 函数
  - Settings.tsx: 收集到 `unsubs[]` 数组，cleanup 时 `unsubs.forEach(fn => fn())`
- **评估**: 3个事件监听器均正确清理

### P1-07: callAI 超时保护 ✅ PASS
- **文件**: `electron/main.cjs:230`
- **验证**:
  - fetch 调用添加 `signal: AbortSignal.timeout(30000)` 
  - 30秒超时后自动中断请求
- **评估**: 防止 AI API 无响应导致进程挂起

### P1-08: Anthropic API 认证头修复 ✅ PASS
- **文件**: `electron/main.cjs:215-219, 746-751`
- **验证**:
  - `callAI()`: 检测 `isAnthropic`，设置 `headers['x-api-key']` + `headers['anthropic-version'] = '2023-06-01'`
  - `test-model-connection`: 同样区分 Anthropic 和 OpenAI 风格认证
- **评估**: 修复正确，Anthropic API 不再使用 Bearer 认证

### P1-09: IPC 方法白名单 ✅ PASS
- **文件**: `electron/main.cjs:12, 264`
- **验证**:
  - `ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE']`
  - `db-query` handler 开头验证 `if (!ALLOWED_METHODS.includes(method))`
- **评估**: 防止非法方法绕过

### P1-10: 数据库损坏恢复 ✅ PASS
- **文件**: `electron/main.cjs:60-81`
- **验证**:
  - initDatabase 包裹 try/catch
  - 损坏时备份为 `.corrupt.{timestamp}` 文件
  - 创建新的空数据库并初始化 schema
  - 完整性检查 `db.prepare('SELECT 1').step().free()`
- **评估**: 损坏恢复逻辑健壮

---

## 四、构建验证

```
$ npx vite build
✓ 2391 modules transformed.
dist/index.html                     0.65 kB
dist/assets/index-Bh1mfkpy.css     31.10 kB
dist/assets/index-ClGp2y8t.js   1,234.42 kB
✓ built in 11.61s
```

**构建结果**: ✅ 通过，无编译错误、无类型错误

---

## 五、新发现问题

### REGRESS-01（P1）: handleModels GET 显示加密后的 API Key 末位无意义
- **文件**: `electron/main.cjs:542`
- **当前代码**: `apiKey: r[4] ? '******' + r[4].slice(-4) : ''`
- **问题**: P0-03 修复后，`r[4]`（数据库 `api_key` 字段）存储的是 `safeStorage.encryptString().toString('base64')` 的结果，即 base64 编码的加密密文。`slice(-4)` 取到的是 base64 字符末尾（如 `==`、`YW==`），而非用户原始 API Key 的最后4位。
- **影响**: 前端 Model 页面展示的 API Key 遮罩显示为乱码，用户体验不佳，但不影响功能（API Key 加密存储和正确解密使用均正常）。
- **建议修复**: 将行542改为 `apiKey: r[4] ? '******' : ''`，仅展示是否已配置 API Key，不再尝试显示末位字符。或解密后取末4位：`apiKey: r[4] ? '******' + decryptApiKey(r[4]).slice(-4) : ''`。
- **路由决策**: **Send To: Engineer** — 源代码问题，需工程师修改 main.cjs:542

---

## 六、路由决策

| 决策 | 目标 | 说明 |
|------|------|------|
| ✅ 17/18 修复验证通过 | NoOne | 无需额外操作 |
| ⚠️ 1 个新问题 REGRESS-01 | Engineer | `main.cjs:542` API Key 显示逻辑需修复 |
| 总体判定 | **有条件通过** | P0 全部验证通过，仅 REGRESS-01 为 P1 非阻断问题 |

---

## 七、已知遗留问题（从初始 QA 报告继承，本轮未修复）

| ID | 优先级 | 描述 | 状态 |
|----|--------|------|------|
| BUG-003 | P2 | 并发 MAX(id) 竞态条件 | 已知限制（sql.js 单进程限制） |
| BUG-005 | P2 | AI 总结为空时丢弃有效标签 | 未修复 |
| BUG-006 | P2 | 上传文件统一 .bin 扩展名 | 未修复 |
| BUG-007 | P2 | 异常返回空数组 [] 而非错误对象 | 未修复 |
| BUG-009 | P2 | 编辑模型不更新 provider/baseUrl | 未修复 |
| BUG-011 | P2 | 需求更新丢失字段 | 未修复 |

以上 P2 问题均不在本轮修复范围内，建议后续迭代处理。

---

**验证轮次**: Round 1 / 2（最大2轮）  
**验证结论**: P0 修复全部验证通过 ✅，P1 修复全部验证通过 ✅，发现1个 P1 级别新问题 REGRESS-01（API Key 遮罩显示），建议工程师修复。
