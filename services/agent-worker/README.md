# Mira Agent Worker v1

独立 Node 24 TypeScript 服务；不依赖 Expo、React Native、手机数据库或额外 npm runtime 包。使用 Node 原生 type stripping 和 `node:sqlite`，不需要构建。仅对手机上传、用户已批准的每日委托及事项快照做确定性查漏；不调用 Provider，不执行 prompt 中的指令，不连接邮箱、消息或系统推送。

## 运行

在项目根目录运行，先通过你自己的安全凭据方式给进程设置环境变量：

```sh
# MIRA_WORKER_TOKEN：必需，32..512 个无空白字符的随机密钥；不要提交、记录或复用示例密钥。
# MIRA_WORKER_WORKSPACES：必需，逗号分隔的已授权 workspace ID。
# 以下命令不会替你生成、打印或保存密钥。
node services/agent-worker/main.ts
```

| 环境变量                   | 默认 / 约束                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `MIRA_WORKER_TOKEN`        | 必需；全部请求使用 Bearer 认证                                     |
| `MIRA_WORKER_WORKSPACES`   | 必需；1–100 个不重复 workspace ID；同一 token 只授权该清单         |
| `MIRA_WORKER_HOST`         | `127.0.0.1`                                                        |
| `MIRA_WORKER_PORT`         | `4317`，可配置 1–65535                                             |
| `MIRA_WORKER_DB`           | `~/.mira-agent-worker/worker.sqlite`；不可指向手机或其他应用数据库 |
| `MIRA_WORKER_ALLOW_REMOTE` | 非 loopback 绑定须显式设为 `1`；不自动改变防火墙或开放端口         |

进程每 15 秒检查排程；SIGINT/SIGTERM 关闭服务。退出后不再执行，必须由用户自行选择常开主机和进程托管方式。本实现不部署服务、不创建账号，也不声称 24 小时必达。

默认 loopback 仅供本机；手机上的 `127.0.0.1` 指向手机，不是电脑。远程接入优先由受信 HTTPS 反向代理终止 TLS，worker 保留 loopback。开放 LAN HTTP 会明文传输 token 和事项内容，存在窃听/篡改风险，不建议用于实际数据；Android/iOS 还可能阻止 cleartext HTTP。本实现没有替用户放宽 App 网络安全策略。单一 token 的持有者可读写清单中所有 workspace；需要独立权限时运行独立实例/密钥。撤销 workspace：更新环境清单并重启，保留但不再执行或暴露其历史；轮换 token 也需要重启。

## HTTP 协议

所有时间均为 Unix 毫秒整数；响应含 `protocolVersion: 1`。请求 JSON 严格拒绝未知字段；没有 CORS 放行或未认证健康检查。

- `GET /v1/status`：`{protocolVersion,service:'mira-agent-worker',serverTime,workspaces:string[],capabilities:{execution:'deterministic-item-review',email:false,messages:false,systemPush:false},storage:{workspaces:[{workspaceId,runs,results,capacityBlocked}]}}`。
- `PUT /v1/workspaces/:id/manifest`：见下方完整请求。成功响应 `{protocolVersion:1,acceptedSyncVersion,receivedAt}`。必须持久化成功才返回 200。
- `GET /v1/workspaces/:id/results?after=0&limit=50`：返回 `{protocolVersion:1,results:WorkerResult[],nextCursor:string,hasMore:boolean}`。`after` 是十进制序号字符串（不是 ID）；`limit` 1–100。`cursor` 是服务全局递增序号，但查询按 workspace 隔离。
- `GET /v1/workspaces/:id/runs?limit=50`：返回最近运行，形状见下节。默认 50，范围 1–100；仅接受 `limit` 参数，重复参数拒绝，按 `createdAt` 降序、同时间按 occurrence key 降序。使用相同认证及 workspace 授权。
- `POST /v1/workspaces/:id/ack`：`{protocolVersion:1,resultIds:string[]}`，最多 100 项。响应 `{protocolVersion:1,acknowledged:number}` 表示本次新确认条数，未知/已确认 ID 忽略；不泄漏其他 workspace 结果。

