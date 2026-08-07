# 文玺（WenXi）设计文档

日期：2026-08-07
状态：已批准（用户逐节确认）

## 1. 项目概述

文玺（WenXi）是一款面向机关、事业单位及综合行政办公场景的**本地化办公台账 + 公文写作 AI** 全栈应用。独立新项目，现代框架全栈（Vue 3 + Element Plus + Node.js + SQLite），本地原型为主，预留多人扩展。

参考来源（用户提供的三个 GitHub 仓库）：

- **wenxibuddy**：体制内单文件 HTML 办公台账（任务/会议/文件收发/外出活动/用章/物资），业务模块设计参考
- **wenxi-skills**：公文写作算法蒸馏 SKILL（"公文写作算法"、"笔杆子是怎么炼成的"），内置提示词来源
- **ui-glossary**：60 个前端 UI 术语交互速查手册，Glossary 模块内容素材来源

### 功能范围

1. **办公台账管理**：任务、会议、文件收发、外出活动、用章、物资（含库存流水）、工作统计 7 个模块
2. **公文写作 AI**：周报/月度总结、专项工作汇报、标准公文起草、润色与改写 4 个场景
3. **公文一键排版**：GB/T 9704-2012 标准与内部材料格式双标准切换
4. **UI 术语手册**：60 术语 6 分类交互式速查（复用 ui-glossary 素材）
5. **本地 AI 对话能力**：多供应商 OpenAI 兼容 API 配置（DeepSeek/智谱/SiliconFlow/Ollama）

### 明确不做（YAGNI）

- 账号体系/权限（仅预留 `created_by` 字段，不实现过滤）
- 多人实时协作/推送
- 云端同步/移动端适配
- 消息通知中心、审批流

## 2. 技术架构（方案 A：单体全栈）

```
wenxi/
├── server/                  # Node 后端（Express + better-sqlite3）
│   ├── index.js             # 入口，构建后托管 public/ 静态资源
│   ├── config.js            # 配置读取（.env + 默认值）
│   ├── db.js                # SQLite 初始化（WAL）+ 迁移（meta 表 schema_version）
│   ├── crypto.js            # AES-256-GCM 密钥加解密
│   ├── db/crud.js           # 通用 CRUD 构造器（M1 重头）
│   ├── routes/              # REST API 路由（7 模块 + AI + 导出 + 附件）
│   ├── ai/                  # provider.js（抽象层）+ index.js
│   ├── skills/              # 内置 SKILL 提示词（gongwen.js / biganzi.js）
│   ├── export/              # word.js / excel.js / cleanup.js / const.js
│   ├── jobs/index.js        # 定时任务（附件清理每日 / 导出清理每小时，时间可注入）
│   └── utils/docx-styles.js # docx 样式映射（读 shared/blocks.json）
├── src/                     # Vue 3 前端
│   ├── router/index.js
│   ├── layouts/
│   ├── views/               # Dashboard / 7 台账 / Trash / Writing / Glossary / Settings
│   ├── components/
│   ├── api/index.js         # axios 封装（409/40401/40402 统一处理）
│   ├── config/columns.js    # 各模块列配置（字段 key = DB 列名）
│   ├── data/glossary.json   # 60 术语静态数据
│   └── utils/block-styles.js # 前端 CSS 样式映射（读 shared/blocks.json）
├── shared/blocks.json       # data-block 枚举单一事实源（两端编译期引用）
├── build/check-blocks.mjs   # 构建期校验脚本
├── scripts/                 # seed.js（造数）、bench.js（压测）、start.sh / start.bat
├── data/                    # 运行时数据（gitignore）
│   ├── wenxi.db             # SQLite（WAL）
│   ├── .secret              # AES 密钥文件（32 字节，gitignore，chmod 600）
│   ├── .instance.lock        # 单实例锁（防双开写库）
│   ├── attachments/         # 附件文件（uuid 重命名）
│   └── exports/             # 导出文件（job 1 小时清理）
├── index.html / vite.config.js / package.json
```

### 进程管理

- **默认前台运行**：`npm start`（node server/index.js），日志输出到 stdout（`data/workstation.log` 同时写文件，轮转 5MB×3）
- **单实例锁**：启动时创建 `data/.instance.lock`（写入 PID），已存在则拒绝启动并提示"服务已在运行（PID xxx）"；正常退出删除，异常退出用 PID 存活检测兜底
- **可选守护**：README 提供 pm2（`pm2 start server/index.js --name wenxi`）与 systemd unit 示例，本地原型不强制
- **优雅退出**：SIGINT/SIGTERM → 停止定时任务 → 关闭 DB → 删锁

### 版本管理

- `package.json version`（起始 1.0.0），`GET /api/health` 返回 `{ version, schemaVersion, uptime, dbOk }`
- DB 有 `meta` 表存 `schema_version`，迁移按版本号递增执行（`server/db.js` 内 migration 数组）
- 前端 footer 显示版本号；发布按里程碑打 tag（v0.1.0=M1…）

关键决策：

