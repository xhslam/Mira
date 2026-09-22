# Inkstone 修缮历史与防回归账本

**最后更新：** 2026-09-22
**事实来源：** Git 提交、当前源码、自动化测试、架构文档与已记录的真机验证

本文记录当前仓库中能够由代码或设备证据确认的修缮历史。功能开发记录仍以
[`CHANGELOG.md`](../CHANGELOG.md) 和 [`product-status.md`](product-status.md) 为准；一次故障的完整
复盘放在 `docs/incidents/`，长期不可回退的技术决策放在 `docs/adr/`。

## 维护规则

每次修复必须同时完成以下事项：

1. 在本账本增加一条记录，写明症状、根因、保护性不变量和证据。
2. 用户数据事故、真机事故、安全边界或离线发布事故必须增加独立 incident 文档。
3. 任何需要长期遵守的实现约束必须写入 ADR 或架构文档。
4. 至少增加一项能在修复前失败、修复后通过的自动化测试。
5. 涉及 WebView、键盘、文件、字体或原生打包的修复必须保留真机/产物验证步骤。
6. 不得以重写用户 Markdown、降低 TypeScript 严格度、放宽 CSP/权限或删除回归测试换取通过。
7. 发布前执行 [`release-checklist.md`](release-checklist.md)，并记录最终 APK 的版本、签名、
   SHA-256 和目标设备。

## 修缮索引

