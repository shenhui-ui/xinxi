# 文玺（WenXi）— 单位台账管理系统

面向机关单位日常办公的本地台账管理系统：任务、会议、文件收发、外出活动、用章、物资六大台账 + 附件管理、统计驾驶舱、AI 公文写作（周报/专项汇报/公文起草/润色）、公文 Word / 台账 Excel 导出、UI 术语手册，数据全部保存在本机。当前版本为 **M5-M6 里程碑**（7 个台账模块 + 统计 + 附件 + 回收站 + Dashboard + AI 配置 + 写作工作台 + 公文/台账导出 + UI 术语手册 + 定时清理任务）。

## 功能

| 模块 | 能力 |
|---|---|
| 📋 **任务管理** | 台账字段全配置（类型/来源/状态/进度/期限/交办人等），keyword 搜索，分页 |
| 📅 **会议管理** | 议题/时间/地点/参加对象/纪要，流转台账 |
| 📄 **文件收发** | 文种/文号/密级/收发人/签收状态，正文内容 |
| 🚶 **外出活动** | 活动类型/起止时间/地点/参与人/成果 |
| 🖊 **用章管理** | 用章时间/申请人与审批人/文件/用途 |
| 📦 **物资管理** | 库存台账 + 入库/出库/领用流水（事务内更新余额，金额负数拦截） |
| 📊 **统计驾驶舱** | 月度各台账新增统计（monthly）+ 近 12 月趋势（trend），点击图表跳转对应台账 |
| 🗑 **回收站** | 软删数据统一查看、恢复或永久删除 |
| 📎 **附件管理** | 任意台账记录关联附件：上传（≤20MB）/下载/软删，uuid 重命名存储、防路径遍历 |
| 📤 **公文导出** | 写作工作台内公文 Word 导出（docx 映射/文号校验/版记规则）、台账 Excel 导出（同步/异步双分支）、导出历史与过期清理（1 小时），writings 导出联动（exported_at/status/forceBanji） |
| 📖 **UI 术语手册** | 60 术语 6 分类交互速查：分类 Tab + 卡片网格 + 点击展开定义 + 迷你交互示例 + 深浅主题切换 |

通用能力：乐观锁（version 冲突返回 409）、软删除（`deleted_at`）、分页、keyword 搜索、级联清理（删除物资时同时清理其流水），全部由通用 CRUD 构造器 `server/db/crud.js` 统一提供。

## 技术栈

- **后端**：Node.js + Express + better-sqlite3（SQLite，WAL 模式）
- **前端**：Vue 3 + Vite + Element Plus + vue-router
- **数据**：`data/wenxi.db`（业务台账）+ `data/attachments/`（附件文件）

## 快速开始

要求：Node.js 18+、npm。

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量示例（可选，默认值可直接运行）
cp .env.example .env

# 3. 造数（可选）：插入 1 万条任务用于体验列表/统计/仪表盘
npm run seed

# 4. 构建前端并启动（推荐，完整功能）
npm run build && npm start

# 5. 浏览器打开
#    http://localhost:3000/
```

> **注意**：`npm run dev` 只启动后端 API（无前端 dev server 代理），请用 `npm run build && npm start` 预览完整功能（express 直接托管 `dist/`，附件上传/下载才能工作）。

运行测试：

```bash
npm test            # 后端接口测试（node --test）
npx vitest run      # 前端组件测试
```

## 环境变量（`.env`）

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 服务监听端口 | `3000` |
| `WENXI_DATA_DIR` | 数据目录（wenxi.db、attachments/、.secret 均在此） | `./data` |

## 导出与备份

**导出：**

- **Word 导出**：写作台"导出 Word"按钮导出当前公文（GB/T 格式必须填写发文字号，否则返回 40003；内部材料格式默认无版记，可勾选"强制显示版记"）。
- **Excel 导出**：台账列表导出（超 5000 行自动转异步任务，返回 jobId 轮询下载；5000 行以内同步返回）。
- 导出文件 1 小时过期自动清理，导出历史保留 7 天；附件软删后 7 天自动清理。

**备份：** 先停止服务，再整体拷贝 `data/` 目录：

```bash
# 停止服务（Ctrl+C）
# 备份（将 data 目录整体拷贝，例如打 tar 包）
tar czf wenxi-backup-$(date +%F).tar.gz data/
```

**恢复：** 新环境安装依赖后，将备份的 `data/` 目录整体拷回项目根目录，再启动即可自动使用库内数据。

> ⚠️ **必须整体拷贝 `data/`（含 `data/.secret`）**。`.secret` 是 AI 配置 API Key 的加密密钥文件；若丢失或未随备份恢复，加密数据将无法解密，且服务启动时会拒绝启动（检测到库内存在密文而密钥缺失）。web 端 JSON 导出仅作记录级迁移，不含附件二进制。
>
> 备份前**先停止服务**（SQLite WAL 模式下直接拷贝运行中的 db 文件可能产生不一致快照）。
>
> **加密范围**：仅 AI 配置的 `api_key_enc`（`ai_configs` 表）使用 AES-256-GCM 加密；**业务台账数据、附件均为明文存储**，备份与存放时注意介质安全。

## 进程管理

- 默认前台运行 `npm start`；单实例锁 `data/.instance.lock` 记录 PID，服务已在运行时再次启动会拒绝并提示（防止双进程写库）。
- 端口冲突：启动时若 `PORT` 被占用，自动改用 `PORT + 1` 并打印提示；再次冲突则退出，需手动设置 `PORT`。

**pm2**（进程守护、开机自启）：

```bash
pm2 start server/index.js --name wenxi
pm2 save                    # 保存进程列表
pm2 startup                 # 生成开机自启命令
```

**systemd**（`/etc/systemd/system/wenxi.service`，替换 `/path/to/wenxi` 为实际路径）：

```ini
[Unit]
Description=WenXi 台账管理系统
After=network.target