- **API Key 安全**：AI 配置存 SQLite 加密（api_key_enc），后端解密调用模型，前端只拿掩码
- **数据**：SQLite（业务）+ 文件系统（附件）+ SQLite（AI 配置，不用 JSON）
- **模型调用**：服务端统一走 OpenAI 兼容接口 `/v1/chat/completions`
- **端口**：默认 `PORT=3000`（.env 可配）；启动 `EADDRINUSE` → 打印提示 + `listen(port+1)` 重试一次 → 再失败退出并提示手动设 PORT。日志明确打印"端口 X 被占用，已改用 Y"。不做无限递增。
- **预留多人**：API 层预留 auth 中间件挂载点，DB 表预留 `created_by`

### SQLite 并发模型与限制

- 开 `journal_mode=WAL`（单写多读）；better-sqlite3 同步 API，本进程内所有写天然串行排队
- **约束**：单进程访问（单实例锁保证）；备份拷贝 DB 前先停服务（或用 `VACUUM INTO` 快照，避免拷贝中文件不一致）
- **已评估的风险**：本地单机场景无跨进程写竞争；未来多人版需迁移 PostgreSQL 或加连接池/队列，本期不做

### 定时任务实现（server/jobs/index.js）

- 启动时 `startJobs({ now })` 注册两个 setInterval，时间可注入测试
- **附件清理**：每日 1 次（首跑延迟 10s），删除 `deleted_at` 超 7 天且无引用记录的附件物理文件
- **导出清理**：每小时 1 次，删除 `expires_at` 超期的 exports 记录 + 物理文件
- 每个任务独立 try/catch，失败记日志不中断进程；`stopJobs()` 供优雅退出与测试清理

### 配置与进程管理

- **配置文件**：`.env`（PORT、WENXI_DATA_DIR 可选）+ `.env.example`；`server/config.js` 统一读取，缺省用默认值
- **默认前台运行**：`npm start`（node server/index.js），日志 stdout + `data/workstation.log`（5MB×3 轮转）
- **单实例锁**：启动创建 `data/.instance.lock`（写 PID），已存在则拒绝启动并提示"服务已在运行（PID xxx）"；正常退出删除，异常退出用 PID 存活检测兜底
- **可选守护**：README 提供 pm2 与 systemd unit 示例，本地原型不强制
- **优雅退出**：SIGINT/SIGTERM → 停止定时任务 → 关闭 DB → 删锁

## 3. 数据模型（SQLite 表设计）

### 统一约定

所有业务表含：`id TEXT PK(uuid)`、`created_at`、`updated_at`、`deleted_at`（软删除，NULL=未删）、`version INTEGER DEFAULT 1`（乐观锁）、`created_by TEXT`（预留）。

人员字段（`created_by`/`assigner`/`cooperators`/`applicant`/`approver`/`handler`/`participants`）全部 **TEXT 自由文本**（数组存 JSON 字符串），不建 users 主表。

SQLite 开 `journal_mode=WAL`。统计/导出/AI 聚合所有 SQL **强制带 `deleted_at IS NULL`**（公共查询构造器内置）。

索引命名统一：`idx_{table}_{col1}_{col2}`，如 `idx_tasks_deleted_created`。

### 业务表

**tasks 任务表**
| 字段 | 说明 |
|---|---|
| title | 任务名称 |
| task_type | 类型（重点工作/日常事务/专项…） |
| source | 来源 |
| assign_time / deadline | 交办时间 / 截止日期 |
| assigner | 交办人（自由文本） |
| cooperators | 配合单位或人员 JSON 数组 |
| status | 未启动/进行中/已完成/已超期 |
| progress | 进度 0-100 |
| summary | 工作小结 |
| stages | 多阶段 JSON：[{name,status,people}] |

**meetings 会议表**：topic、meeting_time、location、send_to、receive_from、attendees、minutes（纪要）、status

**documents 文件收发表**：doc_type（收文/发文）、title、doc_no（文件编号）、secret_level（密级）、genre（公文文种）、handler（经办人）、receipt_status（回执状态）、content

**activities 外出活动表**：act_type（调研/会议/慰问/来访）、title、start_time、end_time、location、participants、achievements（成果）

**seals 用章表**：seal_time、applicant、approver、file_name、file_type、purpose

**supplies 物资表（两表结构）**
```
supplies 物资主档：id, name, type, unit, current_stock, safe_stock(预警线), location, source_unit, remark
supply_transactions 库存流水：id, supply_id, change_type(入库/领用/报损/盘点调整), quantity(正数),
  balance_after(变更后结余), operator, source_unit, transacted_at, note
```
- 每次交易在事务内更新 `supplies.current_stock` 并写流水、记录 `balance_after`，可回溯
- 领用校验 `current_stock >= quantity`，不足报错；流水只增不删（调整用冲销流水）
- 流水不做乐观锁（只增不删），子操作只锁主档

**attachments 附件表**：id、biz_type、biz_id、server_file_name（uuid 重命名）、display_name、file_size、mime_type、uploaded_at、created_by。**不存物理路径**，前端经 `/api/attachments/:id/download` 下载，由后端映射到 `data/attachments/`。附件记录软删；物理文件由后端定时任务（每日）清理 7 天前软删且无引用记录的附件文件。附件记录同样走软删 + version 乐观锁（删除/下载校验用），created_by 关联上传人。

**ai_configs 模型配置表**：id、name、base_url、api_key_enc（BLOB，AES-256-GCM 加密）、model_name、is_active、created_at、updated_at、deleted_at、version