| ID                 | 日期       | 范围                          | 症状与根因                                                                                                                                                                                                                   | 防回归锁                                                                                                                                                                                                                                                                                                                             | 状态         |
| ------------------ | ---------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| FIX-2026-07-30-001 | 2026-07-30 | 工作区写入                    | 并发写入可能绕过单写者语义，导致已验证写入之间竞态。                                                                                                                                                                         | `workspace-repository` 共享契约覆盖并发 create/write；提交 `6e05ac1`。                                                                                                                                                                                                                                                               | 已修复       |
| FIX-2026-07-30-002 | 2026-07-30 | 移动端布局                    | 根视图未完整尊重系统安全区，内容可能进入状态栏或手势区域。                                                                                                                                                                   | `react-native-safe-area-context` 成为根布局边界；提交 `65f6849`。                                                                                                                                                                                                                                                                    | 已修复       |
| FIX-2026-07-31-001 | 2026-07-31 | 编辑器焦点/键盘               | flush 调用 `blur()` 会让 Android WebView 脱离原生窗口焦点，出现键盘闪现和后续点击失效。                                                                                                                                      | flush 禁止改变焦点；原生只在显式用户动作隐藏键盘；焦点策略与诊断测试常驻。                                                                                                                                                                                                                                                           | 已修复       |
| FIX-2026-08-15-001 | 2026-08-15 | Android 离线发布              | 调试 APK 依赖 Metro，断开 8081 后显示 “Unable to load script”；DOM 字体还必须进入最终资产阶段。                                                                                                                              | `npm run android:release` 校验原生 bundle、唯一 DOM HTML/JS/source map 和 KaTeX/Excalidraw WOFF2 字体；发布清单要求断开 Metro 冷启动。                                                                                                                                                                                               | 已验证       |
| FIX-2026-08-15-002 | 2026-08-15 | 学习页纵向滚动                | 逐句朗读页使用普通 `View` 承载超长内容；资料库 Markdown 导入和导入弹层的滚动区未显式约束高度与 Android 嵌套手势，造成内容无法稳定上下滑动。                                                                                  | 逐句朗读、学习内容与导入选项均保留独立 `ScrollView`，明确可用高度、`keyboardShouldPersistTaps="handled"` 和 `nestedScrollEnabled`；`vertical-scroll-regression` 测试常驻。                                                                                                                                                           | 已修复       |
| FIX-2026-08-15-003 | 2026-08-15 | 资料库视觉层级                | 资料列表、当前材料与处理操作被拆成多个弱层级区块，首屏无法快速辨认当前材料和四个主要动作；跨栏目复用滚动容器还会继承旧位置。                                                                                                 | 当前替代结构固定为“筛选栏 → 可选择资料清单 → 当前资料 2×2 操作卡”，搜索入口只占用标题栏，栏目切换重建滚动视口；`learning-library-layout-regression` 测试锁定结构、选择路径与全部操作入口。                                                                                                                                           | 已重排       |
| INC-2026-08-15-001 | 2026-08-15 | Markdown 数学公式             | 混合转义与嵌套 `\[...\]` 使正则提前闭合公式，KaTeX 收到非法 LaTeX；公式显示为红色源码。                                                                                                                                      | 独立线性 tokenizer、仅渲染副本归一化、资源上限、DOM 错误码、28 项相关测试和 26/26 真机公式验证。                                                                                                                                                                                                                                     | 已修复并安装 |
| FIX-2026-08-15-004 | 2026-08-15 | 英语陪练闭环                  | 课程确认恢复时按英文重新合并候选，覆盖用户取消、重点和编辑；首轮角色扮演可能显示上一阶段反馈；纠正或手动补选内容会被错误记为独立完成，保存后也没有进入逐句练习。                                                             | `english-coach-domain` 以稳定 `localId` 覆盖核心草稿；首轮 roleplay 固定角色开场；只有真实完成才写入提示证据与熟悉度；保存句子会写入 Learning 的逐句练习导航状态。16 项英语陪练回归测试锁定恢复、纠正、中文复现、保存与导航。                                                                                                        | 已修复       |
| FIX-2026-08-15-005 | 2026-08-15 | 英语陪练并发与候选完整性      | 会话保存使用渲染时旧快照且异步不等待，草稿可被暂停或 Provider 回写覆盖；同批 Provider 候选与保存候选没有防御性去重；自然复现来源标记丢失。                                                                                   | `serialized-state-queue` 保证所有会话变更按最新快照串行持久化；切换/暂停先取消请求并落盘；候选在追加和保存两层按规范化英文去重；计划选中的 replay ID 写入课程卡片来源。23 项领域、队列与跳转链路测试锁定。                                                                                                                           | 已修复       |
| FIX-2026-08-15-006 | 2026-08-15 | 英语陪练写入失败与复现映射    | 暂停队列在前序草稿写入失败后仍可能写入旧快照并切换模式；复现来源直接比较历史表达 ID 与 Provider 核心 ID，真实数据无法匹配。                                                                                                  | 状态队列阻断前序失败后的暂停，确认页保留最新候选供原子重试，且切换只在暂停成功后进行；授权历史表达以 `replayExpressionId` 注入互不覆盖的核心课程表达，课程卡片以该映射标记复现来源。25 项失败写入与跨 ID 映射回归测试锁定。                                                                                                          | 已修复       |
| FIX-2026-08-20-001 | 2026-08-20 | 短语与记忆数据质量            | 旧候选生成按连续 2–3 词 N-Gram 切片，普通相邻词与残缺片段可进入短语库；短语和长期记忆也没有独立信息架构。                                                                                                                    | 唯一 `phrase-recognition` 入口以显式可复用表达规则、边界验证、`0.80` 置信度门槛、canonical 去重和上下文合并写入；人工保存可绕过置信度但仍去重；v4 快照保留旧短语并初始化独立记忆集合。                                                                                                                                               | 已修复       |
| FIX-2026-08-31-001 | 2026-08-31 | 学习导航信息架构              | “首页、发现、资料库”重复展示同一批本地材料、类型筛选和学习跳转；“个人资料”实际承载设置，却与高频学习任务并列，练习退出也依赖切换栏目。                                                                                       | 学习二级导航只保留“今天、资料”；旧 `discover` 状态统一投射到资料页；搜索和导入集中在资料页，设置改为标题栏次级入口；练习和设置使用来源明确的返回操作；`learning-navigation` 与布局回归测试常驻。                                                                                                                                     | 已简化       |
| FIX-2026-08-31-002 | 2026-08-31 | 学习视觉系统与创建入口        | “创建”入口夹在今天页内容标题中，无法在资料页复用；今天页进度、最近资料和资料页当前选择的层级也与精简导航脱节。                                                                                                               | Craft 创建入口迁移到标题栏并紧邻设置，关闭后返回触发来源；今天页固定“继续学习 → 环形今日进度 → 三条最近资料”，资料页恢复显式资料选择并保留四项处理动作，设置项收进单一表面；设计与资料库回归测试常驻。                                                                                                                               | 已重做       |
| FIX-2026-08-31-003 | 2026-08-31 | 资料库渐进操作与删除          | 资料选中后四项处理操作始终裸露在列表下方，挤压浏览空间；同时资料无可见删除入口，标题栏“创建”又与“导入资料”分裂为两条相近路径。                                                                                               | 资料列表默认收起操作，仅当前点击项在原位展开四项操作与删除，切换项时前项自动收起；删除必须经破坏性确认并统一调用 `deleteLearningResource` 清理依赖记录，不删除设备原始文件；标题栏只保留“导入资料”，Craft 成为导入面板首项并替代旧录音入口。`learning-library-layout-regression` 与删除领域测试常驻。                                | 已修缮       |
| FIX-2026-08-31-004 | 2026-08-31 | 主导航与 URL 导入层级         | 主导航顺序与当前任务优先级不一致；URL 表单嵌在资料列表内，“导入文字”又与创建学习材料重复，导致导入路径层级混杂。                                                                                                             | 主导航固定为“学习 → 笔记 → AI → 画板 → 设置”；URL 导入使用独立 `url-import` 页面并从来源页原路返回，导入完成后进入资料页；导入面板移除“导入文字”，资料页不再渲染 URL/文字输入框。导航与设计回归测试锁定顺序、页面边界和入口去重。                                                                                                    | 已简化       |
| FIX-2026-08-31-005 | 2026-08-31 | 默认入口、笔记总览与全局侧栏  | App 启动和工作区恢复仍落到笔记编辑器；笔记导航缺少总览层，编辑标签也无法关闭；文件抽屉挂在编辑器子树中，其他主页面不能使用。                                                                                                 | 工作区就绪后固定进入学习；笔记入口先显示双列总览，打开后只聚焦目标与未保存/恢复标签；关闭标签先完成 WebView flush 与验证保存，最后一个标签返回总览；侧栏提升到 App Shell 并继续使用同窗口 `OverlaySideSheet`，禁止以原生 Modal 打断编辑器焦点。领域与源码回归测试常驻。                                                              | 已修缮       |
| FIX-2026-09-01-001 | 2026-09-01 | 侧栏动效与笔记重命名          | 侧栏按钮以两根长笔画硬切为标准叉号，和面板滑入节奏割裂；编辑页标题不可操作，重命名只能绕到文件抽屉；三点菜单同时裸露当前笔记动作与三项备份维护操作。                                                                         | 侧栏和圆角短笔画形变共享可中断弹簧并支持减少动态效果；标题提供同窗口内联重命名，限定只改文件叶名称并保留目录与 Markdown 扩展名，真实写入前完成保存与冲突处理；三点菜单只保留高频笔记动作，备份能力以二级页渐进披露。`note-rename` 与导航源码回归测试常驻。                                                                           | 已修缮       |
| FIX-2026-09-01-002 | 2026-09-01 | 画板文件创建                  | 新建画板表单使用原生 `Modal` 独立窗口，在 Android 上切走编辑器窗口焦点后仍要求隐藏 WebView 完成 flush，创建链路可能超时；异步创建若抛异常也没有 `catch`，界面无法给出失败原因。                                              | 创建表单改为当前 Activity 内的绝对定位遮罩，提交前收起键盘并保留编辑器 flush/保存校验；画板名称经独立边界函数生成安全的 `.excalidraw.md` 路径，创建返回失败、重名和异常均显示反馈。`drawing-create`、创建界面源码、Excalidraw 格式与工作区浏览器回归测试常驻。                                                                       | 已修复       |
| FIX-2026-09-01-003 | 2026-09-01 | CI 设备证据与 Android 导出    | `quality` 在干净 checkout 中运行设备基线与无障碍测试时，所需 manifest、四张截图和 hierarchy XML 被宽泛的 `artifacts/` 规则忽略，CI 以 `ENOENT` 失败；后续导出步骤还绕过仓库封装，触发 Expo 57 共享分块缺失且错误退出码为 0。 | `artifacts/` 默认继续忽略，仅显式纳入六个稳定测试夹具；截图 manifest 保留 SHA-256 校验，无障碍 hierarchy 继续验证标签和 48 dp 触控目标；工作流固定调用 `npm run export:android -- --clear`，由封装禁用不兼容的 bundle splitting 并校验离线 DOM 资产。缺少夹具或导出资产时必须失败。                                                  | 已修复       |
| FIX-2026-09-11-001 | 2026-09-11 | 侧栏按钮可见性收敛            | 侧栏展开按钮在笔记编辑器、英语陪练、学习次级页面（逐句学习、设置、URL导入）与悬浮遮罩（短语速记、造句工坊）重复出现，出现频次过高且干扰任务。                                                                                | 侧栏展开按钮限定仅在各模块首页展示（学习首页“今天”、笔记总览、AI Markdown助手、画板首页、设置首页）；次级页面移除侧栏按钮，笔记编辑器使用“返回笔记”替换，学习次级页面统一使用返回键并移除悬浮侧栏按钮；`sidebar-visibility-regression` 测试常驻。                                                                                    | 已修缮       |
| FIX-2026-09-18-001 | 2026-09-18 | 全局视觉设计系统重构          | 样式散落硬编码数值、缺乏统一语义阶梯、卡片与浅底存在融边隐患、空状态缺乏层级引导；严格按 `UI_DESIGN_SYSTEM_GUIDE` 规范全局重构。                                                                                             | `theme` 注入 Cool Slate 灰阶、Brand Indigo、离散间距 (4-96px)、双层立体阴影与字号阶梯；核心视图全量应用卡片微边框/抗融边、Pill形态/Action金字塔与引导型空状态；130 个套件、704 项测试全绿。                                                                                                                                          | 已重构       |
| FIX-2026-09-19-001 | 2026-09-19 | 全页面视觉与交互规范重构      | 用户要求“每个页面都需要重构”；全应用所有页面（App Shell、学习/笔记/AI/画板/设置全域、各次级抽屉与弹窗）彻底贯彻 `UI_DESIGN_SYSTEM_GUIDE` 规范（离散令牌、层级排版、操作金字塔、防御空状态、44+ dp 触控靶）。                 | 离散间距 (xs~~4xl)、圆角 (xs~~full/card/modal)、双层阴影全量落地；全套 45+ 页面/弹窗重构并通过无损回归；130 个套件、704 项测试全绿，typecheck/lint/format:check 零错误；备份保留在 `backup/pre-ui-guide-full-refactor-20260919`。                                                                                                    | 已重构       |
| FIX-2026-09-21-001 | 2026-09-21 | 学习资料手动创建与 Craft 分层 | “创建学习材料”默认进入 AI 改写流程，无法把已准备好的文稿直接存为资料；Craft 的快速与高级模式又复用同一改写、合成链路，入口语义重复。                                                                                         | Craft 固定为“基础 → 手动输入并直接保存文本资料”和“高级 → 原快速录音、AI 改写、试听与音频保存”；移除旧高级分支。`craft-resource` 领域测试锁定文本清理、句子生成、不可变结果与资料库导航，学习设计回归测试锁定入口文案和模式去重。                                                                                                     | 已修缮       |
| FIX-2026-09-21-002 | 2026-09-21 | 学习资料英文切句              | OCR、转写或复制文本可遗漏英文句末标点后的空白（如 `pattern.By contrast.`）；切句器只接受“标点 + 空白”边界，导致多句资料被存成单句。                                                                                          | 切句器接受句末标点后紧接大写字母的英文边界，同时保护常见称谓、initialism 与小数；`enjoy-player-domain` 回归测试覆盖用户复现、`Dr.Smith`、`U.S.` 和 `3.14`。已有资料须显式重切或重新导入才会使用新规则。                                                                                                                              | 已修复       |
| FIX-2026-09-22-001 | 2026-09-22 | AI Provider 与学习翻译闭环    | Provider 页面把少量预设表现为模型选择，未提供服务端模型发现；保存后停留并清空表单，缺少明确完成与返回。学习翻译虽调用已选 API 并持久化，但资料列表不显示结果，逐句页又默认隐藏译文。                                         | Provider 目录保留任意 HTTPS 兼容服务和自定义模型 ID，支持鉴权读取 `/models`、显式选择/测试、保存并启用后自动返回；学习资料卡显示翻译数量和译文预览，逐句页遵守持久化的默认显示设置。`ai-model-discovery`、Provider 目录与 AI/学习体验回归测试常驻；全量 134 个测试文件、716 项测试通过。                                             | 已修复       |
| FIX-2026-09-22-002 | 2026-09-22 | 译文投影一致性与资料直接操作  | 翻译只写资源句子，逐句页优先读取的字幕轨仍为空，导致外层显示已翻译、内层无译文并可重复调用 AI；资料卡四宫格和裸露删除入口也阻断了直接学习路径。                                                                              | 译文按 ID/文本指纹协调并原子同步资源、字幕轨与缓存；逐句页只补齐真正缺失的句子，完整时不请求 AI。资料点按直接进入学习，右滑以可中断弹簧显露下载/删除，删除继续二次确认；领域与布局回归测试常驻，全量 134 个测试文件、719 项测试通过。详见 [INC-2026-09-22](incidents/INC-2026-09-22-learning-translation-projection-divergence.md)。 | 已修复       |

