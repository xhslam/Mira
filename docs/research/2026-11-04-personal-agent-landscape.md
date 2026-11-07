# Mira Personal Agent 开源项目调研报告

**调研日期：2026-11-04（GMT+8）**
**目标场景：** 用户说一次“每天结束时帮我检查可能忘记的事”，Agent 持续检查获授权的邮件、消息、日历和个人记录，识别未处理事项，主动联系用户，并根据用户反馈继续跟进。

## 一、结论

最值得优先研究的是 **OpenClaw 的主动执行基础设施、nanobot 的精简调度与可靠投递、Inbox Zero 的邮件跟进状态**。GAIA 最接近完整产品形态，但不能忽略它的非商业许可证。Letta Code 可作为长期状态参考，Khoj 可参考个人资料与定时查询的结合，Leon 的主动策略值得观察，但其 2.0 仍属于开发预览。

没有充分证据证明其中任意一个项目已经可靠解决“任意个人消息来源 → 推断责任 → 跟踪完成 → 低打扰查漏”的全部问题。不能把支持聊天渠道等同于能读取用户在该平台上的全部私人消息，也不能把长期记忆等同于可靠任务系统。

对 Mira 的建议是：**借鉴机制，不直接移植一整个助手；先做一个只读、带来源、可纠正的每日查漏闭环。**

## 二、范围与证据标准

本次检索 GitHub 候选，并阅读官方 README、许可证、架构文档、调度/安全文档与部分关键源码；两个独立研究方向补充了记忆与主动策略的核验。未安装或运行这些项目，未连接私人账号，未实测邮件分类质量、后台存活率或通知送达率。

“成熟”按维度判断，而非按 Star 排名：

- 是否有真实可读的运行机制，而不只是功能描述；
- 是否持久化任务、状态和运行历史；
- 是否解释失败、重启和不确定投递；
- 是否明确权限与数据边界；
- 是否有部署、维护和发布证据。

多数证据来自滚动的 `main/master/develop`，不代表某个稳定版本均已包含。取得的发布记录包括 OpenClaw `v2026.8.2`、nanobot `v0.4.0`、Letta Code `v0.34.39`、Khoj `2.0.0-beta.28`，但发布 API 使用了可能缓存的远端提取，**不能将这些版本称为实时最新版**。本报告建议下一轮固定 release/commit 后进行运行验证。部分长文仅取得相关段落，不声称全文审计。

## 三、项目总览

