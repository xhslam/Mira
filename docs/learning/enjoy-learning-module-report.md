# Enjoy 风格英语学习模块改造报告

**项目：** Inkstone / VMark Mobile  
**改造方式：** 在用户选择的当前工作区中增量接入  
**作者：** Manus AI  
**完成时间：** 2026-08-13

## 执行摘要

本次工作没有重置或清理现有 Inkstone/VMark Markdown 编辑器，而是在其既有的 Expo、SQLite、SecureStore 与 OpenAI-compatible AI Provider Profile 能力之上新增了独立的 **Learn** 一级入口。原有文件、绘图、AI、设置导航和工作区数据结构保持原样；新的学习模块以 `src/learning/` 为边界实现，使用自己的 SQLite 数据库文件保存学习资源、练习进度、录音元数据、伙伴、会话、课程、课程进度、生成草稿、TTS 缓存索引和学习设置。

目标产品研究表明，Enjoy 的核心不是普通聊天或普通音频播放器，而是围绕资源、句子、录音、课程和学习活动组织的闭环：资源被拆分为句子；用户先听、再跟读、再录音并回放；课程按章节和完成状态恢复；对话具有会话历史；生成器产出可复用的结构化内容。当前实现将这些关系明确建模，并且不会使用 Enjoy 的私钥、认证 Cookie、受保护端点或私有 TTS 服务。[1]

> 当前实现的 AI 对话与结构化资源生成仅使用用户在原应用 AI 设置中配置并安全保存的 OpenAI-compatible Provider Profile。TTS 则需要用户另行配置一个兼容 `/audio/speech` 的 HTTPS 服务和密钥。没有配置服务时，页面会显示可恢复的配置错误，不会伪造语音、转写或评分结果。

## 原产品理解与行为地图

已在正常登录的目标产品中查看了主页、Audio Library、Courses、课程详情、章节抽屉、句子级跟读、Pitch contour、课程上下文聊天、Chat、Voice Synthesis、Smart Translation 和 Settings。当前目标版本中没有独立的 `/chat-partners` 或 `/resource-generator` 路由；这两个请求路径均返回 Not Found。因此，本项目的“聊天伙伴”和“资源生成器”是基于 Enjoy 已验证的视觉语言、会话模型和结构化资源关系构建的功能增强，而不是对一个当前可见页面的逐像素复制。[1]

| 模块         | 目标产品已验证行为                                                                | 本次应用内实现                                                                                                     |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 全局信息架构 | 资源库、课程、聊天、翻译、语音合成、设置围绕学习活动组织。                        | 新增 Learn 一级入口，内部提供 Today、Practice、Chat、Courses、Generate、Settings 二级导航。                        |
| 跟读 / Echo  | 课程例句展示原音、句子选择、录音、Pitch contour、前后句导航、Listen/Shadow 计数。 | 资源—句子—练习进度—录音模型；真实麦克风权限、录音、录音回放、前后句切换、TTS 参考音频生成与缓存。                  |
| 课程         | 课程卡、章节抽屉、继续学习、锁定章节、章节内例句练习和完成进度。                  | 课程库、课程详情、逐课状态、顺序解锁、完成、继续进入关联的句子练习资源。                                           |
| 对话         | 会话列表、新建会话、提示卡、流式 Thinking 状态、完成后 Copy / Export / Refresh。  | 可复用伙伴、持久化会话和消息、系统角色注入、流式 AI 回复、错误消息持久化与重试准备。                               |
| 语音合成     | 语言、音色、文本、生成中可取消、播放、进度、下载、重新生成。                      | OpenAI-compatible TTS Base URL / key / voice / rate 设置、设备安全密钥保存、音频文件缓存、跟读页按句生成参考音频。 |
| 智能生成     | 翻译语言与风格、历史、由 AI 产生学习内容。                                        | 生成请求、等级、严格 JSON 校验、预览、保存为可用于跟读的共享 Resource。                                            |
| 设置         | LLM、ASR、TTS、发音评分分层，且提供商独立选择。                                   | 复用现有 LLM profile；TTS 设置独立；录音与未来 STT 解耦。                                                          |

### 关键状态转换

| 工作流   | 状态转换                                                                                      | 持久化结果                                                                  |
| -------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 句子跟读 | 选择句子 → 生成/播放参考音频 → 请求麦克风权限 → 录音 → 停止 → 保存 → 回放                     | `PracticeProgress` 与 `LearningRecording`，并在资源句子中保存参考音频 URI。 |
| AI 对话  | 选择伙伴 → 创建会话与开场消息 → 用户发送 → assistant `streaming` → `complete` 或 `incomplete` | `LearningConversation` 与 `LearningMessage`。                               |
| 课程学习 | 选择课程 → 打开可用课时 → 进入 Practice → 完成课时 → 解锁下一课                               | `CourseProgress`，支持重新进入正确课时。                                    |
| 资源生成 | 填写请求 → 调用已选 AI profile → 校验 JSON → 预览 → 保存 → 打开 Practice                      | `GenerationDraft` 和 `LearningResource`，并创建各句练习状态。               |
| TTS      | 保存密钥 → 请求 `/audio/speech` → 将字节写入应用私有目录 → 播放/缓存                          | `GeneratedSpeech` 元数据与本地音频 URI。                                    |