**writings 写作文档表**：id、title、scenario（weekly|report|draft）、content_html（含 data-block 标记）、status（draft|saved|exported）、exported_at、created_at、updated_at、deleted_at、version、created_by。与台账同规格：软删 + 乐观锁 + 回收站。导出记录通过 `exports.writing_id` 关联（见下）。

**exports 导出记录表（导出历史追溯）**
```
id, job_id(异步任务, 可空), biz_type(word|excel), writing_id(关联 writings, 可空),
  format(gbt|internal), filter_json(导出时筛选条件快照), file_id(uuid 文件名),
  display_name, status(pending|done|failed), message(失败原因), 
  expires_at, created_at, downloaded_at
```
- 每次导出（同步或异步）都写一条记录，供"导出历史"追溯：谁在何时导出了什么（单机下 created_by 记录本机操作人）
- `GET /api/exports?bizType=&writingId=&status=` 查询历史；`GET /api/export/download/:fileId` 凭 file_id 下载（文件已过期 → `410 { code: 41001, message: "文件已过期" }`，41001 补入错误码表：`41001` 文件过期/资源已清理）
- 记录在 `expires_at` 到期后由定时任务清理（行 + 物理文件）；导出历史默认保留 7 天（与附件清理同周期）
- exports 表**不做软删**（审计型记录，到期物理清理）；无乐观锁（只增改状态）

### AI 配置加密与密钥

- 密钥文件 `data/.secret`（gitignore），首启自动生成 32 字节随机密钥（crypto.randomBytes(32)），chmod 600（Windows 下 chmod 无效则依赖 NTFS 权限，README 说明）
- 后续启动若缺失：**明确失败**并提示恢复，不静默重新生成（防密文不可解）：
  ```
  [WenXi] 错误：缺少密钥文件 data/.secret
  请将备份的 .secret 文件放回 data/ 目录后重新启动
  （若首次安装，将自动生成；若曾备份，请勿覆盖现有库文件）
  ```
- 前端展示/返回只回掩码（`sk-****last4`），解密仅发生在后端调用模型时

### 数据加密范围（明确）

- **仅加密 `ai_configs.api_key_enc`**；业务台账数据、附件、writings 内容为明文存储
- 理由：本地单机场景，SQLite 文件受 OS 文件系统权限保护（与 ai-workstation 同策略）；全库加密（SQLCipher）引入密钥管理与迁移复杂度，对原型价值低
- 未来多人部署时在架构升级项中评估全库加密；README 注明"业务数据未加密，注意介质安全"

## 4. API 设计（REST 约定）

### 通用约定

- 前缀 `/api`，JSON 统一 `{ code, data, message }`
- 删除一律软删：`DELETE /api/xxx/:id` → 置 `deleted_at`
- 列表接口：`?page=1&pageSize=20&keyword=&status=&type=&dateFrom=&dateTo=`，返回 `{ list, total, page, pageSize }`
- 回收站：`GET /api/xxx?deleted=1`（排序按 `deleted_at DESC`，分页参数同普通列表），`GET /api/xxx/trash-count` 返回 `{ count: 3 }`（侧栏角标用）

### 错误码表（完整）

| code | 含义 |
|---|---|
| 40001 | 参数类型/必填错误（通用） |
| 40002 | AI 测试接口 configId 与 apiKey 均为空 |
| 40003 | GB/T 格式需填写发文字号 |
| 40401 | 记录不存在（无此行） |
| 40402 | 记录已删除（deleted_at 非空） |
| 40403 | 接口不存在 |
| 409 | 乐观锁版本冲突 |
| 41001 | 文件已过期/资源已清理（导出下载） |

40402 响应格式：
```json
{ "code": 40402, "message": "记录已删除", "data": { "id": "...", "deletedAt": "2026-08-01T10:00:00+08:00" } }
```

注意：错误码与 HTTP 状态解耦，40001/40002/40003 对应 HTTP 400，40401/40402/40403 对应 HTTP 404，409 对应 HTTP 409，41001 对应 HTTP 410。

### 乐观锁约定（强制）

- **凡是数据变更（`PUT`/`PATCH`，以及任何会修改主表状态的 `POST` 子操作），请求体必须携带目标主表 `version`**：PUT/PATCH 用 `body.version`，POST 子操作用 `body.targetVersion`
- 校验失败 → 409 冲突；不携带或类型不符 → 400 参数错误
- 涉及主表 + 子表的子操作（如任务续办同时改阶段）：只锁**主表**（流水等只增不删的子表不做乐观锁）
- 更新 SQL：`WHERE id=? AND version=? AND deleted_at IS NULL`；软删后操作返回 40402

### 软删恢复与永久删除

- `POST /api/xxx/:id/restore`：`deleted_at = NULL`，`version + 1`（乐观锁语义：强制其他客户端刷新）。**不要求**请求体带 targetVersion，但 SQL 带 `WHERE deleted_at IS NOT NULL` 守卫
- `DELETE /api/xxx/:id/permanent`：**物理删行**（DELETE FROM），事务内先删子表（supplies→transactions 先删流水再删主行，全成或全败），附件同步删行 + 物理文件。不可逆，前端必须二次确认

### 业务 CRUD（7 模块同构，经 makeCrud 构造）