## 长期不变量

### 用户数据

- 文件系统中的 Markdown 是唯一内容真源。
- 兼容性修复只能改变渲染副本，不能静默改写用户原文。
- 只有经过 repository read-back 验证的内容才能显示为已保存。
- 编辑器模式切换、渲染器重建和预览不得改变文档哈希。

### 编辑器与 WebView

- flush、自动保存和原生回显不得主动模糊 DOM 焦点。
- WebView 不接收文件系统句柄；消息必须带身份和 revision 并经过边界校验。
- CSP、导航拦截、`window.open` 拦截和远程媒体占位不得为兼容性而放宽。
- 公式、Mermaid 和其他富内容必须有输入上限、失败降级和可检查的错误状态。

### 发布

- `app-debug.apk` 仅用于开发；离线验收必须使用 `app-release.apk`。
- release APK 必须在 Metro 映射移除后冷启动。
- KaTeX 字体必须随 DOM bundle 离线打包，不能依赖 CDN 或开发机。
- 覆盖安装前必须确认签名一致；不得为安装方便卸载并清空用户数据。

### FIX-2026-08-15-004：英语陪练确认恢复与逐句练习

- **症状与根因：** 课程卡片从持久化草稿恢复时按英文过滤重建核心项，导致用户选择、重点和编辑丢失；教师纠正或用户补选没有区分“内容正确”与“已完成”；保存后的句子资源没有把 Learning 导航指向第一句。
- **保护性不变量：** `reviewDraft` 按稳定 `localId` 覆盖同 ID 的核心候选；非完成内容只能保存为 `needs_review`，不得增加完整提示、关键词或独立完成次数；首轮角色台词不被上一阶段反馈替代；保存句子后必须将 Learning UI 指向对应资源的第一句。
- **证据：** `tests/unit/learning/english-coach-domain.test.ts` 覆盖草稿恢复、纠正候选、提示证据、保存失败恢复、中文复现和逐句练习导航；执行 `npm run typecheck`、`npm run lint`、`npm run format:check` 与 `npm test`。