```json
{
  "protocolVersion": 1,
  "workspaceId": "my-workspace",
  "syncVersion": 1,
  "snapshotAt": 1793869200000,
  "delegations": [
    {
      "id": "daily-review",
      "version": 1,
      "name": "每日查漏",
      "prompt": "检查已上传事项；本字段仅记录目标，不交给模型执行",
      "enabled": true,
      "scope": ["commitments"],
      "schedule": { "kind": "daily", "hour": 21, "minute": 0 },
      "timezone": "Asia/Shanghai"
    }
  ],
  "items": [
    {
      "id": "item-1",
      "title": "确认明天安排",
      "status": "awaiting_confirmation",
      "dueAt": null,
      "snoozedUntil": null,
      "source": "user"
    }
  ]
}
```

完整 TypeScript 类型和校验器在 [`contract.ts`](./contract.ts)。限制：ID 匹配 `[A-Za-z0-9][A-Za-z0-9_-]{0,79}`；委托最多 100 个，事项最多 500 个，请求体最多 1 MiB。名称 200 字符，prompt 8000 字符，事项标题和来源 2000 字符。事项状态为 `open | awaiting_confirmation | completed | dismissed`。`dueAt` / `snoozedUntil` 必须存在，可为 null。上传时快照时间不可超过服务时间 60 秒；落盘后只做结构校验，不重做上传 freshness 判断，因此时钟回拨不会使已接受快照失效；过旧快照仍可检查，但每个结果显式返回原快照时间，不称为实时同步。

每个委托必须明确包含 `scope: ["commitments"]`，且只支持精确该单元素数组。缺失、空、重复、email-only、混合或其他 scope 全部拒绝，不会暗中扩大为事项检查。客户端必须按用户实际批准的范围筛选，不可将 email-only 委托改标成 commitments。旧原型中不含 scope 的 manifest 不自动迁移或授权；需重新明确批准并上传更高 `syncVersion` 和委托 `version`，原数据库和执行历史保留。本次属于发布前 v1 协议修订。

`syncVersion` 必须严格递增；相同版本且内容完全相同可安全重试，返回原 receipt。新版本不会覆盖执行历史。委托内容（包括 enabled）变化必须提高委托 `version`。删除委托保留版本 tombstone；重加同 ID 必须提高版本。协议没有云端合并：调用方应保持一个 workspace 单写者；版本冲突 409 必须处理，不能自动无限重试。

`WorkerResult` 包含：`id,cursor,workspaceId,delegationId,delegationVersion,occurrenceKey,createdAt,snapshotAt,syncVersion,coverage,findings,delivery,acknowledgedAt`。其中：

```json
{
  "coverage": {
    "sources": ["uploaded-items"],
    "unavailable": ["email", "messages"],
    "mode": "snapshot-only",
    "snapshotAt": 1793869200000,
    "checkedAt": 1793872800000
  },
  "findings": [
    {
      "itemId": "item-1",
      "title": "确认明天安排",
      "source": "user",
      "reason": "awaiting_confirmation"
    }
  ],
  "delivery": "pending",
  "acknowledgedAt": null
}
```

reason 还可为 `overdue`、`due_today`。已完成、已排除和仍在延后的事项不产生 finding；待确认优先，其次逾期，再其次当天到期。空 findings 只表示该快照下无这三类事项，不表示检查了外部世界。prompt 不是可执行代码，也不是 AI 提取结果。

错误响应 `{protocolVersion:1,error:string}`；400 输入无效、401 认证失败、403 workspace 未授权、404 路由不存在、409 版本冲突、413 请求过大、503 存储或容量不可用。不会返回 token 或数据库异常细节。

## 最近运行与固定错误码

`GET /v1/workspaces/:id/runs?limit=50` 返回：

```ts
{
  protocolVersion: 1;
  runs: Array<{
    id: string; // occurrence key，不是 token，也不是 UUID
    delegationId: string;
    delegationVersion: number;
    state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
    attempts: number;
    createdAt: number; // Unix 毫秒
    errorCode: string | null;
  }>;
}
```