[Service]
WorkingDirectory=/path/to/wenxi
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now wenxi
```

## 安全说明

- `data/`、`dist/`、`.env` 均已在 `.gitignore` 中，不会提交到仓库。
- 附件上传限制 20MB，存储文件名改为 uuid，防止路径遍历。

## 接口概览

| 接口 | 说明 |
|---|---|
| `GET /api/health` | 健康检查（版本/schemaVersion/uptime/dbOk） |
| `/api/tasks` `/api/meetings` `/api/documents` `/api/activities` `/api/seals` `/api/supplies` | 6 台账 REST CRUD（列表含分页/keyword 搜索；`?deleted=1` 查回收站；`POST /:id/restore` 恢复；`DELETE` 永久删；PUT 带 `version` 乐观锁） |
| `/api/supplies/:id/transactions` | 物资库存流水（入库/出库/领用，事务更新余额） |
| `/api/writings` | 文档写作 CRUD（title 搜索；`?deleted=1` 查回收站；`POST /:id/restore` 恢复；PUT 带 `version` 乐观锁；`exported_at` 由导出任务写入） |
| `/api/attachments` | 附件上传/列表/软删，`GET /:id/download` 下载 |
| `/api/stats/monthly` `/api/stats/trend` | 统计接口（`deleted_at` 已过滤） |
| `GET/POST /api/ai/configs` `GET /api/ai/configs/active` `DELETE /api/ai/configs/:id` | AI 配置增改查删（api_key 明文入参→AES 加密存储，列表/查询仅回掩码；POST 带 id+version 乐观锁更新，apiKey 为空保留原密文；isActive 置位清除其他 active） |
| `POST /api/ai/test` | AI 连接测试（`{configId}` 或 `{baseUrl, apiKey, modelName}`，configId 优先；均空 40002；15s 超时） |
| `POST /api/ai/chat` | AI 对话（SSE 流式，`{messages, modelId?}`；messages 非空校验；上游错误脱敏为固定文案） |
| `POST /api/ai/write` | AI 写作（SSE 流式，`{scenario: weekly\|report\|draft, modelId?}`；weekly 自动聚合台账素材（200 条上限并注明）；report 校验 bizRefs 每类 ≤50 条、空且无 extraNotes 拒绝；draft 校验 genre+subject+keyPoints 与 pasteText 二选一） |
| `POST /api/ai/polish` | AI 润色（SSE 流式，`{text, mode: polish\|rewrite\|style, modelId?}`；text ≤20000 字符；mode 缺省 polish） |

## 已实现里程碑

- **M4**：AI 公文写作工作台（三栏写作、SSE 流式、撤销/重做、草稿恢复）与"AI 配置"页面（模型配置/掩码/测试连接）
- **M5**：公文 Word 导出（docx 映射/文号校验/版记规则）、台账 Excel 导出（同步/异步双分支）、导出历史与过期清理（附件 7 天/导出 1 小时）、Glossary 术语手册页
- **M6**：writings 导出联动（exported_at/status/forceBanji/文号校验）、导出清理统一 now → toIso 格式、性能基准达标、真实模型全流程验收（见 `docs/acceptance.md`）

## 后续里程碑（未实现）

- 其余规划见 `docs/superpowers/plans/` 与 `docs/superpowers/specs/`

## 目录结构

```
├── server/                 # 后端
│   ├── index.js            # 入口（静态托管 dist/、单实例锁、端口 +1 重试）
│   ├── config.js           # 环境变量（PORT / WENXI_DATA_DIR）
│   ├── db.js               # SQLite 初始化 + 迁移
│   ├── db/crud.js          # 通用 CRUD 构造器（乐观锁/软删/回收站/分页/搜索/级联）
│   ├── routes/             # 6 台账 + 附件 + 统计路由
│   └── utils/              # http 工具 / 附件存储 / docx 样式映射
├── src/                    # Vue 3 前端（Dashboard / 6 视图 / 回收站 / 写作工作台 / AI 配置 / Glossary）
├── shared/blocks.json      # data-block 区块枚举单一事实源（9 类，前后端样式映射基准）
├── scripts/seed.js         # 造数脚本（默认 1 万条）
├── build/check-blocks.mjs  # 构建期校验
├── docs/                   # 设计规格 / 性能基准（perf.md）/ 验收清单（acceptance.md）/ 里程碑计划
└── data/                   # 运行时数据（gitignore：wenxi.db / attachments/ / .secret）
```