### FIX-2026-08-15-005：英语陪练并发写入与候选完整性

- **症状与根因：** 课程修改、模式切换和 Provider 回合共享渲染时捕获的快照并以异步方式写入，可能覆盖更新后的确认草稿或暂停状态；同一 Provider 响应内重复表达及重复确认候选可能产生相同资源、课程项和证据。
- **保护性不变量：** 所有英语课程变更必须经串行状态队列按最新快照执行；模式切换与暂停必须先取消在途请求；Provider 和存储层均需按表达类型与规范化英文去重；复现表达必须从 `selectedReplayExpressionIds` 显式标记为 `replayed`。
- **证据：** `serialized-state-queue.test.ts` 覆盖修改后立即切换、旧快照同步和暂停后 Provider 回写；英语领域测试覆盖同批候选、保存层去重与复现来源；应用层 handoff 测试覆盖 Learning 逐句练习目标与 App Shell 目的地。

### FIX-2026-08-20-001：短语与记忆数据质量

- **症状与根因：** `extractImportantPhrases()` 曾对原句直接做 2–3 词 N-Gram 切片，只排除少量 stop words；普通相邻词与语法残片因而能成为候选。多个界面和课程路径还能绕过统一的短语数据策略，分别写入词汇卡。
- **保护性不变量：** 自动短语仅可由明确的 phrasal verb、固定表达、搭配、习语或口语模式规则生成，且置信度必须不低于 `0.80`；所有写入均经 `upsertPhraseCard()` 规范化与 canonical 去重，重复出现累计 encounter 并合并有限上下文；用户手动保存保持最高优先级；旧 `vocabulary` 绝不在 v4→v5 加载中删除，独立 `memories` 缺失时只初始化为空。短语收藏、掌握状态、编辑、删除及记忆编辑全部通过不可变快照更新并经既有保存链路落盘；短语编辑会重新 canonicalize 并拒绝与其他记录重复的表达。
- **证据：** `phrase-recognition.test.ts` 覆盖短语识别、拒绝、规范化、canonical 合并、置信度和人工保存；`phrase-memory-domain.test.ts` 覆盖本地搜索、五种排序、学习/掌握/收藏筛选、收藏与掌握状态更新、编辑后的 canonical 去重，以及独立 Memory 搜索排序；`phrase-memory-navigation-regression.test.ts` 锁定入口、分栏、高性能列表、详情、菜单、删除与返回；`learning-session.test.ts` 覆盖旧快照保留；完整 `npm test`、`npm run typecheck`、`npm run lint` 与 `npm run format:check` 在本次提交前执行。详见 [INC-2026-08-20：短语库误识别与个人资料信息密度问题](incidents/INC-2026-08-20-phrase-memory-data-quality.md)。

