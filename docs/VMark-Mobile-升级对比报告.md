# VMark Mobile 现状对比与代码升级执行报告

> 报告用途：交给 Windows 电脑上的 Codex 或开发者，作为后续代码升级的执行依据。  
> 审计日期：2026-07-31  
> 当前项目：`Mira` / `note-rehearse-app`  
> 当前基线提交：`ed5163e restore NoteRehearse app source`  
> 唯一产品实现基准：`VMark-Mobile-实现文档.md` v1.0（2026-07-30）  
> 本报告不是新的产品需求；如本报告与实现文档冲突，以实现文档为准。

---

## 1. 执行结论

当前代码库不是 VMark Mobile 的增量实现，而是一个名为 NoteRehearse 的“本地笔记 + 逐句复述 + 肯定语提醒”应用。当前应用的数据模型、一级导航、登录入口、系统权限和主要业务页面均围绕 NoteRehearse 构建。[VERIFY: package.json:2] [VERIFY: src/types/index.ts:1] [VERIFY: app/(tabs)/_layout.tsx:72] [VERIFY: app/_layout.tsx:69]

实现文档要求的是“本地优先、多格式、AI 辅助的移动纯文本工作区”，文件系统内容是唯一真源，SQLite 仅保存可重建索引和应用状态。[VERIFY: VMark-Mobile-实现文档.md:9] [VERIFY: VMark-Mobile-实现文档.md:29]

因此，正确升级策略不是继续修改现有 NoteRehearse 页面，而是：

1. 保留可复用的 React Native/Expo 工程基础；
2. 冻结并逐步移除 NoteRehearse 专属业务；
3. 按实现文档建立 Workspace、Document Session、Format Registry、WebView Editor Core、SQLite/FTS、Backup 和 AI Proposal 等新边界；
4. 先证明文件授权、可靠保存和草稿恢复，再铺设完整页面；
5. 每一阶段单独通过测试和验收，禁止一次性大改后再补数据安全。

上述升级顺序直接服从实现文档的最终建议：首先证明外部工作区稳定授权和写回、WebView 编辑器可靠、自动保存与冲突恢复不丢数据。[VERIFY: VMark-Mobile-实现文档.md:1127]

### 1.1 当前完成度估算

以下百分比是基于实现文档能力清单和现有代码证据做出的工程估算，不是测试覆盖率：

| 维度 | 估算 | 说明 |
| --- | ---: | --- |
| React Native 工程基础可复用度 | 50% | Expo、TypeScript、Router、Zustand、WebView、FileSystem、Sharing 已存在 |
| VMark 产品功能完成度 | 约 10% | 仅有简化 Markdown 输入/展示、内存搜索、图片保存和 ZIP 导出可映射 |
| 文件工作区底座 | 0-5% | 没有 Workspace、目录授权、Provider capability 或权限恢复 |
| 数据安全底座 | 低于 10% | 没有 revision、原子保存、冲突检测、草稿恢复和历史 |
| 多格式能力 | 低于 5% | 没有 Format Registry、结构化格式、Mermaid 或代码适配器 |
| 发布就绪度 | 低于 10% | 现有测试通过，但测试目标基本属于旧产品 |

### 1.2 不允许采用的升级方式

- 不允许把 AsyncStorage 中的 `Note[]` 改名为“工作区”后继续作为正文真源。
- 不允许先完成视觉页面，再补文件保存、冲突和恢复。
- 不允许保留“登录后才能使用本地功能”的入口约束。
- 不允许让 AI、Mermaid、HTML、SVG 或代码执行任意脚本。
- 不允许让 AI 直接写文件。
- 不允许为了缩短工期删除权限恢复、冲突防护、草稿恢复、备份校验和基础无障碍。

这些限制均来自实现文档的一页结论、安全策略、MVP 切割原则和发布阻断条件。[VERIFY: VMark-Mobile-实现文档.md:9] [VERIFY: VMark-Mobile-实现文档.md:796] [VERIFY: VMark-Mobile-实现文档.md:954] [VERIFY: VMark-Mobile-实现文档.md:917]

---

## 2. 基准与优先级规则

Windows 端开始修改前，必须把以下文件放到同一个代码仓库中：

```text
docs/
├── VMark-Mobile-实现文档.md        # 唯一产品实现基准
└── VMark-Mobile-升级对比报告.md    # 本报告，执行辅助材料
```

建议将本报告和原实现文档复制到 `docs/`；复制只改变文件位置，不修改实现文档内容。

发生歧义时按以下优先级处理：

1. `docs/VMark-Mobile-实现文档.md`
2. 经过明确记录并由项目负责人接受的 ADR
3. 本报告
4. 当前代码行为

当前代码不能反过来定义产品需求。当前代码只用于判断哪些资产可以复用，以及识别迁移风险。

### 2.1 变更纪律

每个 Pull Request 或阶段提交必须写明：

- 对应实现文档章节；
- 本阶段新增或修改的能力；
- 正常、失败、离线、权限失效和恢复路径；
- 数据是否可能丢失或被静默覆盖；
- 测试命令及结果；
- 尚未完成的文档条目；
- 是否产生 ADR，以及为何不能直接遵循原文档。

除非实现文档明确允许，不得自行扩大产品范围。不得增加终端、Shell、代码执行、调试器、LSP、包管理器、Git UI、桌面插件加载、默认云账号和多人协作。[VERIFY: VMark-Mobile-实现文档.md:20]

---

## 3. 当前代码库事实基线

### 3.1 工程栈

当前项目使用 Expo 56、React Native 0.85、React 19、TypeScript 6、Expo Router、Zustand、AsyncStorage 和 React Native WebView。[VERIFY: package.json:4] [VERIFY: package.json:8] [VERIFY: package.json:11] [VERIFY: package.json:32] [VERIFY: package.json:34] [VERIFY: package.json:42] [VERIFY: package.json:44]

