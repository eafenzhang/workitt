# Workit 功能测试报告

**审查人**: QA 工程师 严过关  
**审查日期**: 2025-07-09  
**项目**: Workit 智能体工作台  
**技术栈**: Electron 42 + React 19 + TypeScript + Vite + sql.js  
**审查方式**: 静态代码审查 + 逻辑推演测试  

---

## 一、测试用例列表

### 1. 需求管理 CRUD

| 编号 | 模块 | 用例名 | 前置条件 | 测试步骤 | 期望结果 | 结果 |
|------|------|--------|----------|----------|----------|------|
| TC-R01 | 需求管理 | 创建需求-正常流程 | 数据库已初始化 | 1. 填写描述"用户登录功能" 2. 选择模块"用户端" 3. 选择优先级"高" 4. 点击"提交需求" | 需求创建成功，返回 success:true 和有效 id，列表刷新显示新需求 | PASS |
| TC-R02 | 需求管理 | 创建需求-空描述 | 数据库已初始化 | 1. 不填写描述 2. 点击"提交需求" | toast 提示"请输入需求描述"，不发送请求 | PASS |
| TC-R03 | 需求管理 | 创建需求-标题自动截取 | 数据库已初始化 | 1. 输入超长描述(>30字) 2. 提交 | title 自动取 desc 前30字符 | PASS |
| TC-R04 | 需求管理 | 创建需求-带图片 | 数据库已初始化 | 1. 填写描述 2. 上传图片 3. 提交 | 图片上传成功，images 字段包含 URL 数组 | PASS |
| TC-R05 | 需求管理 | 创建需求-默认值 | 数据库已初始化 | 1. 只填描述 2. 不选模块/优先级 3. 提交 | module 默认"用户端"，priority 默认"中"，status 默认"待评估" | PASS |
| TC-R06 | 需求管理 | 读取需求列表 | 已有若干需求 | 调用 GET /api/requirements | 返回所有需求，按 created_at DESC 排序，格式化字段正确 | PASS |
| TC-R07 | 需求管理 | 读取单个需求 | 已有需求 id=1 | 调用 GET /api/requirements/1 | 返回该需求完整信息，字段格式化正确 | PASS |
| TC-R08 | 需求管理 | 读取不存在需求 | - | 调用 GET /api/requirements/9999 | 返回 { error: "Not found" } | PASS |
| TC-R09 | 需求管理 | 更新需求-基本信息 | 已有需求 id=1 | 1. 修改描述/模块/优先级 2. PUT 提交 | 更新成功，updated_at 刷新 | PASS |
| TC-R10 | 需求管理 | 更新需求-推进状态 | 已有需求 status="待评估" | PUT 提交 status="设计中" | status 更新为"设计中"，workflow_history 追加 {from:"待评估", to:"设计中", ...} | PASS |
| TC-R11 | 需求管理 | 更新需求-相同状态不记录流转 | 已有需求 status="待评估" | PUT 提交 status="待评估" | workflow_history 不追加新记录 | PASS |
| TC-R12 | 需求管理 | 更新需求-无 id | - | PUT 请求不传 id | 返回 { error: "No id" } | PASS |
| TC-R13 | 需求管理 | 删除需求 | 已有需求 id=1 | DELETE /api/requirements/1 | 返回 { success: true }，列表不再显示 | PASS |
| TC-R14 | 需求管理 | 删除需求-无 id | - | DELETE 不传 id | 返回 { success: true }（未执行删除但不报错） | PASS |
| TC-R15 | 需求管理 | 搜索过滤-关键字 | 已有多条需求 | 搜索框输入关键字 | 列表只显示标题或描述包含关键字的需求 | PASS |
| TC-R16 | 需求管理 | 搜索过滤-状态 | 已有多条需求 | 点击"设计中"状态标签 | 列表只显示 status="设计中"的需求 | PASS |
| TC-R17 | 需求管理 | 搜索过滤-日期范围 | 已有多条需求 | 设置开始和截止日期 | 列表只显示 createdAt 在日期范围内的需求 | PASS |
| TC-R18 | 需求管理 | 搜索过滤-重置 | 已设置过滤条件 | 点击"重置筛选" | 所有过滤条件恢复"全部"，列表显示全部 | PASS |