### FIX-2026-08-15-006：英语陪练失败恢复与真实复现映射

- **症状与根因：** 前序草稿持久化失败后，队列仍可继续执行暂停，页面随后切换并丢失本地候选编辑；课程计划的 `core-*` 表达 ID 与历史 LearningExpression ID 属于不同命名空间，无法用于复现来源判断。
- **保护性不变量：** 串行状态队列必须阻断前序写入失败后已经排队的操作；确认页须在内存中保留最新候选，并在用户重试切换时将候选草稿和暂停状态原子落盘；Markdown 切换仅能在该写入成功后发生；每个被授权的复现表达必须独占一个课程核心表达并携带 `replayExpressionId`，课程卡片仅按该显式映射标记 `replayed`。
- **证据：** 队列测试覆盖 writer 拒绝、排队暂停阻断以及携带本地候选的显式重试；英语领域测试使用历史 ID `saved-1` 与课程 ID `core-1` 的真实不同 ID 链路，并覆盖两条复现表达互不覆盖。

## 当前证据基线

截至 2026-08-15：

- `npm test`：113 个测试文件、646 项测试通过。
- `npm run lint`、`npm run typecheck`、`npm run format:check` 通过。
- 2026-08-31 主导航与 URL 导入层级调整后，`npm test`：121 个测试文件、677 项测试通过；
  `npm run lint`、`npm run typecheck`、`npm run format:check` 与 `git diff --check` 通过。