项目已配置严格 TypeScript，并排除构建产物和依赖目录。[VERIFY: tsconfig.json:1]

当前脚本只包含启动、平台运行、单元测试、类型检查和 KaTeX bundle 构建，没有 E2E、截图基线、原生契约测试或性能测试脚本。[VERIFY: package.json:51]

### 3.2 当前信息架构

当前一级 Tab 是：

1. 笔记；
2. 练习；
3. 暗示；
4. 设置。

[VERIFY: app/(tabs)/_layout.tsx:72] [VERIFY: app/(tabs)/_layout.tsx:79] [VERIFY: app/(tabs)/_layout.tsx:86] [VERIFY: app/(tabs)/_layout.tsx:93]

实现文档要求的一级 Tab 是：

1. 文件；
2. 搜索；
3. AI；
4. 设置。

[VERIFY: VMark-Mobile-实现文档.md:77]

### 3.3 当前启动与认证

应用启动时初始化 Supabase Auth、笔记、练习进度、账号连续登录状态和提醒。[VERIFY: app/_layout.tsx:15]

主页面被 `Stack.Protected` 放在已登录条件下，未登录用户只能进入认证页面。[VERIFY: app/_layout.tsx:63]

Supabase URL 或 Key 缺失时，模块初始化阶段直接抛出异常。[VERIFY: src/lib/supabase.ts:6]

这与实现文档“无账户也能完整使用本地功能”和“不默认提供云端账号体系”冲突。[VERIFY: VMark-Mobile-实现文档.md:20] [VERIFY: VMark-Mobile-实现文档.md:798]

### 3.4 当前正文数据模型

当前正文实体为：

```ts
type Note = {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
  lastPracticedAt?: number
}
```

[VERIFY: src/types/index.ts:1]

全部笔记被序列化为一个 JSON 数组并写入 AsyncStorage 键 `@noterehearse/notes`。[VERIFY: src/stores/notes-store.ts:6] [VERIFY: src/stores/notes-store.ts:18]

实现文档要求正文保留在用户工作区文件中，SQLite 只保存索引、历史和 UI 状态。[VERIFY: VMark-Mobile-实现文档.md:563] [VERIFY: VMark-Mobile-实现文档.md:692]

### 3.5 当前编辑和展示

新建与编辑页面使用 React Native `TextInput` 保存 Markdown 源码。[VERIFY: app/(tabs)/notes/new.tsx:89] [VERIFY: app/(tabs)/notes/edit/[id].tsx:82]

格式按钮只把 Markdown 标记追加到正文末尾，没有选区感知、撤销/重做状态、源码/所见即所得切换、解析诊断、自动保存或 Document Session。[VERIFY: app/(tabs)/notes/new.tsx:43] [VERIFY: app/(tabs)/notes/new.tsx:102] [VERIFY: app/(tabs)/notes/edit/[id].tsx:39]

笔记详情使用 `react-native-markdown-display` 渲染 Markdown。[VERIFY: app/(tabs)/notes/[id].tsx:17] [VERIFY: app/(tabs)/notes/[id].tsx:103]

另有一个离线 WebView 组件，将 `marked` 与 KaTeX bundle 注入本地 HTML，用于 Markdown 数学公式展示。[VERIFY: src/components/notes/MarkdownMath.tsx:3] [VERIFY: src/components/notes/MarkdownMath.tsx:53]

该 WebView 不是编辑器内核：它只向原生端发送渲染高度，没有版本化协议、sessionId、revision、增量 change、selection 或 diagnostics 消息。[VERIFY: src/components/notes/MarkdownMath.tsx:80] [VERIFY: src/components/notes/MarkdownMath.tsx:115]

### 3.6 当前搜索

当前搜索把查询字符串转为小写，然后依次匹配内存中每条笔记的标题、正文和标签。[VERIFY: app/(tabs)/notes/index.tsx:42]

它不是工作区搜索，没有文件名/路径索引、FTS、历史搜索、增量索引、结果定位和索引重建。[VERIFY: VMark-Mobile-实现文档.md:360] [VERIFY: VMark-Mobile-实现文档.md:692]

### 3.7 当前导出

项目可以把所有笔记导出为 ZIP，其中包含：

- `index.html`；
- 原始 Markdown；
- 渲染后的 HTML；
- CSS、KaTeX bundle；
- 本地图片。

[VERIFY: src/utils/export-notes.ts:9]

导出代码在缓存目录创建 ZIP，然后调用系统分享面板。[VERIFY: src/utils/export-notes.ts:247] [VERIFY: src/utils/export-notes.ts:263]

这个能力可复用为 Backup Service 的压缩与分享基础，但当前没有备份 manifest、版本、checksum、增量策略、恢复预检或恢复演练。[VERIFY: VMark-Mobile-实现文档.md:381] [VERIFY: VMark-Mobile-实现文档.md:692]

### 3.8 当前权限与平台配置

应用当前锁定竖屏和浅色模式。[VERIFY: app.json:8]

应用声明麦克风、相册、相机、位置、活动识别、日历和前台媒体服务等权限。[VERIFY: app.json:13] [VERIFY: app.json:23]

这些权限大部分服务于 NoteRehearse 的录音和提醒功能，不属于 VMark Mobile 文档定义的核心范围。升级时必须按最终保留功能重新审计并移除不必要权限。[VERIFY: app/(tabs)/affirmations/index.tsx:213] [VERIFY: VMark-Mobile-实现文档.md:796]

### 3.9 当前测试状态

审计时执行：

```bash
npm test
npm run typecheck
```

结果：

- TypeScript 类型检查通过；
- 7 个测试文件通过；
- 34 个测试通过。