没有 cursor/hasMore；这是受限最近历史，不是结果收件箱分页的替代。失败达到三次上限后，终态 `failed` 跨重启可见。仅返回固定错误码 `review_failed`（执行/结果保存失败）、`lease_expired`（租约超时，包括崩溃恢复），否则 null；不序列化异常文本、原始数据库行或 lease owner。重试成功清除错误码；pending/running 可携带前次尝试的固定错误码。其他 workspace 的记录不会返回。终态运行仍遵循下述 30 天保留规则。

## 调度、恢复与投递语义

- daily 使用 IANA 时区和本地日历日；occurrence key 为 `workspace:delegation:vVERSION:YYYY-MM-DD`。当前本地时间达到计划分钟即运行；首次启动或长期离线只处理当天，不补发无限历史天。
- DST 春季不存在的分钟在当日第一次达到更晚分钟时运行；秋季重复小时只运行一次。版本日期 watermark 防止时钟倒退导致重复。同一天新委托版本可产生新的 occurrence。
- claim 与执行分别事务落盘。租约 60 秒；超时后重启/下一 tick 恢复，owner fencing 拒绝旧执行者。每个 occurrence 最多尝试 3 次，执行失败退避 30 秒。跨日本地旧 occurrence 取消，不继续补跑。
- 委托删除、暂停或版本变化会取消未完成 occurrence；执行前重新读取最新事项状态。成功结果和 run 成功状态在同一事务保存。手机 manifest 不能清空 run/outbox。
- outbox 是 API 可读取的持久化结果，并不是系统推送。读取不会改投递状态；App 应先按 result.id 去重并本地持久化，再 ack。HTTP 响应未知时重新读/ack 安全，不重新执行任务或外发。`acknowledged` 只代表 App 确认持久接收，不代表人已阅读。
- 没有任何外部发送 adapter，因此不存在把不确定发送自动重发的路径。未来若加 adapter，必须单独设计 unknown 状态和对账，不可将当前 polling ack 当作推送回执。

## 数据持久化与上限

独立 SQLite 数据库，FULL synchronous + rollback journal，事务原子保存，不与手机共享。新建目录 0700，数据库 0600，CLI umask 0077；数据库文件不接受符号链接。请使用用户私有目录，勿放在共享/不可信父目录；现有父目录权限不会擅自改写。数据库含明文事项，应使用主机磁盘加密和权限控制。启动 quick_check 失败或未知 schema version 会中止，绝不删库或清空恢复。恢复应保留原数据库并由用户选择已验证备份，不提供自动破坏性修复。

每 workspace 最多 10000 个 run、10000 个结果；未 ack 的结果不会自动删除。ack 超过 30 天的结果与相应过期终态 run 会在 tick 时清理，保留委托版本/date watermark。达到容量后停止创建新 occurrence，`status.storage` 返回 `capacityBlocked`，不丢弃未确认结果；App 需要同步并确认，必要时由管理员备份和维护。委托 tombstone 最多 10000 个独立 ID，超限上传返回 503；不要用随机新 ID 代替委托版本更新。服务不会无限增长，也不会假装容量阻塞时任务成功。

## 验证

```sh
npx vitest run tests/unit/agent-worker/worker.test.ts
npx tsc -p services/agent-worker/tsconfig.json
npx prettier --check services/agent-worker tests/unit/agent-worker
```

测试注入时钟，不访问外部网络；HTTP 集成测试仅短暂绑定 loopback 随机端口并关闭。覆盖 schema、认证与隔离、快照覆盖、幂等、取消/版本、租约重启与 fencing、有限重试及失败运行 API、scope 拒绝/隔离、时钟回拨跨日去重、时区/DST、分页/ack、保留清理和损坏不清库。Node 24 原生启动另可在缺少 token 时验证 fail-closed；没有启动长驻服务等待用户。

限制：未配置模型/真实只读账号连接器；无 OAuth 配对服务、HTTPS 终止、OS 推送、监控告警或云部署；物理设备网络与后台生命周期未验收。可用性依赖承载服务的主机、电源、时钟和网络，不构成后台必达承诺。
