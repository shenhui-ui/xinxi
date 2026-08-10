# 性能基准

数据量：10000 条 tasks（data/seed.db，`npm run seed 10000` 生成）
运行方式：`npm run bench`
| 场景 | 采样数 | p95 目标 | 实测 p95 |
|---|---|---|---|
| 列表+keyword | 100 | <200ms | 6.4ms |
| 统计 monthly | 100 | <500ms | 6.0ms |

注：导出场景未纳入自动基准——POST /api/export/excel 在行数 >5000 时转异步 jobId，采样无法覆盖同步分支；同步导出（≤5000 行）的 5s 目标由人工验收。