| 模块 | 路由 | keyword 模糊匹配字段 |
|---|---|---|
| 任务 | `/api/tasks` | title, assigner, source, cooperators |
| 会议 | `/api/meetings` | topic, send_to, receive_from, location |
| 文件收发 | `/api/documents` | title, doc_no, handler, genre |
| 外出活动 | `/api/activities` | title, location, participants, achievements |
| 用章 | `/api/seals` | applicant, approver, file_name, purpose |
| 物资 | `/api/supplies` + `/api/supplies/:id/transactions` | name, type, location, source_unit（流水：operator, note, source_unit） |
| 统计 | `/api/stats/monthly`、`/api/stats/trend` | — |

### 统计接口（防 SQLite 锁库）

- WAL 模式 + 单次请求内依次执行索引计数（better-sqlite3 同步、无事务），每表 `WHERE deleted_at IS NULL AND created_at 范围` 走 `idx_{table}_deleted_created` 索引
- 不做 7 表 UNION ALL 硬拼；不加 await 串行阻塞（毫秒级）；未来统计变重再引入月结快照表，本期不做

### AI 接口

- `GET /api/ai/configs`（列表，api_key 掩码）、`POST /api/ai/configs`（增改）、`DELETE`（软删）
- `GET /api/ai/configs/active`：取 `is_active=1` 当前配置（掩码），前端免遍历
- `POST /api/ai/test`：**参数优先级约定——`configId` 优先**：
  - 传 `configId` → 解密已存配置测试，忽略请求中 `apiKey`（即使也传了）
  - 只传 `apiKey` → 明文仅本次请求使用，不落库
  - **两者都空 → `40002` 参数错误**
  - 响应不回显 Key，失败信息不含 Key 内容
- `POST /api/ai/chat`（对话，SSE 流式）
- `POST /api/ai/write`：**仅生成类场景** `scenario: weekly | report | draft`，后端按场景自动注入对应 SKILL 提示词（见第 7 节 SKILL 装配规则）；**不含 polish**
- `POST /api/ai/polish`：**唯一润色入口**，request `{ text, mode: polish|rewrite|style, modelId? }`
  - `polish`（润色）：优化措辞、消除病句，保持长度与原意
  - `rewrite`（改写）：风格化重写，长度可压缩/扩展
  - `style`（公文风格化）：转为公文书面语风格（仿宋句式、"进一步…"等）
- `GET /api/health`：`{ version, schemaVersion, uptime, dbOk }`

### 导出接口（防超时 + 历史追溯）

- 服务端生成前先 `COUNT` 估算：
  - ≤5000 行（`EXPORT_SYNC_LIMIT`，常量在 `server/export/const.js`）→ 同步生成，响应 `{ fileId, url: "/api/export/download/:fileId" }`
  - \>5000 行 → **立即返回 `{ jobId }`**（不执行生成），前端轮询 `GET /api/export/status/:jobId`：
    ```json
    // pending
    { "code": 0, "data": { "jobId": "uuid", "status": "pending" } }
    // done
    { "code": 0, "data": { "jobId": "uuid", "status": "done", "fileId": "uuid", "url": "/api/export/download/:fileId" } }
    // failed
    { "code": 0, "data": { "jobId": "uuid", "status": "failed", "message": "原因" } }
    ```
  - 前端可显式 `?async=1` 强制异步；job 存活 1 小时自动清理
- `POST /api/export/word`：公文 Word 导出（docx 库）。请求体 `{ format: 'gbt'|'internal', forceBanji: boolean, contentHtml, title, docNo, writingId? }`（writingId 关联 writings 记录历史）
- `POST /api/export/excel`：台账报表导出（SheetJS）。请求体含当前筛选条件 + `fieldKeys`（列字段 key 列表）
- 文件存 `data/exports/`，job 与文件 1 小时清理（`server/export/cleanup.js`，`cleanupExports({ now })` 可注入时间）
- **导出历史**：`GET /api/exports?bizType=&writingId=&status=` 返回最近 7 天导出记录（含文件下载链接，`downloaded_at` 标记）

### 附件接口（防路径遍历）

- `POST /api/attachments`（multipart 上传，字段 bizType/bizId/file）、`GET /api/attachments?bizType=&bizId=`、`DELETE /api/attachments/:id`（软删）
- `GET /api/attachments/:id/download`：
  - 后端按 id 查 DB → 拿 `server_file_name`（uuid，后端生成，非用户输入）→ `path.resolve(ATTACH_DIR, serverFileName)` → **校验 `resolved.startsWith(ATTACH_DIR)`（防路径遍历）** → 文件不存在返回 404
  - **拒绝任何客户端传入的文件路径**；磁盘文件名一律 uuid 重命名，用户文件名只存 `display_name`（响应头 `Content-Disposition: attachment; filename*=UTF-8''...`）
  - 附件记录软删后下载返回 40402

## 5. 公文排版引擎

### shared/blocks.json（单一事实源）

- 内容：data-block 枚举数组，每项 `{ block, name, css, docx, required: { gbt, internal } }`
- **维护规则**：新增/修改区块只能改该文件，前端 `src/utils/block-styles.js` 与后端 `server/utils/docx-styles.js` 编译期读取（Vite import / Node require），两端不得硬编码新枚举
- **构建期校验**：`build/check-blocks.mjs`（仓库根 build/ 目录）在 `vite build` 前置执行：读 shared/blocks.json → 校验每个 block 在 `BLOCK_CSS`（前端）与 `DOCX_STYLES`（后端）均有非空键 → 缺失则 `process.exit(1)` 构建中止。package.json build 脚本：`node build/check-blocks.mjs && vite build`。后端 `server/index.js` 启动时做同款校验双保险