现有测试主要覆盖连续登录、肯定语、活动/位置/日历感知、表达转换和句子切分，不覆盖实现文档规定的 Workspace、Format Registry、revision、冲突、恢复、WebView 协议、结构化解析、Mermaid、备份校验和 AI 上下文过滤。[VERIFY: src/utils/login-streak.test.ts:16] [VERIFY: src/utils/affirmations.test.ts:12] [VERIFY: src/utils/activity-sense.test.ts:8] [VERIFY: src/utils/expression-transfer.test.ts:14] [VERIFY: src/utils/location-sense.test.ts:8] [VERIFY: src/utils/calendar-sense.test.ts:18] [VERIFY: src/utils/sentence-splitter.test.ts:4] [VERIFY: VMark-Mobile-实现文档.md:863]

---

## 4. 完整需求—实现差距矩阵

状态定义：

- `可复用`：已有实现能作为目标能力的一部分；
- `部分实现`：表面功能存在，但底层模型不满足文档；
- `未实现`：没有可识别的目标实现；
- `冲突`：现有实现与文档做出相反决定；
- `需移除`：属于旧产品，且会干扰目标架构或权限边界。

| 编号 | 实现文档能力 | 当前代码 | 状态 | 升级动作 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| G01 | 本地优先、无需账号 | Supabase 登录保护所有主页面 | 冲突 | 移除本地功能登录门槛；认证改为可选扩展或完全移除 | P0 |
| G02 | 工作区选择与目录授权 | 无 Workspace 模型或页面 | 未实现 | 新建 Workspace domain、授权页面和平台适配器 | P0 |
| G03 | iOS security-scoped bookmark | 无相关原生实现 | 未实现 | Development Build/Prebuild spike | P0 |
| G04 | Android SAF 持久 URI | 无相关原生实现 | 未实现 | SAF capability spike | P0 |
| G05 | 文件系统为正文真源 | AsyncStorage 保存 `Note[]` | 冲突 | 新正文只通过 WorkspaceAdapter 读写 | P0 |
| G06 | 原子保存与 revision | 写 AsyncStorage 后不等待 | 冲突 | 新建 DocumentSession 和保存状态机 | P0 |
| G07 | 外部修改冲突 | 无 revision/三方差异 | 未实现 | expectedRevision + conflict flow | P0 |
| G08 | 未保存草稿恢复 | 无 recovery log | 未实现 | recovery journal + kill/restart test | P0 |
| G09 | 格式注册表 | 无 FormatAdapter | 未实现 | 建立单一格式事实来源 | P1 |
| G10 | 文件浏览和目录树 | 只有笔记列表 | 未实现 | 文件 Tab、格式聚合、真实目录树 | P1 |
| G11 | Markdown 所见即所得 | TextInput 源码输入 | 部分实现 | WebView 接入 CodeMirror + Tiptap/ProseMirror | P2 |
| G12 | Markdown 源码模式 | TextInput 可编辑 Markdown | 可复用概念 | 迁移到 CodeMirror，不沿用 TextInput 内核 | P2 |
| G13 | Markdown 预览/数学 | 原生 Markdown 与离线 KaTeX WebView | 可复用 | 合并进受控 WebView 编辑内核 | P2 |
| G14 | JSON/YAML/TOML 树/表格 | 无 | 未实现 | 安全解析器、树、表格和错误诊断 | P3 |
| G15 | Mermaid 编辑/渲染/导出 | 无 Mermaid | 未实现 | 严格模式、限额、超时、缩放、导出 | P3 |
| G16 | 代码高亮与显式编辑 | 无代码适配器 | 未实现 | CodeMirror language registry + opt-in edit | P3 |
| G17 | 未识别文本/二进制回退 | 无 | 未实现 | Text/Binary adapter | P3 |
| G18 | 文件名/内容/历史搜索 | 内存笔记过滤 | 部分实现 | SQLite FTS + 增量索引 | P4 |
| G19 | 本地历史快照 | 仅肯定语文案 history | 未实现 | document_history + retention | P4 |
| G20 | 手动/自动备份与恢复 | ZIP 导出 | 部分实现 | manifest/checksum/restore/dry-run | P4 |
| G21 | 设置：编辑器/AI/存储/隐私 | 只有账号和登录状态 | 冲突 | 重建设置 IA；删除账号中心默认入口 | P5 |
| G22 | AI 显式上下文 | 无 AI Gateway | 未实现 | Provider、SecureStore、context manifest | P5 |
| G23 | AI 先预览后应用 | 无 proposal/diff | 未实现 | proposal + revision check + partial apply | P5 |
| G24 | 浅色/深色/横屏/平板 | 竖屏、浅色 | 冲突 | token theme + responsive layout | P1/P6 |
| G25 | 中英文与无障碍 | 文案混合硬编码 | 部分实现 | i18n keys、动态字体、读屏与焦点测试 | P6 |
| G26 | 性能预算 | 无目标性能测试 | 未实现 | 真机基准与大文件阈值 | P0/P6 |
| G27 | Mermaid/SVG/HTML 安全 | WebView Markdown 未净化 HTML | 高风险缺口 | sanitize、CSP、导航拦截、禁脚本 | P0/P3 |
| G28 | 完整自动化测试分层 | 只有工具函数单测 | 部分实现 | unit/contract/integration/E2E/visual | 全程 |

矩阵依据：[VERIFY: VMark-Mobile-实现文档.md:193] [VERIFY: VMark-Mobile-实现文档.md:520] [VERIFY: VMark-Mobile-实现文档.md:561] [VERIFY: VMark-Mobile-实现文档.md:692] [VERIFY: VMark-Mobile-实现文档.md:796] [VERIFY: VMark-Mobile-实现文档.md:833] [VERIFY: VMark-Mobile-实现文档.md:863]

---

## 5. 高风险偏差

### 5.1 保存成功状态不可信

