# 文玺验收清单

日期：2026-08-10（M6 收尾验收）

| # | 验收项 | 结果 | 备注 |
|---|--------|------|------|
| 1 | 7 台账模块 CRUD + 回收站全通过 | 通过（测试） | 自动化测试覆盖：`test/` 18 个后端测试文件（crud 构造器/乐观锁 409/软删/回收站恢复与永久删/分页/keyword 搜索/级联清理） |
| 2 | 公文写作 4 场景 + 润色全流程（真实模型） | 通过（实测） | 2026-08-10 实测：DeepSeek `deepseek-v4-flash`（baseUrl `api.deepseek.com`，环境变量 `DEEPSEEK_API_KEY`）配置激活后，weekly/draft/polish/report 4 场景 curl 全流程 SSE 流式输出至 `data: [DONE]`；Ollama 本机不可达，按前序裁决改用 DeepSeek 真实模型 |
| 3 | GB/T 与内部材料排版切换正确 | 通过（测试） | `test/export-word.test.js` 6 用例：GB/T 缺发文字号 40003、版记规则（gbt 1 次 / internal 0 次 / forceBanji 1 次）、版记不重复输出；前端 Writing.vue 导出面板 GB/T ↔ 内部材料单选切换 + forceBanji 开关 |
| 4 | Word/Excel 导出（含超量异步分支） | 通过（测试） | `test/export-api.test.js` 8 用例：word 导出 fileId/历史、GB/T 40003、下载 Content-Disposition、writings 联动回写与 409、excel 同步 ≤5000、**5001 行转异步 jobId**、过期 41001、未知 fieldKey 忽略；同步导出（≤5000 行）5s 目标为人工验收项 |
| 5 | 附件上传/预览/下载/软删清理 | 通过（测试） | `test/attachments.test.js` 自动化覆盖：≤20MB 限制、uuid 重命名存储、防路径遍历、下载、软删、7 天清理 |
| 6 | 性能基准达标 | 通过（实测） | `docs/perf.md`：10000 条数据下列表+keyword p95 6.4ms（目标 <200ms）、统计 monthly p95 6.0ms（目标 <500ms） |

验收结论：6 项全部通过（4 项自动化测试 + 2 项真实环境实测：真实模型全流程、性能基准）。未发现未通过项。

注：真实模型验收依赖外部服务（DeepSeek API），若后续离线环境不可达，可在已配置激活模型的前提下以连接测试（`POST /api/ai/test`）替代全流程并记录环境限制。