### data-block 枚举与 docx 映射（统一清单）

| data-block | 中文 | 前端 CSS | docx 样式 |
|---|---|---|---|
| title | 标题 | 小标宋 22pt 居中 | Title 段落 |
| wenhao | 发文字号 | 黑体 16pt 居中 | WenHao 段落 |
| h1 | 一级标题 | 黑体 16pt | Heading1 |
| h2 | 二级标题 | 楷体 16pt | Heading2 |
| body | 正文 | 仿宋 16pt 首行缩进 2 字 | Normal 首行缩进 |
| sign | 落款 | 仿宋 16pt 右对齐 | RightAlign |
| attachment | 附件说明 | 仿宋 16pt | Attachment |
| kai | 插入语/强调 | 楷体 16pt | ItalicBody |
| banji | 版记（印发机关/日期/抄送） | 仿宋 12pt 分隔线，页尾区域 | Footer 段落 |

### 双格式切换（纯前端 CSS）

- 编辑器是 contenteditable 区域，容器 class 切换 `fmt-gbt` / `fmt-internal`，CSS 变量驱动：字号（三号=16pt/小四）、行距（28pt/1.5 倍）、页边距、标题字体、页眉红线、版记样式
- 样式按 `data-block` 应用（不依赖视觉猜样式）；粘贴外部内容默认按正文处理
- 工具栏"标记区块"：选中一段 → 选区块类型 → HTML 包上对应标签带 data-block
- 导出 Word 按同一 data-block 映射 docx 段落样式

### 版记（banji）显示规则

- GB/T 格式：必显示（CSS `.fmt-gbt [data-block="banji"]` 正常渲染）
- 内部材料：默认隐藏（`.fmt-internal [data-block="banji"] { display: none; }`），可勾选"强制显示版记"（容器 class `.force-banji` + `data-forced` 属性 + `!important` 覆盖）
- 开关 UI：格式选择下拉旁的 el-checkbox；GB/T 下默认勾选且禁用，内部材料下默认不勾选可勾选
- 开关状态不持久化到 writings（每次打开按格式重置）；版记区块保留在 content_html 中不删除（隐藏仅视觉层）
- **导出联动**：以请求体 `forceBanji` 为准：GB/T → 必含；内部 + false → 不含；内部 + true → 含。后端不自行猜测

### 文号（wenhao）规则

- 内容必须用户填（文档属性 `docNo`），不能凭空生成
- GB/T：必填 → 保存/导出时前端阻止导出并提示"GB/T 格式需填写发文字号"；后端 `POST /api/export/word` 收到 `format=gbt` 且 `docNo` 为空 → `400 { code: 40003, ... }`（双层校验，前端体验层 + 后端兜底层）
- 内部材料：可选 → 不填不渲染文号区块；填了显示在标题上方；切内部格式时隐藏（CSS），切回 GB/T 恢复

### GB/T 9704-2012 排版规则

A4 页面、上 3.7cm 下 3.5cm 左 2.8cm 右 2.6cm、正文仿宋 16pt 行距 28pt、标题小标宋 22pt、一级标题黑体 16pt、二级标题楷体 16pt。

页码：页脚居中，4 号半角宋体阿拉伯数字（- 1 -），单页码，距版心下边缘 7mm；版记在版心末尾（印发机关/日期），页码在版心外页脚。

内部材料格式：页边距常规、正文仿宋或宋体 16pt 行距 1.5、标题黑体 18pt 居中。

## 6. 前端设计

### 路由

```
/           Dashboard（驾驶舱，只读概览）
/tasks      /meetings  /documents  /activities  /seals  /supplies  台账
/trash      回收站
/writing    公文写作工作台
/glossary   UI 术语手册
/settings   AI 配置
/:pathMatch(.*)*  NotFound.vue 兜底页（含"返回首页"）
```

### Dashboard 与三栏工作台定位

- **Dashboard（看）**：今日待办、超期任务、本周会议、库存预警、月度统计图、快捷入口
- **三栏工作台（做）**：左侧功能导航、中间列表、右侧详情面板；各台账模块复用同一布局
- 统计图点击跳转：路由 query 传递筛选条件（统一 `status/type/from/to/keyword` 五键，与列表 API 参数同名），台账列表页读取 query 初始化筛选栏，可清除回默认

### 写作工作台（Writing.vue）

- 三栏：左侧"模块导航 + 我的文档列表"、中间编辑器、右侧 AI 面板
- 左侧场景导航（周报/汇报/起草/润色）**决定右侧 AI 面板场景类型与 SKILL 装配**；切换时若有未保存修改先确认；编辑器内容不强制清空
- AI 生成结果**不自动覆盖**编辑器：先出现在右侧"生成预览"，用户点"插入/替换全文"才进编辑器

### 文档状态与当前文档