当前 `addNote`、`updateNote` 和 `deleteNote` 先更新 Zustand，再调用异步 `persist(notes)`，但不 `await`、不捕获失败、也不返回保存状态。[VERIFY: src/stores/notes-store.ts:37] [VERIFY: src/stores/notes-store.ts:52] [VERIFY: src/stores/notes-store.ts:60]

新建页面调用 `addNote` 后立即导航离开，因此 AsyncStorage 写入失败时，界面仍表现得像保存完成。[VERIFY: app/(tabs)/notes/new.tsx:30]

这不满足“任何失败都不能把编辑器误标为已保存”和“保存失败不得发布”的要求。[VERIFY: VMark-Mobile-实现文档.md:676] [VERIFY: VMark-Mobile-实现文档.md:917]

目标修复不是给 `persist()` 简单加 `await`，而是用 Document Session、revision、恢复日志和 Provider capability 实现完整状态机。

### 5.2 WebView 内容隔离不足

当前 WebView 把 Markdown 经 `marked.parse()` 转换后直接设置到 `innerHTML`，未看到 HTML/SVG sanitizer。[VERIFY: src/components/notes/MarkdownMath.tsx:53] [VERIFY: src/components/notes/MarkdownMath.tsx:67]

当前 WebView 使用 `originWhitelist={['*']}`，并允许本地 HTML 中执行注入的 JavaScript bundle。[VERIFY: src/components/notes/MarkdownMath.tsx:92] [VERIFY: src/components/notes/MarkdownMath.tsx:121]

实现文档要求 Mermaid 严格模式、SVG 白名单净化、WebView 只加载签名内置资源并禁止任意外部导航。[VERIFY: VMark-Mobile-实现文档.md:815]

在把当前组件用于编辑器、Mermaid 或 HTML 预览前，必须重做安全边界；不能直接扩展现有 `buildHtml()`。

### 5.3 登录和网络成为本地功能单点故障

Supabase 配置在模块加载时强制存在，所有主页面都依赖已登录状态。[VERIFY: src/lib/supabase.ts:6] [VERIFY: app/_layout.tsx:69]

目标架构必须允许完全离线、无账号启动，文件编辑和保存不能依赖 Supabase 或任何远端服务。[VERIFY: VMark-Mobile-实现文档.md:833]

### 5.4 当前数据无法直接迁移成工作区

现有 `Note` 没有真实文件路径、workspaceId、fileId、formatId、revision、编码、换行格式、Provider capability 或外部修改信息。[VERIFY: src/types/index.ts:1]

不能把旧 `Note.id` 当作稳定文件身份。若需要保留旧数据，应做一次显式迁移：

1. 用户选择 Managed Workspace；
2. 将每条旧 Note 导出为独立 `.md` 文件；
3. 生成冲突安全文件名；
4. 校验写入；
5. 向用户展示迁移报告；
6. 用户确认后才标记迁移完成；
7. 暂不自动删除 AsyncStorage 旧数据。

迁移属于兼容策略，不得改变“文件系统为唯一正文真源”的目标。

---

## 6. 代码资产处置表

### 6.1 建议保留

| 资产 | 处置 | 理由 |
| --- | --- | --- |
| Expo / React Native / TypeScript | 保留 | 与推荐技术栈一致 |
| Expo Router | 暂时保留 | 文档推荐 React Navigation，Expo Router 基于其上；若能力满足无需立即替换 |
| Zustand | 保留 | 文档明确允许 |
| `expo-file-system` | 保留 | Managed Workspace、缓存、恢复日志、导出可使用 |
| `react-native-webview` | 保留依赖，重写内核 | 目标架构需要离线 WebView |
| `marked` / KaTeX bundle | 有条件复用 | 可作为 Markdown 预览和数学能力的一部分，必须加入安全净化 |
| `fflate` | 保留 | 可用于备份归档 |
| `expo-sharing` | 保留 | 可用于导出和备份分享 |
| `ImageInsertButton` 的本地复制思路 | 重构复用 | 目标 Markdown 支持本地附件 |
| Vitest / strict TypeScript | 保留并扩展 | 作为单元和契约测试基础 |

依据：[VERIFY: package.json:5] [VERIFY: src/utils/export-notes.ts:1] [VERIFY: src/components/notes/ImageInsertButton.tsx:4] [VERIFY: tsconfig.json:1]

### 6.2 建议移出 VMark 主路径

| 资产 | 处置 | 原因 |
| --- | --- | --- |
| `auth-store.ts` / Supabase 登录页面 | 移除或隔离 | 与无账号本地功能冲突 |
| `account-store.ts` | 移除 | 连续登录/蛋仔状态不属于目标产品 |
| `rehearsal-store.ts` | 移除 | 逐句练习不属于目标产品 |
| `affirmation-store.ts` | 移除 | 肯定语与智能提醒不属于目标产品 |
| `app/(tabs)/rehearsal/**` | 移除 | 旧产品页面 |
| `app/(tabs)/affirmations/**` | 移除 | 旧产品页面 |
| 录音、语音、位置、活动、日历工具 | 移除 | 扩大权限和维护面 |
| 动态蛋仔 App 图标 | 移除 | 不属于 VMark 产品识别 |
| AsyncStorage `Note[]` 正文存储 | 仅用于迁移读取 | 不得继续作为目标正文存储 |

依据：[VERIFY: app/_layout.tsx:8] [VERIFY: src/stores/rehearsal-store.ts:11] [VERIFY: src/stores/affirmation-store.ts:9] [VERIFY: src/stores/account-store.ts:6] [VERIFY: app.json:13]

### 6.3 暂时不要删除

在完成旧笔记迁移工具前，不要删除：

- `src/types/index.ts` 中的旧 `Note`；
- `src/stores/notes-store.ts`；
- `src/utils/export-notes.ts`；
- 旧图片目录读取能力。

这些代码应被隔离到 `legacy/` 或只读迁移模块，直到迁移测试通过。

---