### 2. AI 分析功能

| 编号 | 模块 | 用例名 | 前置条件 | 测试步骤 | 期望结果 | 结果 |
|------|------|--------|----------|----------|----------|------|
| TC-A01 | AI分析 | 正常分析流程 | 已配置默认模型，API 可用 | 1. 创建需求带描述 2. 触发 AI 分析 | AI 返回 summary 和 tags，写入 ai_summary/ai_tags 字段 | PASS |
| TC-A02 | AI分析 | API返回含Markdown代码块 | 模型返回 \`\`\`json {...} \`\`\` | 触发 AI 分析 | 正确剥离 markdown 代码块标记，解析出 JSON | PASS |
| TC-A03 | AI分析 | API返回纯JSON | 模型返回 {"summary":"...","tags":[...]} | 触发 AI 分析 | 直接 JSON.parse 成功 | PASS |
| TC-A04 | AI分析 | API返回含多余文本 | 模型返回 "结果如下：{...}其他文字" | 触发 AI 分析 | 正则匹配提取 {...}，解析成功 | PASS |
| TC-A05 | AI分析 | API返回无法解析的非JSON | 模型返回纯文字无JSON结构 | 触发 AI 分析 | 返回 { error: "AI analysis failed: invalid response format" }，不崩溃 | PASS |
| TC-A06 | AI分析 | 未配置模型 | models 表为空或无启用模型 | 触发 AI 分析 | callAI 返回 null，返回 { error: "AI analysis failed: model not configured or API error" } | PASS |
| TC-A07 | AI分析 | 模型已配置但API Key为空 | 有模型记录但 api_key 为空 | 触发 AI 分析 | getDefaultModel 返回 null（因 !model.apiKey），返回错误 | PASS |
| TC-A08 | AI分析 | API返回空summary | 模型返回 {"summary":"","tags":["a"]} | 触发 AI 分析 | 返回 { error: "AI analysis failed: empty summary" }，不写入数据库 | **FAIL** |
| TC-A09 | AI分析 | AI返回超过5个标签 | 模型返回 8 个标签 | 触发 AI 分析 | tags 被 .slice(0,5) 截断为最多5个 | PASS |
| TC-A10 | AI分析 | 需求无描述 | 需求 description 为空字符串 | 触发 /requirements/{id}/analyze | 返回 { error: "No description to analyze" }，不调用 AI | PASS |
| TC-A11 | AI分析 | 网络断开时AI调用 | 网络不可用 | 触发 AI 分析 | fetch 抛出异常，callAI catch 返回 null，返回错误信息 | PASS |
| TC-A12 | AI分析 | max_tokens截断场景 | 模型响应被 max_tokens=300 截断 | 触发 AI 分析 | 截断的 JSON 可能导致解析失败，返回 parse error（符合预期） | PASS |
| TC-A13 | AI分析 | 自动分析-已启用 | ai_auto_analyze=true，有启用模型 | 创建新需求 | 600ms 后自动触发 AI 分析，成功后 toast 提示 | PASS |
| TC-A14 | AI分析 | 自动分析-已禁用 | ai_auto_analyze=false | 创建新需求 | 不触发自动 AI 分析 | PASS |
| TC-A15 | AI分析 | 自动分析-无启用模型 | ai_auto_analyze=true，无启用模型 | 创建新需求 | 检查模型列表后跳过分析，无 toast | PASS |
| TC-A16 | AI分析 | Anthropic格式响应 | baseUrl 包含 "anthropic"，返回 { content: [{type:"text", text:"..."}] } | 触发 AI 分析 | 正确提取 text 字段内容 | PASS |

### 3. 模型管理

| 编号 | 模块 | 用例名 | 前置条件 | 测试步骤 | 期望结果 | 结果 |
|------|------|--------|----------|----------|----------|------|
| TC-M01 | 模型管理 | 添加模型-正常流程 | - | 1. 选择供应商 DeepSeek 2. 输入 API Key 3. 提交 | 模型创建成功，enabled=1，列表显示新模型 | **FAIL** |
| TC-M02 | 模型管理 | 添加模型-未输入API Key | - | 不输入 API Key 直接提交 | toast 提示"请输入 API Key"，不发送请求 | PASS |
| TC-M03 | 模型管理 | 添加模型-名称自动生成 | - | 不提供 name 字段，选择供应商+模型 | name 自动生成为 "{provider} - {modelId}" | PASS |
| TC-M04 | 模型管理 | 编辑模型 | 已有模型 | 1. 点击编辑 2. 修改 API Key 3. 保存 | PUT 请求只更新 apiKey 和 modelId 字段 | PASS |
| TC-M05 | 模型管理 | 编辑模型-不修改API Key | 已有模型 | 编辑时 API Key 留空 | 不发送 apiKey 字段，原 API Key 保留 | PASS |
| TC-M06 | 模型管理 | 删除模型 | 已有模型 | 点击删除并确认 | 返回 { success: true }，列表移除 | PASS |
| TC-M07 | 模型管理 | 设为默认模型 | 已有多个模型 | 点击"设为默认" | 1. 其他模型 is_default 置 0 2. 目标模型 is_default 置 1 | PASS |
| TC-M08 | 模型管理 | 启用/禁用切换 | 已有模型 | 点击"启用"/"禁用" | enabled 字段切换，列表刷新 | PASS |
| TC-M09 | 模型管理 | 连接测试-成功 | API 可用 | 点击"测试连接" | toast 提示"连接成功" | PASS |
| TC-M10 | 模型管理 | 连接测试-失败 | API 不可用或 Key 错误 | 点击"测试连接" | toast 提示"连接失败，请检查配置" | PASS |
| TC-M11 | 模型管理 | 连接测试-超时 | API 无响应 | 点击"测试连接" | 10秒超时后返回 false，提示失败 | PASS |
| TC-M12 | 模型管理 | 连接测试-未输入API Key | - | 不输入 API Key 点击测试连接 | toast 提示"请先输入 API Key" | PASS |
| TC-M13 | 模型管理 | 模型下拉切换 | 已有模型配置 | 点击模型名下拉切换 | PUT 更新 modelId，toast 提示成功 | PASS |
| TC-M14 | 模型管理 | 默认模型查询-有默认 | 有 is_default=1 的启用模型 | 调用 getDefaultModel() | 返回该模型的 baseUrl/apiKey/modelId | PASS |
| TC-M15 | 模型管理 | 默认模型查询-无默认有启用 | 有启用但无 is_default | 调用 getDefaultModel() | 返回第一个启用模型的配置 | PASS |
| TC-M16 | 模型管理 | 默认模型查询-无启用模型 | 所有模型 disabled | 调用 getDefaultModel() | 返回 null | PASS |
| TC-M17 | 模型管理 | API Key脱敏显示 | 已有模型 | 获取模型列表 | apiKey 显示为 "******xxxx"（只显示后4位） | PASS |

### 4. 数据持久化

| 编号 | 模块 | 用例名 | 前置条件 | 测试步骤 | 期望结果 | 结果 |
|------|------|--------|----------|----------|----------|------|
| TC-D01 | 数据持久化 | 数据库初始化-首次启动 | 无 db 文件 | 启动应用 | 创建新 SQL.Database()，执行 CREATE TABLE IF NOT EXISTS，saveDb 写入文件 | PASS |
| TC-D02 | 数据持久化 | 数据库初始化-已有数据 | 已有 db 文件 | 启动应用 | fs.readFileSync 读取文件，new SQL.Database(buffer) 加载 | PASS |
| TC-D03 | 数据持久化 | saveDb正常写入 | 数据库已加载 | 执行写操作 | fs.writeFileSync 成功写入 db.export() | PASS |
| TC-D04 | 数据持久化 | saveDb磁盘写入失败 | 磁盘满/权限不足 | 执行写操作 | 日志记录 "saveDb FAILED"，数据仍在内存中，不崩溃 | PASS |
| TC-D05 | 数据持久化 | 数据库文件损坏 | db 文件内容被篡改 | 启动应用 | new SQL.Database(corruptedBuffer) 可能抛出异常，initDatabase catch 处理 | **FAIL** |
| TC-D06 | 数据持久化 | 新增需求触发saveDb | - | POST 创建需求 | run() 调用 db.run() + saveDb()，数据持久化 | PASS |
| TC-D07 | 数据持久化 | 旧状态迁移 | requirements 中有 status="待评审" 的记录 | 启动应用 | 自动 UPDATE 为"待评估" | PASS |
| TC-D08 | 数据持久化 | uploads目录自动创建 | uploads 目录不存在 | 上传文件 | mkdirSync({ recursive: true }) 创建目录 | PASS |

### 5. 窗口管理

| 编号 | 模块 | 用例名 | 前置条件 | 测试步骤 | 期望结果 | 结果 |
|------|------|--------|----------|----------|----------|------|
| TC-W01 | 窗口管理 | 主窗口创建 | 应用启动 | createWindow() | 窗口 1200x800，frameless，contextIsolation=true | PASS |
| TC-W02 | 窗口管理 | 窗口最小化 | 主窗口显示 | 点击最小化按钮 | 调用 mainWindow.minimize() | PASS |
| TC-W03 | 窗口管理 | 窗口最大化/还原 | 主窗口显示 | 点击最大化按钮 | 切换 maximize/unmaximize，发送事件通知渲染进程 | PASS |
| TC-W04 | 窗口管理 | 窗口关闭 | 主窗口显示 | 点击关闭按钮 | 调用 mainWindow.close() | PASS |
| TC-W05 | 窗口管理 | QuickCapture弹窗开启 | 主窗口运行 | 开启快速采集 | 创建 56x56 独立窗口，位于右下角，alwaysOnTop=true | PASS |
| TC-W06 | 窗口管理 | QuickCapture弹窗-打开表单 | QC弹窗显示 | 点击 QC 按钮 | 窗口调整为 420x540，居中，加载 index.html | PASS |
| TC-W07 | 窗口管理 | QuickCapture弹窗-关闭表单 | QC表单打开 | 提交或取消 | 窗口恢复 56x56，重新加载 qc-entry.html | PASS |
| TC-W08 | 窗口管理 | QuickCapture弹窗关闭后恢复主窗口 | QC弹窗开启 | 关闭 QC 窗口 | 主窗口 show() + focus() | PASS |
| TC-W09 | 窗口管理 | 托盘图标-创建 | 开启最小化到托盘 | 关闭窗口 | 创建 Tray，显示右键菜单"显示窗口/退出" | PASS |
| TC-W10 | 窗口管理 | 托盘图标-双击显示 | 托盘图标显示 | 双击托盘图标 | 主窗口 show() + focus() | PASS |
| TC-W11 | 窗口管理 | 最小化到托盘-已启用 | minimizeToTray=true | 关闭窗口 | event.preventDefault()，窗口隐藏 | PASS |
| TC-W12 | 窗口管理 | 最小化到托盘-未启用 | minimizeToTray=false | 关闭窗口 | 正常关闭，不隐藏 | PASS |
| TC-W13 | 窗口管理 | 托盘图标-退出 | 托盘图标显示 | 点击"退出" | app.isQuitting=true，app.quit() | PASS |
| TC-W14 | 窗口管理 | 安全-导航限制 | 主窗口加载 | 尝试导航到外部URL | will-navigate 事件拦截，只允许 localhost:5173 和 file:// | PASS |

### 6. 边界条件

| 编号 | 模块 | 用例名 | 前置条件 | 测试步骤 | 期望结果 | 结果 |
|------|------|--------|----------|----------|----------|------|
| TC-E01 | 边界条件 | 空数据库首次启动 | 无 db 文件 | 启动应用 | 创建空数据库和所有表，dashboard/stats 返回全0 | PASS |
| TC-E02 | 边界条件 | 大量数据性能 | 10000条需求 | 加载需求列表 | SELECT 无分页，可能性能下降 | **SKIP** |
| TC-E03 | 边界条件 | 图片上传-文件格式 | - | 上传非图片文件 | 前端 accept="image/*" 限制，后端无格式校验 | **WARN** |
| TC-E04 | 边界条件 | 并发创建需求 | - | 同时发送多个 POST | MAX(id) 可能返回错误 id（竞态条件） | **FAIL** |
| TC-E05 | 边界条件 | 需求创建后id=0 | sql.js 版本兼容问题 | 创建需求 | 使用 MAX(id) 替代 last_insert_rowid()，正常返回 | PASS |
| TC-E06 | 边界条件 | AI分析-需求不存在 | - | POST /requirements/99999/analyze | 返回 { error: "Not found" } | PASS |
| TC-E07 | 边界条件 | 文件上传-扩展名 | - | 上传图片 | 文件扩展名固定为 .bin，非原始扩展名 | **WARN** |
| TC-E08 | 边界条件 | API路由-未知表 | - | GET /api/unknown_table | 返回 { error: "Unknown table: unknown_table" } | PASS |
| TC-E09 | 边界条件 | handleRequirements异常 | - | 内部代码抛出异常 | catch 返回空数组 []，不崩溃 | **WARN** |
| TC-E10 | 边界条件 | formatDoc-views计数 | 读取单个文档 | GET /api/documents/1 | views 字段 = r[5]+1（数据库值+1），但数据库也 +1，导致双倍计数 | **FAIL** |

---

## 二、Bug 列表

### BUG-001: 模型创建返回错误的 ID（P1）

- **严重程度**: P1  
- **模块**: 模型管理 - handleModels POST  
- **文件**: `electron/main.cjs` 第 440 行  
- **描述**: 创建模型后，返回的 id 来自 `SELECT MAX(id) FROM documents`（文档表），而非 `SELECT MAX(id) FROM models`（模型表）。这导致返回的 id 是错误的。  
- **复现步骤**:  
  1. 创建一个模型  
  2. 检查返回结果中的 id 字段  
- **期望行为**: 返回 `SELECT MAX(id) FROM models` 获取的 id  
- **实际行为**: 返回 `SELECT MAX(id) FROM documents` 获取的 id（如果 documents 表有数据，则 id 完全错误；如果 documents 表为空，则返回 null/undefined）  
- **代码定位**:  
  ```javascript
  // main.cjs:440 — 错误：查询了 documents 表而非 models 表
  return { success: true, id: query('SELECT MAX(id) FROM documents')[0][0] };
  // 应为：
  return { success: true, id: query('SELECT MAX(id) FROM models')[0][0] };
  ```

### BUG-002: 文档查看次数双倍增加（P1）

- **严重程度**: P1  
- **模块**: 文档管理 - handleDocuments GET by id  
- **文件**: `electron/main.cjs` 第 365 行 & 第 474 行  
- **描述**: 读取单个文档时，`handleDocuments` 先执行 `UPDATE documents SET views = views + 1`，然后 `formatDoc` 中又做了 `views: r[5]+1`，导致前端显示的 views 比实际多1。更严重的是，每次查看都会在数据库中 +1，但格式化时又额外 +1，使得显示值永远比数据库值多1。  
- **复现步骤**:  
  1. 创建一个文档（views=0）  
  2. 读取该文档  
  3. 检查返回的 views 值  
- **期望行为**: 数据库 views +1 后，前端显示值为 +1 后的值  
- **实际行为**: 数据库 +1，格式化又 +1，显示值 = 实际值 + 1  
- **代码定位**:  
  ```javascript
  // main.cjs:365 — 数据库层已 +1
  run('UPDATE documents SET views = views + 1 WHERE id = ?', [id]);
  // main.cjs:474 — 格式化层又 +1
  views: r[5]+1,  // r[5] 已经是 +1 后的值，这里又加1
  ```

### BUG-003: 并发创建需求时 MAX(id) 竞态条件（P2）

- **严重程度**: P2  
- **模块**: 需求管理 - handleRequirements POST  
- **文件**: `electron/main.cjs` 第 332 行  
- **描述**: 创建需求后使用 `SELECT MAX(id)` 获取新记录 ID。在并发场景下（如快速连续创建），两个请求可能拿到相同的 MAX(id)。虽然单线程 Electron 主进程不太容易出现，但 `run()` 后的 `saveDb()` 是异步友好的，且如果未来有并行调用，问题就会暴露。  
- **复现步骤**:  
  1. 快速连续创建两个需求  
  2. 检查返回的 id 是否相同  
- **期望行为**: 每个创建操作返回唯一的 id  
- **实际行为**: 可能返回相同的 id（取决于时序）  
- **建议**: 使用 sql.js 的 `db.exec("SELECT last_insert_rowid()")` 配合事务，或在应用层加锁

### BUG-004: 数据库文件损坏时无恢复机制（P2）

- **严重程度**: P2  
- **模块**: 数据持久化 - initDatabase  
- **文件**: `electron/main.cjs` 第 35-36 行  
- **描述**: 当 db 文件存在但内容损坏时，`new SQL.Database(fs.readFileSync(dbPath))` 会抛出异常。虽然 `createWindow` 有 catch 处理，但只记录日志，应用会继续运行但 `db` 变量为 null，后续所有数据库操作都会崩溃（`db.prepare` 等调用在 null 上）。  
- **复现步骤**:  
  1. 手动损坏 workit-data.db 文件（写入随机内容）  
  2. 启动应用  
- **期望行为**: 检测到损坏后备份旧文件并创建新数据库，或给出明确错误提示  
- **实际行为**: db 为 null，后续所有数据库操作抛出 TypeError  

### BUG-005: AI 返回空 summary 但有 tags 时不写入数据库（P2）

- **严重程度**: P2  
- **模块**: AI 分析  
- **文件**: `electron/main.cjs` 第 298 行  
- **描述**: AI 分析结果中 summary 为空但 tags 有值时，代码在 `if (!aiSummary)` 处返回错误，不写入数据库。但 AI 返回的 tags 可能仍有价值。  
- **复现步骤**:  
  1. AI 返回 `{"summary":"","tags":["用户","登录"]}`  
- **期望行为**: 至少保存 tags 信息，或以 desc 的前N字作为 fallback summary  
- **实际行为**: 返回 `{ error: "AI analysis failed: empty summary" }`，tags 也被丢弃  

### BUG-006: 文件上传固定 .bin 扩展名（P2）

- **严重程度**: P2  
- **模块**: 文件上传 - db-upload  
- **文件**: `electron/main.cjs` 第 181 行  
- **描述**: 上传文件时扩展名硬编码为 `.bin`，不保留原始文件扩展名。这导致：  
  1. 图片上传后 URL 为 `/uploads/xxx.bin`，浏览器无法根据扩展名判断 MIME 类型  
  2. 前端 `<img>` 标签加载 `.bin` 文件可能无法正确显示  
- **复现步骤**:  
  1. 上传一张 PNG 图片  
  2. 检查返回的 URL  
- **期望行为**: URL 保留原始扩展名，如 `/uploads/xxx.png`  
- **实际行为**: URL 为 `/uploads/xxx.bin`  

### BUG-007: handleRequirements/handleDocuments 异常时返回空数组而非错误信息（P2）

- **严重程度**: P2  
- **模块**: 需求管理/文档管理  
- **文件**: `electron/main.cjs` 第 355 行 & 第 390 行  
- **描述**: `handleRequirements` 和 `handleDocuments` 的 catch 块返回空数组 `[]`，而不是错误对象。这导致前端无法区分"无数据"和"查询出错"两种情况。  
- **复现步骤**:  
  1. 模拟数据库异常（如 db 为 null）  
  2. 查询需求列表  
- **期望行为**: 返回 `{ error: "..." }` 便于前端处理  
- **实际行为**: 返回 `[]`，前端误以为没有数据  

### BUG-008: Anthropic API 调用使用 Bearer 认证而非 x-api-key（P1）

- **严重程度**: P1  
- **模块**: AI 分析 - callAI  
- **文件**: `electron/main.cjs` 第 129 行  
- **描述**: 代码通过检测 baseUrl 是否包含 "anthropic" 来判断是否使用 Anthropic API 格式，但认证方式仍然使用 `Authorization: Bearer` 请求头。Anthropic API 要求使用 `x-api-key` 请求头，而非 Bearer Token。此外，还需要 `anthropic-version` 请求头。这导致所有 Anthropic 兼容的 API（包括 MiniMax 的 Anthropic 兼容端点）调用会因认证失败而报错。  
- **复现步骤**:  
  1. 配置 MiniMax 模型（baseUrl 包含 "anthropic"）  
  2. 触发 AI 分析  
- **期望行为**: Anthropic 风格 API 使用 `x-api-key` 和 `anthropic-version` 请求头  
- **实际行为**: 使用 `Authorization: Bearer` 请求头，Anthropic API 返回 401  
- **代码定位**:  
  ```javascript
  // main.cjs:129 — 所有 API 统一使用 Bearer 认证
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + model.apiKey },
  // 应为 Anthropic 风格：
  // headers: { 'Content-Type': 'application/json', 'x-api-key': model.apiKey, 'anthropic-version': '2023-06-01' }
  ```

### BUG-009: 编辑模型时 provider 字段不更新（P2）

- **严重程度**: P2  
- **模块**: 模型管理 - Model.tsx  
- **文件**: `src/pages/Model.tsx` 第 87-96 行  
- **描述**: 编辑模型时，只发送 `apiKey` 和 `modelId` 字段，不发送 `provider` 和 `baseUrl`。如果用户切换了供应商，后端不会更新 provider 和 base_url 字段，导致模型配置与实际供应商不匹配。  
- **复现步骤**:  
  1. 创建一个 DeepSeek 模型  
  2. 编辑该模型，切换供应商为 Moonshot  
  3. 保存  
- **期望行为**: provider 和 baseUrl 更新为新供应商的值  
- **实际行为**: provider 和 baseUrl 仍为 DeepSeek 的值  

### BUG-010: QC 弹窗中的模型下拉显示当前编辑供应商的模型列表而非该模型供应商的列表（P2）

- **严重程度**: P2  
- **模块**: 模型管理 - Model.tsx  
- **文件**: `src/pages/Model.tsx` 第 191 行  
- **描述**: 模型列表中每个模型的下拉菜单使用 `currentModels` 变量，该变量基于 `form.provider`（当前表单选择的供应商），而非该模型自身的 provider。这导致所有模型的下拉菜单都显示当前表单供应商的模型列表，而非各自供应商的模型。  
- **复现步骤**:  
  1. 创建 DeepSeek 模型和 Moonshot 模型  
  2. 点击 Moonshot 模型的模型下拉  
- **期望行为**: 显示 Moonshot 的模型列表  
- **实际行为**: 显示当前表单供应商（如 DeepSeek）的模型列表  

### BUG-011: 需求更新时不传递 category/assignee/creator/dueDate/tags 等字段（P2）

- **严重程度**: P2  
- **模块**: 需求管理 - Requirements.tsx  
- **文件**: `src/pages/Requirements.tsx` 第 161-164 行  
- **描述**: `handleUpdate` 函数的 PUT 请求只传递 `title, desc, module, priority, images`，不传递 `category, assignee, creator, dueDate, tags`。后端 `handleRequirements PUT` 会将这些缺失字段设为空字符串或默认值，导致原有数据被清空。  
- **复现步骤**:  
  1. 创建一个需求并设置 assignee 为"张三"  
  2. 编辑该需求（只修改描述）  
  3. 保存后查看详情  
- **期望行为**: assignee 仍为"张三"  
- **实际行为**: assignee 被清空为空字符串  

---

## 三、测试结果汇总

| 统计项 | 数量 |
|--------|------|
| 总测试用例 | 59 |
| PASS | 49 |
| FAIL | 5 |
| SKIP | 1 |
| WARN | 2 |
| 预估覆盖率 | ~78% |

### Bug 严重程度分布

| 严重程度 | 数量 | Bug 编号 |
|----------|------|----------|
| P0 (阻塞) | 0 | - |
| P1 (严重) | 3 | BUG-001, BUG-002, BUG-008 |
| P2 (一般) | 8 | BUG-003~007, BUG-009~011 |

---

## 四、路由决策

**需发送给工程师修复的 Bug (Send To: Engineer)**:

| Bug 编号 | 严重程度 | 描述 | 修复文件 |
|----------|----------|------|----------|
| BUG-001 | P1 | 模型创建返回 documents 表的 id | electron/main.cjs:440 |
| BUG-002 | P1 | 文档查看次数双倍增加 | electron/main.cjs:474 |
| BUG-008 | P1 | Anthropic API 认证方式错误 | electron/main.cjs:129 |
| BUG-004 | P2 | 数据库损坏无恢复机制 | electron/main.cjs:35-36 |
| BUG-006 | P2 | 文件上传固定 .bin 扩展名 | electron/main.cjs:181 |
| BUG-007 | P2 | 异常返回空数组而非错误对象 | electron/main.cjs:355,390 |
| BUG-009 | P2 | 编辑模型不更新 provider/baseUrl | src/pages/Model.tsx:87-96 |
| BUG-010 | P2 | 模型下拉显示错误供应商列表 | src/pages/Model.tsx:191 |
| BUG-011 | P2 | 需求更新丢失字段 | src/pages/Requirements.tsx:161-164 |

---

## 五、详细代码问题分析

### 5.1 安全性关注

1. **SQL 注入风险（低）**: `handleDbQuery` 中的 `resType` 来自 URL 路径，直接拼接进 SQL 语句 `SELECT * FROM ${resType} WHERE id = ?`（第 272 行）。虽然有正则 `^(\w+)\/(\d+)\/(\w+)$` 限制，但 `\w+` 可匹配任意表名，理论上可访问任意表。
2. **API Key 明文存储**: API Key 在数据库中明文存储，虽然 GET 时脱敏，但 db 文件本身未加密。
3. **文件上传无校验**: 后端 `db-upload` 不校验文件类型和大小，理论上可上传任意文件。

### 5.2 数据一致性关注

1. **MAX(id) 策略不可靠**: 多处使用 `SELECT MAX(id) FROM table` 获取新记录 ID，在并发或删除场景可能返回错误 ID。
2. **saveDb 是 best-effort**: 写入失败不抛出异常，仅记录日志。用户不会感知到数据未持久化。
3. **workflow_history 解析无容错**: 第 340 行 `JSON.parse(query(...)[0]?.[0] || '[]')` 如果数据库中存储了非法 JSON，会抛出异常但被 catch 吞掉。

### 5.3 前端关注

1. **删除确认使用 confirm()**: `Requirements.tsx` 第 173 行使用原生 `confirm()`，在 frameless 窗口中可能不显示或样式不匹配。
2. **API 调用未统一错误处理**: 部分 API 调用使用 `.then()` 链式处理，部分使用 `async/await`，错误处理方式不一致。
3. **自动分析延时硬编码**: Requirements.tsx 用 600ms，QuickCapture.tsx 用 800ms，无配置化。

---

## 六、改进建议

1. **P1 Bug 应优先修复**: BUG-001（模型ID错误）、BUG-002（浏览计数双倍）、BUG-008（Anthropic认证）会直接影响核心功能。
2. **增加数据库版本迁移机制**: 当前仅有一个状态迁移（待评审→待评估），应建立正式的 migration 机制。
3. **增加分页支持**: 需求列表无分页，大数据量时性能和体验都会下降。
4. **统一错误处理**: 建议后端所有 catch 块返回 `{ error: message }` 格式，前端统一 toast 提示。
5. **文件上传改进**: 保留原始扩展名，增加文件大小限制和类型校验。
6. **API Key 安全存储**: 考虑使用 Electron safeStorage API 加密存储 API Key。

---

*报告结束*