- 三种状态：**草稿**（draft，编辑中自动存 localStorage 防丢）、**已保存**（saved，落 writings 表）、**已导出**（exported，最后导出后）
- `exported_at` 非空 ⇔ `status='exported'`，由导出动作**同一事务**写入；导出后继续编辑再保存 → `status='saved'` 而 `exported_at` 保留（记录最近导出时间）
- 状态派生：draft（未保存到 writings）/ saved（最后保存≠最后导出）/ exported（保存与导出同步）
- **导出始终基于编辑器当前内容**（而非已保存内容），导出的同时写回 writings（content_html + status='exported' + exported_at=now），同一事务。导出请求体**必须携带 targetVersion**（409 处理与台账一致）
- 当前文档同一时间只有一个（内存态），三种来源：新建空白 / "我的文档"打开 / 台账"生成汇报"跳转（携带上下文生成初稿）。场景切换时当前文档概念不消失，仅右侧面板切换参数；scenario 不一致时保存按新场景分类或提示另存
- 文档列表支持搜索、按场景筛选、删除（软删）

### localStorage 草稿与 writings 关系（单向流动，不双写）

- 编辑中 → 每 30s + 切换/关闭前 flush 到 localStorage（仅防丢恢复层）
- 点"保存" → 写 writings 表，同时清除对应 localStorage 草稿
- 打开已保存文档 → 从 writings 载入，不读 localStorage
- 恢复提示：进入写作台检测到草稿 → **非阻塞提示条**（顶部 el-alert，不弹 Modal）："检测到未保存的草稿（上次编辑于 X 分钟前），是否恢复？" → 按钮 `恢复草稿` / `丢弃` / 右上角 ×（本次会话不再打扰）
  - 恢复 → 载入草稿（覆盖新建空文档），草稿保留到用户保存
  - 丢弃 → 立即清除草稿，提示条消失
  - **仅当前文档无内容时显示**；已有内容不提示
- "当前文档无内容"判定：innerHTML 去标签 trim() 后为空，或仅有默认段落（`<p><br></p>`/`<p>&nbsp;</p>`）；空白字符不计

### 润色交互（边界情况）

- 无选区/纯空白选区 → 禁用按钮，提示"请先选中文本"
- 跨区块选区 → 整体按"正文"处理，结果插回选区位置
- 失败 → 不丢原文，保留选区，Toast 报错可重试；生成中按钮 loading 禁用
- **撤销栈（自建，不用 execCommand）**：
  - 快照粒度：**人工编辑 + AI 操作都支持撤销**——键盘/粘贴输入做 800ms 防抖合并 push 快照；AI 替换/插入/全文替换强制 push
  - 快照 `{ html, cursor, ts }`，栈深上限 50（防抖合并后人工输入条目有限），超限丢最旧
  - 提供撤销/重做按钮，栈空置灰；AI 操作前快照与防抖未落地快照互不覆盖（AI 操作先 flush 防抖）
- **beforeunload 提示**：编辑器内容与最近快照不一致（有未保存修改）→ `beforeunload` 触发浏览器原生离开确认；路由切换（SPA 内）用 `onBeforeRouteLeave` 弹 el-message-box 确认

### 编辑器粘贴行为（实现细节）

- `paste` 事件拦截：`preventDefault()` → 取 `clipboardData.getData('text/plain')`（去外部格式，防 Word/网页粘贴带入内联样式污染 data-block 结构）
- 多段文本按换行拆为多个 `<p data-block="body">`；单段直接插入当前光标处，**默认归为 body 正文区块**
- 若粘贴内容含图片（截图），走附件上传通道转存，编辑器插入附件引用

### 当前文档内存态（生命周期明确）

- 当前文档是页面内存态（`reactive`），**刷新/关闭丢失**；恢复策略：刷新后从 localStorage 恢复草稿（未保存部分）+ 从 writings 重载上次打开的已保存文档（`sessionStorage` 记住 lastOpenId）
- 退出写作台（切路由）不销毁当前文档内存态（组件 keep-alive），仅切回时才触发未保存确认

### Glossary.vue

- 数据：`src/data/glossary.json` **静态 JSON**（60 术语 6 分类：导航/表单/按钮/反馈/布局/数据展示，含定义与迷你交互示例 HTML），随前端打包，不走 API
- 视图：分类 Tab + 术语卡片网格；点击弹 popover 定义 + 迷你交互示例；深色/浅色主题跟随主应用

### Settings.vue

AI 配置增删改（name/baseUrl/modelName/apiKey），测试连接（**configId 优先于 apiKey**），设 is_active；列表只显掩码。

### 前端列配置（columns.js）

- `src/config/columns.js`：各模块列定义（列名、字段 key、宽度、格式化），**字段 key 即 DB 列名**（snake_case，如 task_type/deadline/secret_level）
- 前端列表渲染 `row[field]`，后端导出按同一 key 取数；导出 `fieldKeys` 数组供导出接口使用，**不复制两份**
- 后端收到未知 key → 忽略 + 告警日志，不中断

## 7. AI 集成与 SKILL 装配

### 调用链

```
前端 POST /api/ai/write {scenario, params}
  → 后端查 is_active 配置（或显式 modelId）
  → 解密 api_key（AES-256-GCM）
  → 组装 system prompt = SKILL 提示词(gongwen/biganzi) + 场景指令模板
  → 调用 /v1/chat/completions（OpenAI 兼容）
  → SSE 流式返回
```