## 7. 目标架构

以下目录均为 `[TARGET]`，表示建议的新架构，不是当前已经存在的代码。

```text
app/
├── _layout.tsx
├── onboarding/
│   └── workspace.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── files/
│   │   ├── index.tsx
│   │   └── workspace/[workspaceId].tsx
│   ├── search/
│   │   └── index.tsx
│   ├── ai/
│   │   └── index.tsx
│   └── settings/
│       └── index.tsx
└── editor/
    └── [workspaceId]/[fileId].tsx

src/
├── core/
│   ├── workspace/
│   │   ├── types.ts
│   │   ├── WorkspaceAdapter.ts
│   │   ├── ManagedWorkspaceAdapter.ts
│   │   └── LinkedWorkspaceAdapter.ts
│   ├── documents/
│   │   ├── types.ts
│   │   ├── DocumentSession.ts
│   │   ├── revision.ts
│   │   ├── recovery-journal.ts
│   │   └── save-state-machine.ts
│   ├── formats/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   └── adapters/
│   ├── security/
│   │   ├── path-policy.ts
│   │   ├── render-policy.ts
│   │   └── sensitive-files.ts
│   └── protocol/
│       ├── editor-messages.ts
│       └── schemas.ts
├── services/
│   ├── indexing/
│   ├── history/
│   ├── backup/
│   ├── ai/
│   └── settings/
├── db/
│   ├── client.ts
│   ├── schema.ts
│   └── migrations/
├── stores/
│   ├── workspace-ui-store.ts
│   ├── editor-ui-store.ts
│   └── settings-store.ts
└── components/
    ├── files/
    ├── editor/
    ├── search/
    └── ui/

web-editor/
├── src/
│   ├── protocol/
│   ├── editor/
│   ├── markdown/
│   ├── structured/
│   ├── mermaid/
│   └── security/
└── build/
```

目标数据流必须是：

```text
用户操作
  ↓
React Native UI
  ↓
导航与命令层
  ↓
Document Session ──→ Format Registry ──→ WebView Editor Core
  │
  ├──→ WorkspaceAdapter ──→ 用户文件系统（正文唯一真源）
  ├──→ SQLite Index/History
  └──→ Recovery Journal

AI 命令
  ↓
AI Gateway
  ↓
Proposal + Diff
  ↓
用户确认
  ↓
Document Session revision 检查
  ↓
WorkspaceAdapter 保存
```

该分层来自实现文档技术架构。[VERIFY: VMark-Mobile-实现文档.md:561]

### 7.1 状态边界

必须区分：

- 文件正文：只由 Document Session 管理；
- 文件系统访问：只由 WorkspaceAdapter 管理；
- 格式能力：只由 Format Registry 决定；
- 编辑器内部状态：WebView 内核管理，但必须可恢复；
- UI 临时状态：Zustand 或 reducer；
- 搜索、历史、设置：SQLite；
- API Key：SecureStore/Keychain/Keystore；
- AI 结果：临时 proposal，不作为正文真源。

禁止页面组件直接：

- 判断扩展名后选择所有行为；
- 直接读写文件；
- 直接写 SQLite 正文；
- 直接执行 WebView JavaScript 字符串；
- 直接应用 AI 返回内容。

---

## 8. 分阶段升级计划

每个阶段都必须独立可测试。前一阶段未过门禁，不进入后一阶段。

### Phase 0：仓库基线与旧业务隔离

目标：让项目从“NoteRehearse 产品”转为“VMark Mobile 开发基线”，但暂不破坏旧数据。

任务：

- [ ] 把实现文档和本报告放入 `docs/`。
- [ ] 创建升级分支，例如 `codex/vmark-mobile-upgrade`。
- [ ] 记录当前 `npm test` 和 `npm run typecheck` 基线。
- [ ] 新增目标架构 ADR 索引。
- [ ] 移除本地主流程的 Supabase 登录保护。
- [ ] 启动页面改为工作区检查，而不是登录检查。
- [ ] 将 NoteRehearse 专属页面移到 `legacy/` 或从目标导航移除。
- [ ] 不删除旧 AsyncStorage 数据。
- [ ] 清理不再需要的权限和插件，但保留迁移仍需的文件读取能力。
- [ ] 将应用名、slug、scheme、package 标识调整为自有品牌占位名，禁止继续把 VMark 当正式品牌。

验收：

- [ ] 无 Supabase 环境变量时应用可以启动。
- [ ] 无网络时可以进入工作区引导页面。
- [ ] 旧笔记仍可被迁移模块读取。
- [ ] TypeScript 和旧测试仍通过，或旧测试被有理由地归档。

### Phase 1：P0 技术 Spike

目标：回答实现文档第 15 章的 8 个问题。[VERIFY: VMark-Mobile-实现文档.md:1084]

必须形成 `docs/spikes/` 下的报告：

1. `ios-directory-access.md`
2. `android-saf-capabilities.md`
3. `codemirror-ime.md`
4. `large-file-performance.md`
5. `webview-incremental-protocol.md`
6. `mermaid-stress-test.md`
7. `recovery-after-kill.md`
8. `editor-accessibility.md`

每份 Spike 必须记录：

- 测试设备和系统版本；
- 最小复现工程；
- 操作步骤；
- 结果数据；
- 失败模式；
- 最终架构决定；
- 对实现文档阈值的影响；
- 不允许放宽的数据安全要求。

门禁：

- [ ] iOS 和 Android 至少各一台真机验证目录授权和写回。
- [ ] 中文输入法 composition、撤销和光标行为可接受。
- [ ] App 被杀后可以恢复最后确认存在的未保存输入。
- [ ] 失败不能显示为已保存。

### Phase 2：WorkspaceAdapter 与文件浏览

目标：完成工作区授权、恢复、文件列表和真实目录树。

任务：