## 实现架构

模块采用 UI、学习应用服务、设备媒体和本地数据四层结构。原有 Markdown 工作区与学习领域只在应用壳层、通用主题、SecureStore 和 AI Provider Registry 相交；它们不共用业务实体或数据库表。

```text
App Shell
├── Existing: Files / Drawings / AI / Settings
└── Learn
    ├── Today
    ├── Practice
    ├── Chat + Partners
    ├── Courses
    ├── Generate
    └── Learning Settings

Learning Domain (src/learning)
├── SQLite snapshot repository
├── Resource / Sentence / Practice / Recording
├── Partner / Conversation / Message
├── Course / Lesson / CourseProgress
├── GenerationDraft / structured JSON validator
└── TTS secure key + file cache

Existing secure integration
├── AI Provider Profiles + SecureStore API keys
└── Existing streaming provider registry

Native media
├── expo-audio player and recorder
├── Android RECORD_AUDIO permission
└── iOS microphone usage declaration
```

| 组件     | 文件                                  | 职责                                                                                     |
| -------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| 学习模型 | `src/learning/learning-types.ts`      | 定义资源、句子、录音、伙伴、对话、课程、进度、生成草稿和设置。                           |
| 本地仓储 | `src/learning/expo-learning-store.ts` | 使用独立的 `inkstone-learning-v1.db` 和单一版本化快照持久化学习状态。                    |
| 初始内容 | `src/learning/learning-seed.ts`       | 提供可实际练习的初始资源、课程和伙伴；未预置伪造对话或 AI 生成结果。                     |
| 跟读     | `src/learning/practice-screen.tsx`    | 句子选择、录音授权、真实录音、回放、进度、TTS 参考音频。                                 |
| 对话     | `src/learning/chat-screen.tsx`        | 伙伴 CRUD、会话持久化、流式消息及错误显示。                                              |
| AI 适配  | `src/learning/learning-ai.ts`         | 读取现有 Provider Profile 与 SecureStore 密钥，调用既有流式提供商，校验结构化资源 JSON。 |
| 课程     | `src/learning/course-screen.tsx`      | 课程、课时、完成、顺序解锁与跳转到练习。                                                 |
| 生成器   | `src/learning/generator-screen.tsx`   | 请求、等级、AI 调用、严格 JSON 预览和保存资源。                                          |
| TTS      | `src/learning/learning-tts.ts`        | 保存 TTS key、调用兼容 `/audio/speech` 端点、将 MP3 写入私有目录。                       |
| 应用接入 | `src/app/learning-screen.tsx`         | Learn 导航、学习数据加载、主题化界面和设置。                                             |

## 功能对照矩阵

| 功能             | 原产品行为                                          | 重建行为                                                                                       | 状态        | 仍有差异                                                            |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Learn 入口和导航 | 侧边栏内有学习工具和生成内容分组。                  | 在既有应用底部主导航新增 Learn，内部使用移动端分段导航。                                       | ✅ Complete | 原目标为宽屏侧边栏，当前为移动优先布局。                            |
| 资源与句子模型   | 音频/视频/课程内容可成为学习材料。                  | `Resource` 保存文本、句子、参考音频 URI、录音和练习进度的关联。                                | ✅ Complete | 尚未实现本地 MP3/WAV 文件导入与波形生成。                           |
| 句子级跟读       | 播放、录音、播放录音、前后句、Listen/Shadow 统计。  | 句子选择、参考 TTS 音频、真实权限与录音、录音回放、前后句与持久化进度。                        | 🟡 Partial  | 未实现自动 STT、对比评分、时间戳切分、波形与真实 Pitch contour。    |
| 录音错误         | 无设备时显示 Device access error，且不计完成。      | 权限/设备异常时显示错误；没有保存 URI 时不写入录音或 Shadowed 状态。                           | ✅ Complete | 尚未在真机上复核不同厂商设备的错误文案。                            |
| TTS              | 选择语言/音色、生成、播放、下载、重新生成。         | 支持 OpenAI-compatible `/audio/speech`、密钥 SecureStore、voice/rate、私有缓存和跟读参考播放。 | 🟡 Partial  | 未实现完整语言/音色目录、下载按钮、生成历史页和取消控制。           |
| 聊天伙伴         | 当前目标版本无独立页面。                            | 可新增、编辑、删除（保留至少一个）、选择与复用伙伴配置。                                       | ✅ Complete | 头像为轻量图标/种子字段，尚未实现图像上传。                         |
| 对话             | 新会话、助手欢迎语、流式 Thinking、完成后消息操作。 | 伙伴开场消息、持久化会话、用户/assistant 消息、流式输出、错误消息与现有 profile 调用。         | 🟡 Partial  | 未实现附件、语音输入、导出 Markdown、复制、刷新、自动朗读回复。     |
| 课程             | 卡片、Continue Learning、章节/课时、锁定、完成。    | 课程库、详情、完成状态、顺序解锁、打开关联跟读资源。                                           | ✅ Complete | 未实现远程课程目录、分类筛选和多级 Chapter/Section 抽屉。           |
| 资源生成器       | 当前目标版本没有独立 `/resource-generator` 路由。   | 用户请求 → 指定等级 → AI 严格 JSON → 验证 → 预览 → 保存 → 打开 Practice。                      | ✅ Complete | 尚未提供生成内容的手动逐字段编辑器或一键转成新课程。                |
| AI 引擎          | AI Services 分开配置 LLM/ASR/TTS/Assessment。       | 复用现有 LLM profile；学习 TTS 分开配置；录音与 STT 结构分开。                                 | 🟡 Partial  | 尚未实现可用的 STT provider 表单、连接测试按钮和发音评估 provider。 |
| 跨重启持久化     | 目标产品会话、学习进度和设置可恢复。                | 所有学习领域实体保存在单独 SQLite 快照；LLM/TTS 私钥保存在 SecureStore。                       | ✅ Complete | 卸载应用仍会清除设备本地数据，尚无账户级跨设备同步。                |