### provider 抽象层（server/ai/provider.js）

```
createProvider(config) 返回 {
  chatStream({ messages, modelId, signal, onChunk, onError }) → Promise
    // fetch(baseUrl + '/v1/chat/completions', { stream: true })，解析 data: 行
  testConnection({ baseUrl, apiKey, model }) → { ok, latencyMs, error? }
}
```

- `server/ai/index.js` 提供 `setProviderFactory(fn)` 供测试注入 fake provider

### SKILL 装配规则

| scenario | SKILL 文件 | 场景指令模板 |
|---|---|---|
| weekly | gongwen.js | 汇总台账数据生成周报（传 dateFrom/dateTo，后端自动查台账） |
| report | gongwen.js + biganzi.js | 按任务/会议上下文生成专项汇报 |
| draft | gongwen.js | 标准公文起草（通知/请示/报告），生成公文结构草稿 |
| polish | 无 SKILL | 润色改写（保留原意、精简、公文风格化） |

### 场景参数结构

- **weekly**：`{ scenario, dateFrom, dateTo, modelId? }`；后端自动聚合任务（按状态）、会议、文件收发数量注入 prompt。**不按用户过滤**（无账号体系），文档注明多人版加 `WHERE created_by = 当前用户`。**数据量上限：注入 prompt 的记录数上限 200 条**（取截止日期最近者优先），超限截断并在 prompt 注明"另有 N 条未列出"；计数统计（总数）不截断
- **report**：`{ scenario, title?, bizRefs: [{bizType, ids}], extraNotes?, modelId? }`；后端按 bizRefs 拉记录详情（含附件名）注入。bizRefs 为空且无 extraNotes → 400。**上限：bizRefs 每类最多 50 条，超限报 400**
- **draft**：两种输入二选一：`{ genre: 通知|请示|报告|函|纪要, subject, keyPoints: [...] }` 或 `{ pasteText: 原始材料 }`；同时提供 → 400 冲突，均无 → 400。结果含 data-block 结构可直接进排版
- **polish**：`{ text, mode: polish|rewrite|style, modelId? }`，走 SSE。**text 上限 20000 字符**，超限报 400

### 系统提示词组装（write 自动注入 SKILL）

- 组装顺序：`[SKILL 全文（gongwen.js / biganzi.js）]` + `[场景指令模板]` + `[台账素材（周报聚合/汇报引用）]`，作为 system prompt
- SKILL 全文较长（wenxi-skills 蒸馏内容），**逐字注入不压缩**（保证算法效果），与场景指令模板拼接后作为单条 system message
- 场景指令模板存 `server/skills/scenarios.js`，按 scenario 索引；SKILL 文件为独立模块，前后端均可读（构建期打包进前端不需要——**SKILL 只服务端注入**，前端不持有）
- 对话（chat）不带 SKILL，仅写作（write）注入

### SSE 约定

- `POST /api/ai/chat`、`/api/ai/write`、`/api/ai/polish` 均 SSE 流式
- `data: {delta}` 逐块，结束 `data: [DONE]`，出错 `event: error, data: {message}`
- polish 走 SSE 的原因：长文本可见进度，与 chat/write 共用流式管线，前端组件复用；结果流式追加到右侧预览区，用户点"替换原文"（保留撤销栈）

### 超时/重试

- 单次模型调用 HTTP 超时 **120s**；流式无首 token 超时 60s 断开
- **不自动重试**（SSE 半途失败重试易重复内容），失败即断流 + `event: error`
- 测试连接：单次 15s 超时直接反馈失败

### 错误脱敏

- 上游错误只透传 `status` + HTTP 状态描述（如 429/401），**绝不透传响应 body 原文**（可能含 key/令牌/内部 URL）
- 本地日志记录完整错误，但过滤疑似 key 字段（正则 `sk-...`、`authorization` 头）

### 周报聚合

- 统计/聚合 SQL 强制 `deleted_at IS NULL`（公共查询构造器内置，全局规则）
- 聚合维度：任务（按状态计数 + 进行中任务标题列表）、会议（时间范围内）、文件收发（收文/发文计数）、外出活动（活动标题列表）
- 注入上限 200 条（见场景参数结构），计数不截断

## 8. 测试策略

### 环境隔离

- 后端：`NODE_ENV=test` 时 DB 路径 `data/test.db`，每个测试文件 beforeEach 重建 schema + 清空表，结束删除；附件目录 `data/attachments-test/` teardown 清理
- 前端单测不触真实 DB（mock axios），只测纯函数/组件

### 覆盖范围

- 后端（node:test + app handler 直调）：CRUD、乐观锁 409、软删/恢复/永久删（40401/40402 区分）、导出阈值分支、错误码
- 前端（Vitest + Vue Test Utils）：columns.js 字段映射、block-styles 校验脚本、润色撤销栈逻辑（含人工编辑防抖合并）、beforeunload 判定、粘贴清洗函数
- 后端 404 兜底：未匹配 API 路由 → `404 { code: 40403, message: "接口不存在" }`

### 并发与乐观锁测试