- [ ] 定义 `WorkspaceGrant`、`WorkspaceCapability`、`FileEntry`、`FileStat`。
- [ ] 实现 Managed Workspace。
- [ ] 实现 iOS Linked Workspace。
- [ ] 实现 Android Linked Workspace。
- [ ] 所有 path 先规范化并验证工作区边界。
- [ ] Provider 不支持的操作通过 capability 隐藏。
- [ ] 工作区去重、固定、重命名显示名、重新授权和移除。
- [ ] 移除工作区记录不得删除真实文件。
- [ ] 文件浏览支持格式聚合和真实目录树。
- [ ] 新建、重命名、移动、复制、分享、删除走统一命令层。

测试：

- [ ] path traversal 单元测试；
- [ ] adapter 契约测试；
- [ ] 权限失效/恢复集成测试；
- [ ] 文件名冲突测试；
- [ ] Provider 只读/离线测试；
- [ ] 同一路径去重测试。

### Phase 3：Document Session、可靠保存与恢复

目标：建立整个产品最关键的数据安全底座。

任务：

- [ ] 定义 `sessionId`、`workspaceId`、`fileId`、`revision`、`dirty`。
- [ ] revision 组合 Provider 标识、mtime、size 和内容摘要。
- [ ] 打开时保存 baseline revision。
- [ ] 每次编辑写入内存 draft 和 recovery journal。
- [ ] 自动保存前重新获取目标 revision。
- [ ] 支持临时文件写入 + replace。
- [ ] Provider 不支持原子 replace 时走 capability-limited path。
- [ ] 外部 revision 变化时停止覆盖并进入冲突状态。
- [ ] 支持保留本地、保留外部和手动合并。
- [ ] 保存成功后更新 revision、历史和索引。
- [ ] WebView 崩溃或 App 被杀后从 recovery journal 恢复。
- [ ] 删除/移动打开中的文件要经过 Document Session 协调。

发布阻断测试：

- [ ] 写入失败不能显示成功；
- [ ] 磁盘满不能丢失 draft；
- [ ] 外部修改不能被静默覆盖；
- [ ] App kill 后 draft 可恢复；
- [ ] WebView crash 后 draft 可恢复；
- [ ] 连续快速保存不会发生旧写入覆盖新写入。

### Phase 4：Format Registry 与 WebView 编辑内核

目标：建立统一格式能力，不在页面散落扩展名判断。

任务：

- [ ] 实现文档中的 `ViewKind`。
- [ ] 实现 `FormatAdapter`。
- [ ] 注册 Markdown、Text、YAML、JSON/JSONL、TOML、Mermaid、Code、Unknown Text、Binary。
- [ ] 建立大文件策略和 security profile。
- [ ] 构建本地 WebView bundle。
- [ ] 接入 CodeMirror 6。
- [ ] 接入 Tiptap/ProseMirror 或经 Spike 证明等价的 Markdown 富文本方案。
- [ ] 使用版本化、schema 校验的消息协议。
- [ ] 每条消息校验 protocol、sessionId 和 revision。
- [ ] 编辑 change 使用增量 transaction。
- [ ] App 切后台前要求 WebView flush。
- [ ] 禁止任意网络导航、`window.open` 和文件系统直连。

协议至少覆盖：

```ts
editor.ready
document.open
document.change
document.saveRequested
document.saved
view.change
selection.change
diagnostics.update
render.exportRequested
```

协议依据：[VERIFY: VMark-Mobile-实现文档.md:625]

### Phase 5：格式编辑器

#### 5.1 Markdown

- [ ] 所见即所得；
- [ ] 源码模式；
- [ ] 预览；
- [ ] 差异视图；
- [ ] 横屏双栏；
- [ ] frontmatter；
- [ ] 数学公式；
- [ ] Mermaid 围栏预览；
- [ ] 表格、任务列表、代码块、链接、Wiki 链接、本地附件；
- [ ] 查找/替换、撤销/重做；
- [ ] 块级源码查看；
- [ ] 键盘上方格式工具栏；
- [ ] IME 和读屏测试。

#### 5.2 JSON/YAML/TOML

- [ ] 树视图；
- [ ] 源码视图；
- [ ] 对象数组表格；
- [ ] 差异视图；
- [ ] 200ms 左右防抖解析；
- [ ] 解析错误保留上一次有效预览；
- [ ] YAML 安全模式；
- [ ] JSONL 逐行虚拟化；
- [ ] 格式化先显示差异；
- [ ] 不自动重排用户源码。

#### 5.3 Mermaid

- [ ] 离线 Mermaid bundle；
- [ ] 严格安全模式；
- [ ] 源码编辑；
- [ ] 预览、平移、缩放、适应屏幕、居中；
- [ ] PNG/SVG 导出；
- [ ] 节点/边/时间/内存限额；
- [ ] 取消和超时；
- [ ] SVG sanitizer；
- [ ] 禁止外链和脚本。

#### 5.4 Code/Text/Binary

- [ ] 常用代码高亮；
- [ ] 默认只读或显式开启编辑；
- [ ] Unknown text 源码回退；
- [ ] Binary 系统预览/打开；
- [ ] 任何代码均不得执行。

### Phase 6：SQLite、搜索、历史与备份

目标：实现文档第 7 章数据模型和第 4.7/4.8 章功能。

任务：

- [ ] SQLite migrations；
- [ ] `workspaces`；
- [ ] `file_index`；
- [ ] FTS `file_search`；
- [ ] `document_history`；
- [ ] `editor_sessions`；
- [ ] `backups`；
- [ ] 索引增量更新；
- [ ] 索引损坏检测和重建；
- [ ] 文件名、正文、历史和最近活动搜索；
- [ ] 结果摘要和跳转定位；
- [ ] 历史快照与保留策略；
- [ ] 手动备份；
- [ ] 自动备份；
- [ ] manifest、版本和 checksum；
- [ ] 恢复预检、冲突策略和恢复演练。