- 2026-08-31 默认学习入口、笔记总览、可关闭标签与全局侧栏调整后，`npm test`：122 个测试文件、
  682 项测试通过；`npm run lint`、`npm run typecheck`、`npm run format:check`、`git diff --check`
  与 `npm run export:android -- --clear` 通过。Android 与 DOM bundle 均完成，仓库导出脚本确认
  `dist/www.bundle` 仅包含单一 DOM HTML/JS 入口并补齐离线字体。
- 2026-09-01 侧栏柔和形变、内联笔记重命名与操作菜单精简后，`npm test`：123 个测试文件、
  686 项测试通过；`npm run lint`、`npm run typecheck`、`npm run format:check`、`git diff --check`
  与 `npm run export:android -- --clear` 通过，Android 和 DOM bundle 均成功生成。
- 2026-09-01 画板文件创建修复后，`npm test`：125 个测试文件、689 项测试通过；
  `npm run lint`、`npm run typecheck`、`npm run format:check`、`git diff --check`
  与 `npm run export:android -- --clear` 通过，Android 和 Excalidraw DOM bundle 均成功生成。
- 2026-09-01 CI 设备证据夹具修复后，截图 manifest 独立校验确认 4 张基线哈希一致，
  干净 checkout 所需的 manifest、截图和 hierarchy XML 均不再被 `.gitignore` 排除。完整复验确认
  `npm run format:check`、`npm run lint`、`npm run typecheck`、`git diff --check` 与 `npm test`
  （128 个测试文件、695 项测试）通过；原始 Expo 导出会报 `Asset not found` 却返回 0，工作流改用
- 2026-09-11 侧栏按钮按首页收敛后，`npm test`：130 个测试文件、703 项测试通过；
  `npm run lint`、`npm run typecheck`、`npm run format:check` 与 `git diff --check` 全部通过。
- 2026-09-18 全局视觉设计系统重构后，`npm test`：130 个测试文件、704 项测试通过；
  `npm run lint`、`npm run typecheck`、`npm run format:check`、`git diff --check`
  与 `npm run export:android -- --clear` 全部通过。
  离线完整源码备份存档于分支 `backup/pre-ui-redesign-20260918` 与
  `/Users/apple/Desktop/Mira_backup_pre_ui_redesign_20260918.tar.gz`。