- **409 并发冲突**：同一条记录，两个客户端先后拿 version=1 → 分别提交 → 第一个成功（version→2）、第二个 409；随后带新 version 重试成功
- **库存并发**：supplies 领用 5 件两次（库存 10），并发请求下第二次领用后 balance_after=0、无负库存（同步 API 串行天然保证，测试固化该行为防回归）
- **单实例锁**：启动两个进程（测试注入不同实例路径）→ 第二个拒绝启动

### AI 测试（不连真实模型）

- 全部走 `setProviderFactory` 注入 fake provider（固定流式 chunk / 抛特定错误）
- 用例：无 is_active → 400；.secret 缺失解密失败 → 500 且不泄露明文；SSE 事件序列格式；上游超时 → event: error 且不重试；weekly 聚合带 deleted_at IS NULL；上游错误体脱敏；**weekly 200 条截断逻辑；report bizRefs 超 50 条 → 400；polish text 超 20000 字符 → 400；SKILL 注入断言（system prompt 含 gongwen 内容）**
- .secret 缺失测试：`crypto.js` 暴露 `_getSecretPath()`，测试改环境变量 `WENXI_SECRET_PATH` 指向不存在路径，断言抛"缺少密钥文件"且接口返回 500 不泄露明文
- **真实模型依赖说明**：自动化测试一律不依赖外部网络；真实模型冒烟是**手动步骤**，依赖模型服务可达（网络/API Key/计费）。环境不允许时记录"环境限制"并降级为本地 Ollama 验证（如可装），不阻塞 CI 与本地测试

### 导出阈值测试

- 造 5001 行 → 断言返回 `{ jobId }`；5000 行 → `{ fileId }`；阈值常量 `EXPORT_SYNC_LIMIT` 可覆盖边界
- job 状态机：pending → done / failed（模拟生成抛错）；过期清理用 `cleanupExports({ now: 注入时间 })` 测清理逻辑，定时器本身不测

### 性能测试计划（scripts/bench.js）

- **性能目标**（本地单机，1 万条数据规模）：
  - 列表接口 p95 < 200ms（带分页 + keyword 搜索）
  - 统计接口 p95 < 500ms（月度聚合）
  - 导出 5000 行 < 5s（同步分支）
  - AI 流式首 token < 3s（网络正常时）
- **方法**：`scripts/seed.js` 造 1 万条假数据（tasks 为主）→ `scripts/bench.js`（node 内置 fetch 循环 100 次采样取 p95）→ 结果记录 `docs/perf.md`
- 里程碑：M5 末尾执行一次基准；超目标则优化（加索引/调页大小），记录到 perf.md

### 验收清单（成功标准）

1. 7 个台账模块 CRUD + 回收站全通过
2. 公文写作 4 场景 + 润色全流程可用（**M6 必须补一次真实模型全流程**，硬性要求；环境不可达则本地 Ollama 替代并记录）
3. GB/T 与内部材料两种排版切换正确
4. Word/Excel 导出成功（含超量异步分支）
5. 附件上传/预览/下载/软删清理
6. 性能基准达标（p95 目标，见上）

## 9. 里程碑

| 阶段 | 内容 | 验证 |
|---|---|---|
| M1 | 脚手架（Vite+Express+better-sqlite3+WAL）、错误码中间件、**通用 CRUD 构造器 makeCrud**（乐观锁/软删/回收站/分页/搜索/级联全内置）、附件上传下载、tasks 模块全链路 | 构造器完整测试 + tasks CRUD 测试通过 |
| M2 | 其余 6 模块（薄封装 makeCrud）+ stats 接口 + **Dashboard 视图**（统计图点击跳转） | 全模块 CRUD 测试通过 |
| M3 | AI 配置 CRUD + provider 抽象层 + write/polish/chat SSE + 周报聚合（fake provider 测试过） | fake provider 测试通过 |
| M4 | 写作工作台前端 + 场景表单 + SSE 流式渲染 + 排版引擎（data-block）+ SKILL 装配 + **fake provider 端到端走通** + 真实模型冒烟（此轮内，失败记录为环境限制不阻塞） | 4 场景 fake 端到端通过 |
| M5 | 导出（Word/Excel + 异步 job）+ Glossary + Settings 完善 | 导出测试通过 |
| M6 | 打磨缓冲期（预留总工期 30%）：修 bug、补边界测试、**真实模型全流程**、UI 打磨、文档收尾 | 验收清单全过才可提交，不可压缩 |

### 备份/迁移流程

```
备份：停止服务 → 拷贝 data/ 目录整体（wenxi.db + attachments/ + .secret + exports/ 可选）
恢复：新机安装 → 把 data/ 整体拷回 → 启动 → 自动使用库内数据
```

- **.secret 必须随 data/ 一起拷贝**，否则 ai_configs 密文无法解密（启动时明确报错提示恢复）
- README 加粗强调：data/ 目录整体拷贝（含 .secret）；web 端 JSON 导出仅作记录级迁移，不含附件二进制
- 备份前**先停止服务**（或使用 `VACUUM INTO` 生成快照），避免拷贝中 SQLite 文件不一致

## 10. 部署

- `npm install && npm run build && npm start`
- 默认 `PORT=3000`（.env 可配：PORT、WENXI_DATA_DIR），与 ai-workstation（1999）不冲突
- 数据在 `data/`，备份 = 拷贝 data 目录（含 .secret）
- 进程管理：默认前台；可选 pm2/systemd（README 示例）；单实例锁防双开