| 项目                                                 | 与目标最相关的能力                             | 判断与局限                                               | 许可边界                                                 |
| ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| [OpenClaw](https://github.com/openclaw/openclaw)     | 常驻 Gateway、持久化调度、Gmail 事件、渠道投递 | 主动执行基础设施优先参考；部署和权限配置较复杂           | MIT                                                      |
| [nanobot](https://github.com/HKUDS/nanobot)          | cron、heartbeat、持久化 outbox、渠道适配       | 最适合先读清最小闭环；有停机和隔离边界                   | MIT                                                      |
| [Inbox Zero](https://github.com/elie222/inbox-zero)  | 待我回复、等待对方、跟进提醒、邮件状态更新     | 邮件查漏最贴近目标；不是通用个人 Agent                   | AGPL v3 文本附商业与企业限制，不能按标准 AGPL 无限制复用 |
| [GAIA](https://github.com/theexperiencecompany/gaia) | 跨应用工作流、后台 worker、待办与消息渠道      | 产品形态贴近目标，系统较重；运营稳定性未验证             | PolyForm Noncommercial，非严格 OSI 开源                  |
| [Letta Code](https://github.com/letta-ai/letta-code) | 有状态 Agent、记忆、会话与执行位置             | 适合研究长期状态；不能把云调度当成全由本地开源运行时提供 | Apache-2.0                                               |
| [Khoj](https://github.com/khoj-ai/khoj)              | 个人资料检索、自然语言定时查询、邮件结果       | 可参考自托管自动化；未证实完整邮箱/消息/日历连接闭环     | AGPL-3.0                                                 |
| [Leon](https://github.com/leon-ai/leon)              | 记忆驱动 Pulse、候选队列、拒绝抑制             | 主动行为策略有价值，但 2.0 为 Developer Preview          | MIT                                                      |

许可证判断基于本次取得的仓库文件。实际复制或商用前仍应按固定版本和具体文件复核，不构成法律意见。

## 四、重点项目拆解

### 4.1 OpenClaw：把主动性落实为运行系统

**已核实的机制：**

1. 调度在 Gateway 中执行，不在模型中。Gateway 必须运行。
2. 任务定义、运行状态和历史持久化在共享 SQLite 中，重启不丢任务。
3. 本次取得的当前文档已将旧 heartbeat 监控迁移为普通 Automation job；不能直接照搬旧文章里的独立 `HEARTBEAT.md` 调度模型。
4. 结果支持聊天 announce、webhook 或静默；执行会话和结果接收会话分开。
5. 区分执行成功与投递结果，可能已到达接收方的发送不盲目重试；不承诺任意工具副作用 exactly-once。
6. 无变化可静默记录，不必每次都打扰用户。

**最重要的安全设计：** Gmail 经 Google Pub/Sub 与 watcher 进入 Gateway，官方推荐独立、低权限的邮件 reader。邮件正文被作为不可信数据；单独 session 不是工具权限隔离。主会话工具默认可能在宿主机执行，因此“自托管”不自动等于“安全”。

**Mira 应学：** 长期授权、触发方式和执行记录分开；从邮件提取信息的组件不应同时拥有发信、Shell、工作区写入等权限。每日查漏必须有明确用户/设备投递绑定，不能随意发到“最近聊天”。

**边界：** standing intent 是面向符合条件的交互输入进行匹配，不是自动监听所有外部事件；长期授权文档也不是硬权限机制，仍需由代码执行权限控制。

来源：[运行与恢复](https://docs.openclaw.ai/automation/cron-jobs/how-it-works)、[Heartbeat 迁移](https://docs.openclaw.ai/gateway/heartbeat)、[结果投递](https://docs.openclaw.ai/automation/cron-jobs/delivery)、[邮件 reader](https://docs.openclaw.ai/automation/cron-jobs/gmail)、[长期意图](https://docs.openclaw.ai/concepts/standing-intents)、[MIT](https://github.com/openclaw/openclaw/blob/main/LICENSE)。

### 4.2 nanobot：先研究任务与投递如何分离

支持一次性、固定间隔和带时区的 cron；普通任务绑定创建它的 topic/session，heartbeat 用于可灵活安排时间、通常静默的检查。当前文档仍保留 `HEARTBEAT.md`，与 OpenClaw 当前机制不同。

它最有借鉴价值的是 **durable outbox**：

- 调度结果先落盘到 `delivery/outbox.sqlite3`，再进入渠道发送队列；
- 每个接收目标独立记录 `pending / sent / failed / unknown`；
- 明确未发送的失败可以重试已保存的消息，不再调用模型；
- 可能已发送的超时/中断记为 unknown，不自动重放；
- sent 表示渠道适配器完成发送，不是用户已读回执。

这使“模型成功生成报告”与“用户能收到报告”成为两个可检查的过程。

**边界：** Gateway 需常驻；停机期间错过的调度不能假设自动补跑。不同项目在同一实例中也不自动隔离长期记忆。heartbeat 默认跟随最近活跃聊天，不宜直接用于含私人邮件内容的 Mira 汇总。

来源：[官方自动化文档](https://github.com/HKUDS/nanobot/blob/main/docs/automations.md)、[安全指南](https://github.com/HKUDS/nanobot/blob/main/docs/guides/secure-local-ai-agent.md)、[MIT](https://github.com/HKUDS/nanobot/blob/main/LICENSE)。

### 4.3 Inbox Zero：最值得学习的邮件查漏领域模型

它不是通用 personal agent，但比“定时总结未读邮件”更贴近你的用例。

官方 Reply Zero 区分：

- **To Reply：** 我欠对方一个回复；
- **Awaiting Reply：** 对方欠我一个回复；
- **Follow-up：** 超过阈值，需要跟进。

官方文档提供可配置阈值、工作日计算、收到或发出新回复后的跟进标签更新，并支持从通知直接打开原邮件或 Mark done 停止提醒。

静态核验其 `outbound.ts`：发送新邮件后读取线程消息、交给模型判断状态，再更新标签与 ThreadTracker；使用账号/线程/消息标识及锁控制重复处理，只有成功处理才写已处理标记。它证明“后续消息改变事项状态”是实际代码路径，不只是营销描述。

**Mira 应学：** 不以未读数量代替义务判断；按线程跟踪“谁欠谁什么”，并让用户看到来源、标记已处理或纠正判断。即使已回复，也不代表附件、材料或其他承诺已经完成，应按事项类型设置完成证据。

**许可警告：** 当前 LICENSE 在 AGPL v3 文本前加入商业变现与五人及以上企业使用限制。不能只看 README 的 open source 表述，或把它当作标准 AGPL-3.0。优先独立实现领域设计，复制代码前单独审查许可。

来源：[Reply Zero 文档](https://docs.getinboxzero.com/essentials/reply-zero)、[出站跟踪源码](https://github.com/elie222/inbox-zero/blob/main/apps/web/utils/reply-tracker/outbound.ts)、[数据库模型](https://github.com/elie222/inbox-zero/blob/main/apps/web/prisma/schema.prisma)、[许可证](https://github.com/elie222/inbox-zero/blob/main/LICENSE)。

### 4.4 GAIA：产品形态最贴近，但不适合直接整套搬入 Mira

官方工作流支持自然语言描述后生成草稿，用户检查创建；触发类型有 Schedule、应用事件和 Manual，接入包括 Gmail、Calendar、Slack 等。

架构将用户对话与后台执行分开：Comms 保持响应，Executor 负责工具，必要时使用隔离子任务。后台由 ARQ/Redis worker 处理提醒、工作流、邮件与记忆维护。实际 `worker.py` 中可见遗失调度任务补扫、孤立待办检查、投递失败处理等任务。

**Mira 应学：** 聊天不是工作队列，用户不必守着对话等执行；委托应有可查看状态、暂停和修改入口。手机、网页或聊天渠道只是接触用户的界面，后台执行不依赖界面存活。

**不建议照搬：** 其多服务、多数据库、多渠道栈对 Mira 首版较重；没有必要先做三层多 Agent 才能完成每日查漏。README 对“接入就自动工作”的描述不应被照搬为静默启动高权限任务。

**许可：** PolyForm Noncommercial，不属于严格 OSI 开源；如果 Mira 面向商业产品，不应默认复制集成其代码。

来源：[工作流指南](https://docs.heygaia.io/guides/building-workflows)、[架构文档](https://github.com/theexperiencecompany/gaia/blob/master/ARCHITECTURE.md)、[worker 源码](https://github.com/theexperiencecompany/gaia/blob/master/apps/api/app/worker.py)、[许可](https://github.com/theexperiencecompany/gaia/blob/master/LICENSE.md)。

### 4.5 Letta Code：长期状态参考，不是现成移动后台 SDK

当前 `letta-ai/letta` README 明确指向 `letta-code` 作为活跃源码，旧 V1 server 位于 archive 分支。不能沿用旧 MemGPT/Letta 教程而不核对版本。

有状态 Agent、memory blocks、对话检索与 MemFS 版本跟踪值得研究；本地调度与云调度的运行条件不同。官网与仓库 scheduling skill 对指定设备离线后是否回退云环境存在差异，本次不判定为已统一行为。

**Mira 应学：** 人物偏好、事件记录、委托和执行会话应分开；长期记忆需要可查看、纠错与删除。执行位置必须显式，不应因为设备离线就静默把私人数据和任务移到云端。记忆不是任务到期触发器。

来源：[源码迁移说明](https://github.com/letta-ai/letta/blob/main/README.md)、[当前实现](https://github.com/letta-ai/letta-code)、[调度 skill](https://github.com/letta-ai/letta-code/blob/main/src/skills/builtin/scheduling-tasks/SKILL.md)、[官网调度](https://docs.letta.com/configuration/schedules)、[Apache-2.0](https://github.com/letta-ai/letta-code/blob/main/LICENSE)。

### 4.6 Khoj 与 Leon：可借鉴，但不要误认成成熟全功能底座

**Khoj：** 自动化支持按本地时区定期执行查询并邮件交付；自托管需配置认证与 Resend。源码可见 APScheduler/CronTrigger。邮件投递不等于邮箱读取授权。本次未核验完整 Gmail/即时消息/日历同步。当前源码有 Khoj Cloud 弃用提示，文档仍保留云服务链接，应以自托管参考为主，云服务可用性未实测。AGPL 义务需单独评估。

来源：[Automations](https://docs.khoj.dev/features/automations/)、[自动化 API](https://github.com/khoj-ai/khoj/blob/master/src/khoj/routers/api_automation.py)、[弃用提示](https://github.com/khoj-ai/khoj/blob/master/src/interface/web/app/components/deprecationBanner.tsx)、[LICENSE](https://github.com/khoj-ai/khoj/blob/master/LICENSE)。

**Leon：** 2.0 develop 的 Pulse 从记忆和上下文生成行动候选，有限队列、fingerprint 去重；完成后冷却，拒绝后递增抑制。它回应“主动但不要烦”的问题，而不只是时间触发。已核验 Gmail readonly 工具，但日历 toolkit 的 tools 为空；不能因有目录名就认定完整接入。Node 进程定时器和会话/语音消息也不等于手机关闭后的系统推送。

来源：[Pulse 源码](https://github.com/leon-ai/leon/blob/develop/server/src/core/pulse-manager.ts)、[Gmail 工具](https://github.com/leon-ai/leon/blob/develop/tools/communication/gmail/tool.json)、[日历工具集](https://github.com/leon-ai/leon/blob/develop/tools/calendar_scheduling/toolkit.json)、[版本说明](https://github.com/leon-ai/leon/tree/develop)。

## 五、这些项目共同说明了什么

### 5.1 主动 Agent 至少需要六种机制

| 机制     | 不能被什么替代        | Mira 应保存的核心内容                              |
| -------- | --------------------- | -------------------------------------------------- |
| 长期委托 | 聊天摘要、向量记忆    | 目标、范围、触发、时区、授权、暂停状态             |
| 外部连接 | 模型知道 Gmail 是什么 | 账号、只读 scope、同步游标、授权撤销、最后成功时间 |
| 事项状态 | 未读标签、一段总结    | 责任人、来源、截止时间、状态、完成证据、用户纠正   |
| 执行调度 | 模型答应“每天会做”    | 到期实例、锁/租约、重试预算、恢复记录              |
| 主动决策 | 每轮都发消息          | 新变化、紧急程度、静默策略、冷却与用户偏好         |
| 可靠投递 | 模型输出成功          | 已保存结果、目标用户、通知 ID、失败/未知状态       |

建议的事项生命周期是 `候选 → 已确认待办 / 等待对方 / 需澄清 → 已完成 / 已取消`。这是对 Mira 的设计建议，不是声称某个项目已提供完全相同模型。

### 5.2 每日查漏不应让模型从零重读全部邮件

建议采用增量路线：

```text
新邮件/消息/笔记变更
  → 增量同步与去重
  → 低权限提取事项候选和来源
  → 合并并更新现有事项状态
  → 晚间按委托范围检查未解决事项
  → 保存带证据的摘要
  → 投递通知
  → 用户确认、延后或纠正
```

用户问“今天有没有忘记什么”与晚间自动任务应调用同一套查漏逻辑，区别只在触发方式。模型适合提取与解释；授权、数据范围、去重、状态转换、重试和投递应由程序约束。

## 六、结合 Mira 当前代码的建议

### 6.1 可以复用的基础

本次读取了 `src/ai/automation.ts`、`automation-runner.ts`、此前查看的 `src/app/app-shell-screen.tsx` 与依赖配置：

- 已有带时区的 daily/weekly/app-open 任务定义；
- 已有按 occurrenceKey 查运行、成功/暂停/可重试/终止等状态；
- 已有授权笔记路径、全库搜索开关、Provider 和安全密钥存储；
- AI 修改以待审阅 proposal 进入，不直接静默改笔记；
- 原生笔记、SQLite 和应用 UI 可继续作为本地信息与控制界面。

这些说明 Mira 不必推倒重来，但并不证明其已有可靠的 personal agent 服务。

### 6.2 当前最关键缺口

App Shell 在启动和回到 active 时调用 `runDue()`；当前 runner 不是独立常驻调度器。仅将现有任务叫作“每日查漏”，不能承诺关闭 App 后仍执行。

此外，现有任务主要绑定工作区笔记上下文；本次没有在这条自动任务链路中看到邮箱增量连接器、跨来源事项账本或系统通知 outbox。现有 running 状态若进程中断后的恢复策略，也需要单独验证，不能直接宣称已具备可恢复队列。

Expo 57 官方 BackgroundTask 文档明确：后台任务由系统选择执行时间；Android WorkManager 最短周期是 15 分钟，iOS BGTaskScheduler 按系统条件安排，用户终止 App 等情况会影响任务执行。

**结论：** 本地定时通知可以提醒用户打开 App，但不代表后台已完成最新邮件分析。要在用户不打开 Mira 时仍持续检查，优先考虑一个常驻的用户自托管或托管 worker；移动后台同步作为补充，而非唯一保障。服务端调度同样不保证手机通知绝对准点，应记录执行和送达状态。

来源：[Expo SDK 57 BackgroundTask](https://docs.expo.dev/versions/v57.0.0/sdk/background-task/)。

### 6.3 建议首版范围

1. **一个邮箱来源＋Mira 内明确记录的计划。** 邮箱服务商由目标用户决定，不默认把 Gmail 当作所有人的首选。
2. **只读接入。** 不自动发信、删除、归档或标记已读。授权与给模型的数据范围应可解释、可撤销。
3. **委托确认只澄清关键项。** “每天结束”没有具体时间，应确认时间、时区和来源后持久化，用户无需每天重说。
4. **每日一份查漏摘要。** 优先列真正可能遗漏的事项，每条带来源、推断原因与相关时间。
5. **可纠正闭环。** 支持“已处理”“不是我的事”“明天再说”“以后不提醒这类事”。不能仅靠模型猜测关闭事项。
6. **覆盖范围显式。** 显示哪些账号检查成功、最近成功时间；同步失败时应说“本次未能检查邮箱”，不能说“今天没有遗漏”。
7. **结果保存与通知分离。** 通知失败时重试已保存结果，不重新触发所有外部读取和模型判断。

暂不做：任意第三方 App 消息抓取、无约束自主执行、通用 Shell/浏览器控制、完整多 Agent 平台、自动代用户作承诺。接入一个聊天 bot 不意味着能读到用户全部历史聊天，相关平台权限要逐个确认。

### 6.4 首版验收应看结果，而非功能数量

- App 未打开，worker 能否生成本次摘要；设备离线后是否仍能查看已保存结果；
- 重启、重复 webhook、重复调度是否重复建事项或重复通知；
- 用户已经处理或取消后是否停止提醒；
- 邮件中的恶意指令能否影响工具调用或跨账户数据访问；
- 账号授权撤销、游标失效、网络和模型失败是否可见；
- 每条提醒是否有可打开的来源，日期/时区是否正确；
- 统计提醒准确率、误报、用户否定与关闭比例；置信度不能只相信模型自报分数。

## 七、推荐阅读顺序与最终取舍

1. **nanobot automations：** 先读懂“任务、执行、消息 outbox”三个对象如何分开。
2. **OpenClaw 调度/恢复/Gmail reader：** 学完整运行和低权限边界，不照搬宽工具权限。
3. **Inbox Zero Reply Zero 与 outbound tracker：** 学责任与跟进状态，不以未读代替遗漏。
4. **GAIA workflow 和 worker：** 学长期委托产品交互与前后台分离，避免首版过重。
5. **Letta Code / Khoj / Leon：** 分别补充长期记忆、资料驱动自动化与主动性抑制。

**最终建议：** Mira 应成为“维护个人未完成事项、可主动查漏的助手”，而不只是“笔记 App 多加一个聊天框”。第一阶段最值得投入的是可持久化的委托与事项账本、一个只读连接器、可持续执行的 worker，以及带依据的结果投递。人格、多 Agent 数量和工具数量都不是这个阶段的主要验收目标。