- 2026-09-19 全页面视觉设计与交互规范全量重构后，`npm test`：130 个测试文件、704 项测试通过；
  `npm run lint`、`npm run typecheck`、`npm run format:check` 与 `git diff --check` 全部通过。
  离线完整源码备份存档于分支 `backup/pre-ui-guide-full-refactor-20260919` 与标签 `backup-pre-ui-guide-full-refactor-20260919`。
- 2026-09-19 12:59 执行 `npm run android:release` 构建成功，正式 `app-release.apk` 为 117,269,214 字节，
  SHA-256 `f5f4e4b5321246fd1c7f5488c8c302b51a922f4c0f08c52fb076c85fc4ca88df`。`adb install -r`
  在真机 REP-AN00（`AXVVUT3707007264`）上覆盖安装返回 `Success`，用户历史数据与工作区完整保留；
  冷启动耗时 284 ms，前台聚焦 `MainActivity`，Logcat 无运行时异常。
- 2026-09-21 20:07 从 `main` 提交 `61b3d48` 执行 `npm run android:release` 构建成功，正式
  `app-release.apk` 为 117,271,202 字节，SHA-256
  `3803fac729752994954a61b86b246d0f47d648a8d2ba55438adbc99eb588372a`，正式证书 SHA-256
  `92b5be920bca85841c541939728eece023db590efa663a991b15e22ebc6c145d`。在真机 REP-AN00
  （`AXVVUT3707007264`）使用 `adb install -r` 覆盖安装返回 `Success`；首次安装时间保持
  2026-09-01 10:12:52，证明应用数据未因卸载而清除。移除全部 Metro reverse 后冷启动耗时
  256 ms，`MainActivity` 保持前台且进程存活，Logcat 未检出脚本加载失败或运行时崩溃；手机端
  `base.apk` 与本地发布包 SHA-256 完全一致。
- 2026-09-22 00:47 从 AI Provider 与学习翻译闭环的最终源码执行 `npm run android:release`
  构建成功，正式 `app-release.apk` 版本为 `1.0.0 (1)`，117,295,690 字节，SHA-256
  `0296f67b0ad69c5425efee563a2b7ee4de607a849633d072e51aa1301ebec7b6`，正式证书 SHA-256
  `92b5be920bca85841c541939728eece023db590efa663a991b15e22ebc6c145d`。在真机 REP-AN00
  （`AXVVUT3707007264`）使用 `adb install -r` 覆盖安装返回 `Success`；首次安装时间保持
  2026-09-01 10:12:52，手机无障碍树仍可读取原有“图表类题目”学习资料，证明应用数据完整保留。
  移除 Metro 8081 reverse 后冷启动耗时 251 ms，`MainActivity` 保持前台且进程存活，Logcat
  未检出脚本加载失败或运行时崩溃；手机端 `base.apk` 与本地发布包 SHA-256 完全一致。
- 2026-09-22 01:21 从译文投影一致性与资料侧滑操作的最终源码执行 `npm run android:release`
  构建成功，正式 `app-release.apk` 版本为 `1.0.0 (1)`，117,295,802 字节，SHA-256
  `31851bca1b9f97e599519b6382dfe9fb2c7a99d5707bf040542cafca9b446fc6`，正式证书 SHA-256
  `92b5be920bca85841c541939728eece023db590efa663a991b15e22ebc6c145d`。构建完成后 ADB 与
  macOS USB 设备列表均未发现 REP-AN00，因此本次包尚未覆盖安装，未记录真机冷启动结论。
- 2026-08-31 18:02 从全局侧栏图标动画的最终源码执行 `npm run android:release` 成功，正式
  `app-release.apk` 为 117,110,330 字节，SHA-256
  `bb45cc9375f511a55bd8a8f724e3955a011d58c180b49b66fdac8191de6d1f23`，正式证书 SHA-256
  `92b5be920bca85841c541939728eece023db590efa663a991b15e22ebc6c145d`。为保留 REP-AN00
  现有数据，同一 release 内容使用设备已安装版本证书生成
  `app-release-device-sidebar-animation.apk`，117,258,177 字节，SHA-256
  `ec466fd451e446656bac6bee2ff0adaf22d11022e2519e4880da2549a8d923b8`，证书 SHA-256
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。`adb install -r`
  返回 `Success`；首次安装时间仍为 2026-08-30 23:26:12，更新时间为 2026-08-31 18:02:57。
  移除 Metro reverse 后冷启动耗时 546 ms，进程持续存活，未发现脚本加载失败或
  AndroidRuntime 崩溃；真机无障碍树确认默认页为“学习”，全局侧栏可打开并显示完整导航。