禁止：

- [ ] SQLite 不得成为正文真源；
- [ ] API Key 不得进入 SQLite；
- [ ] 不得长期保存完整 AI 提示词和响应；
- [ ] 不得在日志记录外部 Provider 临时令牌。

### Phase 7：AI Gateway 与提案应用

目标：只实现“显式上下文、先预览后应用”的 AI。

任务：

- [ ] Provider interface；
- [ ] API Key 存 SecureStore/Keychain/Keystore；
- [ ] HTTPS 远端限制；
- [ ] 用户明确选择当前文件、选区或额外文件；
- [ ] 发送前显示上下文摘要；
- [ ] 敏感文件过滤；
- [ ] 流式进度；
- [ ] 输出视为不可信文本；
- [ ] proposal + diff；
- [ ] 支持接受全部、拒绝、部分接受；
- [ ] 应用前检查 revision；
- [ ] AI 无权绕过 Document Session；
- [ ] 不请求、不记录、不展示私有思维链。

安全测试：

- [ ] prompt injection 不能扩大文件范围；
- [ ] AI 返回 HTML/SVG/Mermaid 必须走安全管线；
- [ ] revision 过期时禁止直接应用；
- [ ] Key 不出现在日志、备份或普通数据库；
- [ ] 取消和断网不会破坏 draft。

### Phase 8：设计系统、设置和发布收口

任务：

- [ ] 按实现文档建立 Light/Dark 设计令牌；
- [ ] 实现 4pt spacing、卡片圆角、热区和字体规则；
- [ ] 文件类型不能只靠颜色区分；
- [ ] 支持横屏、平板、小屏和动态字体；
- [ ] 设置覆盖编辑器、AI、存储、备份、安全、隐私；
- [ ] 简体中文和英文使用文案 key；
- [ ] VoiceOver/TalkBack 完整走查；
- [ ] 减少动态效果；
- [ ] 真机性能基准；
- [ ] Maestro E2E；
- [ ] 关键组件截图基线；
- [ ] 隐私和权限清单；
- [ ] 商店发布配置。

门禁必须完全采用实现文档第 12.3 和第 16 章。[VERIFY: VMark-Mobile-实现文档.md:917] [VERIFY: VMark-Mobile-实现文档.md:1099]

---

## 9. Windows 端首轮具体任务

Windows 电脑不要一次执行全部升级。第一轮只做 Phase 0，不开始编辑器或 AI。

### 9.1 首轮输入

确保 Windows 端有：

- 完整 Git 仓库；
- `docs/VMark-Mobile-实现文档.md`；
- `docs/VMark-Mobile-升级对比报告.md`；
- Node/npm；
- Android Studio 和至少一个 Android 模拟器；
- 后续 iOS 专项仍必须回到 macOS/Xcode 真机验证。

### 9.2 PowerShell 基线命令

```powershell
git status --short
git branch --show-current
npm ci
npm test
npm run typecheck
git switch -c codex/vmark-mobile-upgrade
```

如果工作区已有未提交修改，不要覆盖、重置或清理；先记录并确认修改归属。

### 9.3 第一批代码修改范围

只允许修改：

- 应用启动和导航；
- App 名称/占位品牌配置；
- 登录门槛；
- 新工作区引导空页面；
- 旧业务路由隔离；
- 权限清理；
- 基础目标目录和接口骨架；
- 相应测试。

第一批不允许：

- 实现假的 WorkspaceAdapter；
- 用 AsyncStorage 模拟真实工作区；
- 用普通 TextInput 宣称完成 CodeMirror；
- 用远程 CDN 加载编辑器或 Mermaid；
- 开始 AI；
- 删除旧笔记数据。

### 9.4 第一批交付条件

```text
[ ] 无 Supabase 环境变量可以启动
[ ] 无账号可以进入应用
[ ] 默认进入工作区引导
[ ] 一级导航变为 文件 / 搜索 / AI / 设置
[ ] 尚未实现的 Tab 明确显示阶段状态，不伪装完成功能
[ ] NoteRehearse 页面不再进入主流程
[ ] 旧数据未删除
[ ] 不再请求无关权限
[ ] npm test 通过
[ ] npm run typecheck 通过
[ ] 变更说明引用实现文档章节
```

---

## 10. 可直接交给 Windows Codex 的任务提示词

```text
你正在把现有 NoteRehearse React Native/Expo 项目升级为 VMark Mobile。

必须先完整阅读：
1. docs/VMark-Mobile-实现文档.md
2. docs/VMark-Mobile-升级对比报告.md

规则：
- 实现文档是唯一产品实现基准。
- 如果报告、当前代码或你的常规做法与实现文档冲突，以实现文档为准。
- 不得把当前 NoteRehearse 行为当成产品需求。
- 不得删除或放宽文件授权恢复、可靠保存、冲突防护、草稿恢复、
  Mermaid/SVG 安全、备份校验、AI 修改前预览和基础无障碍。
- 不得增加终端、Shell、代码执行、调试器、LSP、Git UI、默认云账号或多人协作。
- AI 永远只能生成 proposal，不能直接写文件。
- 文件系统正文是唯一真源；SQLite 只存索引、历史和应用状态。
- 任何旧笔记迁移都必须可回滚，未完成迁移前不能删除 AsyncStorage 旧数据。
- 修改前检查 git status，保护用户已有修改。
- 每次只完成一个阶段，先测试再进入下一阶段。

本轮只执行报告中的 Phase 0：
1. 建立升级分支；
2. 保存 npm test 和 npm run typecheck 基线；
3. 取消 Supabase 登录对本地功能的强制保护；
4. 把启动流程改为检查可访问工作区；
5. 新增工作区引导占位页面；
6. 把一级导航改为 文件、搜索、AI、设置；
7. 将旧练习、暗示、账号连续登录业务移出主流程，但暂不删除旧数据；
8. 清理不再需要的权限；
9. 为目标 Workspace、Document、Format、Protocol 模块建立类型/接口骨架，
   但不要用假实现冒充功能完成；
10. 补充对应单元测试并运行 npm test、npm run typecheck。

开始前请先输出：
- 你从实现文档提取的本阶段验收标准；
- 计划修改的文件；
- 将保留、隔离和删除的代码；
- 数据迁移与回滚风险。

完成后请输出：
- 逐文件变更摘要；
- 测试结果；
- 尚未完成的文档条目；
- 下一阶段建议；
- 是否存在任何与实现文档的偏离。没有偏离时明确写“无偏离”。
```