## 验证结果

| 检查                                   | 结果   | 说明                                                                                               |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                    | 通过   | 最终学习模块与既有严格 TypeScript 配置兼容。                                                       |
| `npm run lint`                         | 通过   | Expo ESLint 已无错误或警告。                                                                       |
| `npm test`                             | 通过   | **93** 个测试文件、**553** 个测试全部通过。                                                        |
| `npx expo config --type public --json` | 通过   | 已确认 `expo-audio` 插件、Android `RECORD_AUDIO` 和 iOS 麦克风说明进入配置。                       |
| `npx expo export --platform android`   | 未完成 | 本地命令连续约 7.5 分钟无输出，已停止，避免长期卡住；需要在用户的正常网络/Android 构建环境再执行。 |

## 运行与配置说明

在项目根目录执行以下命令安装依赖并启动开发环境。

```bash
cd /Users/apple/Desktop/Mira
npm install
npm start
```

可按平台启动；真实录音需要 Android/iOS 设备或支持麦克风的模拟器，并在系统弹窗中允许麦克风权限。

```bash
npm run android
npm run ios
```

### 配置自己的 AI API

首先打开既有的 **AI** 入口，建立或选择一个 OpenAI-compatible Provider Profile，并填写 HTTPS Base URL、API Key 与 Model。密钥继续由现有 SecureStore 逻辑保存。随后进入 **Learn → Settings**，在 **AI engine** 选择该 profile。Conversation 和 Resource Generator 会读取这一选择；不需要也不应把 API key 写入源代码。

### 配置 TTS

进入 **Learn → Settings**，填写兼容 OpenAI 音频接口的 `TTS Base URL`，例如以 `/v1` 结尾的服务根地址；填写密钥后离开输入框即可存入 SecureStore；再指定 voice 和 rate。跟读页在首次播放没有参考音频的句子时会请求该服务的 `/audio/speech` 并将 MP3 缓存到应用私有目录。

### 生产验证

完成平台预构建后，再运行 Android 导出。由于本次会话中的导出无输出卡住，建议首先在本机观察网络、Gradle 与 Expo 诊断信息。

```bash
npx expo prebuild --platform android --clean --no-install
npx expo export --platform android
```

## 明确的剩余差异与建议的下一轮工作

本次优先实现了数据连通性、真实录音、真实外部 AI 调用、结构化资源生成和本地持久化，而不是制作不可工作的视觉原型。仍需在下一轮完成以下功能，才能进一步缩小与 Enjoy 的差距：为 STT 增加独立的兼容服务配置、上传和时间戳转写；增加音频导入、转码、波形和 Pitch contour 分析；实现发音评分服务；建立可编辑的资源库、TTS 历史、缓存命中视图、下载和重新生成；支持消息附件、复制/导出/刷新和回复自动朗读；实现生成资源到课程的可视化编排；并在实际 Android/iOS 设备完成录音、TTS、网络失败、离线恢复与 UI 视觉比较。

因此，本次不将 STT、发音评分、波形、Pitch contour 或所有 Enjoy 消息二级操作误报为已完成。已经可运行的部分会在未配置服务时展示可恢复错误，而不是创造虚假的成功状态。

## 参考资料

[1] [Enjoy Web 应用（登录后正常访问并实测的首页、课程、聊天、语音合成、智能翻译与设置流程）](https://enjoy.bot/legacy)

[2] [Enjoy Chat 页面](https://app.enjoy.bot/chat)

[3] [Enjoy Voice Synthesis 页面](https://app.enjoy.bot/voice-synthesis)

[4] [Enjoy Settings 页面](https://app.enjoy.bot/settings)