- 数学相关定向回归：3 个测试文件、28 项测试通过。
- 真机 REP-AN00：故障文档 26 个公式全部生成 KaTeX，错误数从 6 降为 0；富文本和阅读模式均通过。
- 模式切换前后故障文档 SHA-256 保持
  `b8fed6c40eae8dc652e7f637c8dc8267a1f9b912de5969eec0a3b4ae85c03556`。
- 2026-08-15 17:01 release APK 为 117,074,518 字节，SHA-256：
  `7bc330fe50640f3f9562efb93ee36c15b3d45ea92b67e5ffd6e5132c1f1dc917`。
- release 签名证书 SHA-256：
  `92b5be920bca85841c541939728eece023db590efa663a991b15e22ebc6c145d`；`adb install -r`
  在 REP-AN00 返回 `Success`，证明与已安装包签名兼容。
- release 覆盖安装成功，首次安装时间仍为 2026-08-15 12:46:13；Metro reverse 移除后强制停止并冷启动成功，
  前台为 `app.inkstone.markdown/.MainActivity`，原 Learning 第 03 句练习仍可见，未发现
  `Unable to load script` 或 AndroidRuntime 崩溃。
- 2026-08-31 14:08 从学习导航与创建入口重设计后的最终源码重新生成 release APK：
  `/android/app/build/outputs/apk/release/app-release.apk`，版本 `1.0.0 (1)`，117,124,054 字节，
  SHA-256 `f5ea7ca0324178a7279ac771c9ff1e1e990f1704c191de700d88c5eca9847449`，正式证书 SHA-256
  `92b5be920bca85841c541939728eece023db590efa663a991b15e22ebc6c145d`。
- 目标真机 REP-AN00 当时安装的是项目 debug 证书版本，为避免卸载清除用户数据，同一 release 内容使用该证书生成
  `app-release-device.apk`，117,274,561 字节，SHA-256
  `002cccb0637412bd9428bd52cdee58f51e3106cebaa6cdbc9de942beae71b369`，证书 SHA-256
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。`adb install -r` 返回 `Success`；
  首次安装时间保持 2026-08-30 23:26:12，更新时间为 2026-08-31 14:11:01。移除 Metro reverse 后冷启动
  `MainActivity` 成功，未检出脚本加载失败或 AndroidRuntime 崩溃。
- 2026-08-31 17:16 从资料渐进操作、删除和统一导入入口的最终源码重新生成正式 release APK：
  `/android/app/build/outputs/apk/release/app-release.apk`，117,123,898 字节，SHA-256
  `26d8b795963be40080d93be14c179f6edddbb3f4f2fd52cdead6572c905e808a`。为保留 REP-AN00 上现有数据，
  同一 release 内容使用设备已安装版本的证书生成 `app-release-device-library-accordion.apk`，117,274,561 字节，
  SHA-256 `5885d9e96cb07a7b9c5ade23adb0e5a514d058209ea6f970e133054742fd252a`，证书 SHA-256
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。`adb install -r` 返回 `Success`；
  首次安装时间仍为 2026-08-30 23:26:12，更新时间为 2026-08-31 17:17:19。移除 Metro reverse 后冷启动耗时
  517 ms，前台为 `app.inkstone.markdown/.MainActivity`，进程持续存活，未检出脚本加载失败或 AndroidRuntime 崩溃。

## 详细记录

- [INC-2026-08-20：短语库误识别与个人资料信息密度问题](incidents/INC-2026-08-20-phrase-memory-data-quality.md)
- [INC-2026-08-15：Markdown 数学公式渲染失败](incidents/INC-2026-08-15-markdown-math-rendering.md)
- [ADR-006：无损数学公式渲染管线](adr/ADR-006-lossless-math-rendering.md)
- [编辑器焦点所有权](architecture.md#editor-focus-ownership)
- [Android 发布清单](release-checklist.md)