---

## 11. 阶段报告模板

每次 Windows 端完成一个阶段后，用以下格式回报：

```markdown
# VMark Mobile 阶段完成报告

## 阶段
Phase X：名称

## 对应实现文档
- 第 X.X 章：
- ADR：
- Definition of Done：

## 已完成
- [x]

## 未完成
- [ ]

## 代码变更
| 文件 | 变更 | 文档依据 |
| --- | --- | --- |

## 数据安全
- 正文真源：
- 保存失败行为：
- 冲突行为：
- 恢复行为：
- 是否可能静默覆盖：

## 安全与隐私
- 新权限：
- 新网络请求：
- 新日志：
- 新密钥存储：
- WebView 边界：

## 测试
- npm test：
- npm run typecheck：
- 契约测试：
- 集成测试：
- E2E：
- 真机：

## 偏离
- 无偏离
或
- 偏离内容：
- 原因：
- ADR：
- 批准状态：

## 下一阶段
- 
```

---

## 12. 最终验收清单

项目只有满足以下条件，才能称为“按实现文档完成 VMark Mobile 升级”。

### 产品与导航

- [ ] 无账号可完整使用本地功能；
- [ ] 文件、搜索、AI、设置四个一级入口；
- [ ] 工作区授权、恢复、移除和真实路径可见；
- [ ] 文件格式聚合和真实目录树同时存在；
- [ ] 未识别文本和二进制有安全回退。

### 编辑与格式

- [ ] Markdown 所见即所得、源码、预览、差异；
- [ ] JSON/YAML/TOML 树、源码、条件表格和差异；
- [ ] Mermaid 源码、预览、缩放和导出；
- [ ] 代码高亮和显式编辑；
- [ ] 格式能力全部来自 Format Registry；
- [ ] 大文件策略符合真机测试结果。

### 数据安全

- [ ] 文件系统正文是唯一真源；
- [ ] revision 和 expectedRevision 生效；
- [ ] 原子保存或明确 capability-limited 保存；
- [ ] 外部修改不会被静默覆盖；
- [ ] 保存失败不显示成功；
- [ ] recovery journal 可恢复 App kill 前输入；
- [ ] WebView crash 不丢 draft；
- [ ] 历史和索引可重建；
- [ ] 备份有 manifest、版本和 checksum；
- [ ] 已做恢复演练。

### 安全与隐私

- [ ] path traversal 和符号链接越界被阻止；
- [ ] Mermaid 严格模式；
- [ ] SVG 白名单净化；
- [ ] WebView 禁止任意网络导航；
- [ ] 代码和图表永不执行；
- [ ] AI Key 只在安全存储；
- [ ] AI 使用显式最小上下文；
- [ ] AI 只生成 proposal；
- [ ] AI 应用前检查 revision；
- [ ] 日志、备份和数据库不泄露正文、路径或密钥。

### 质量

- [ ] 单元测试；
- [ ] Native/WebView 协议契约测试；
- [ ] WorkspaceAdapter 契约测试；
- [ ] 保存状态机测试；
- [ ] 集成测试；
- [ ] Maestro E2E；
- [ ] iOS/Android 真机；
- [ ] 小屏、横屏、平板；
- [ ] 浅色、深色、动态字体；
- [ ] 中文、英文输入法；
- [ ] VoiceOver/TalkBack；
- [ ] 无网、弱网、后台、低存储；
- [ ] 性能预算达标；
- [ ] Figma 视觉验收。

最终验收来源：[VERIFY: VMark-Mobile-实现文档.md:8] [VERIFY: VMark-Mobile-实现文档.md:193] [VERIFY: VMark-Mobile-实现文档.md:561] [VERIFY: VMark-Mobile-实现文档.md:768] [VERIFY: VMark-Mobile-实现文档.md:796] [VERIFY: VMark-Mobile-实现文档.md:833] [VERIFY: VMark-Mobile-实现文档.md:863] [VERIFY: VMark-Mobile-实现文档.md:1099]

---

## 13. 审计复核记录

本报告已执行以下只读检查：

```text
rg --files
rg 目标能力关键词
读取 package.json / app.json / tsconfig.json
读取路由、stores、types、Markdown WebView、导出和图片相关实现
npm test
npm run typecheck
```

审计确认：

- [x] 所有“当前实现”结论均引用实际代码；
- [x] 所有“目标要求”均引用实现文档；
- [x] 建议的新目录均标记为 `[TARGET]`；
- [x] 未把不存在的能力描述为已实现；
- [x] 测试和类型检查结果来自实际命令；
- [x] 本报告未修改现有业务代码；
- [x] 本报告不替代实现文档。

---

## 14. 最终指令

后续所有代码升级必须围绕下面三条主线展开：

1. 外部工作区能稳定授权、恢复和写回；
2. WebView 编辑器在输入法、大文件和崩溃场景下可靠；
3. 自动保存、冲突检测和草稿恢复不丢数据。

在这三个底座完成并通过真机验证之前，不要把 AI、动画、视觉完整度或更多格式数量当作主要进度指标。[VERIFY: VMark-Mobile-实现文档.md:1127]

