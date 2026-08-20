# Enjoy 产品调研记录

## 登录后首页与全局导航

已通过正常登录访问 `https://app.enjoy.bot/home`。侧边栏采用分组导航：Home；Library 下的 Audio、Video、Ebook、Courses；Learning Tools 下的 Chat、Vocabulary；Generate Content 下的 Smart Translation、Voice Synthesis；Apps 下的 Enjoy Player 与 Chrome Extension；另有 Sync 和 Settings。账户区包含订阅升级入口与账户菜单。

首页呈现学习目标进度（今日完成时长/目标时长）、词汇复习待办、社区活动、按日/周/月汇总的学习统计热力图，以及最近视频和音频列表。空资源状态提供 Add Media 入口。由此可见，原产品以媒体资源库、课程、会话型学习工具和学习统计为整体信息架构，而非单独的聊天或播放器界面。

## 当前可见状态

- 已登录；用户界面主语言为英语。
- 侧边栏可折叠。
- 首页数据按学习活动持续聚合，应被视为需要跨会话持久化的用户状态。
- 页面版本标记为 `v-7de01b8`。

## 待调研

Audio/Video 的资源库、资源详情和 Echo 跟读流程；Chat 对话与伙伴配置；Courses 的层级和进度；Smart Translation/Voice Synthesis 的生成器与 TTS；Settings 的 AI、STT、TTS 等配置。

## 取证文件

- 首页页面抓取：`/home/ubuntu/browser_html/app_enjoy_bot_home_1786597911475.html`
- 首页截图：`/home/ubuntu/screenshots/app_enjoy_bot_2026-08-13_05-11-48_5149.webp`

## Audio Library

Audio Library 展示资源总数、搜索框和 Import 操作。库为空时显示明确的引导插画、支持格式说明（MP3、WAV、OGG、M4A、AAC 等）与重复的 Import CTA。由此可知，导入本地音频是资源体系的正式入口；资源库需要支持搜索和空状态，而不是仅由 AI 生成内容。

## Courses

课程页为卡片网格，顶部说明为“Browse and enroll in language learning courses”。每张课程卡以封面、课程名称、已报名人数和章节数构成；报名状态会在卡片上显示（当前首个课程为 Enrolled）。可访问的样本课程包括：Master English Conversation in 100 Days（96 Chapters）、How to talk with AI（6 Chapters）、Conversation 101: Universal Conversation Expression（8 Chapters）、Daily Speech Exercises（34 Chapters）、Most Common American Idioms（1355 Chapters）。课程数据模型至少包含封面、标题、报名人数、章节数量与当前用户报名状态。

## 待验证的交互

- Import 的文件类型约束、上传/处理/错误状态及导入后资源详情。
- 课程详情中的报名、章节列表、单课学习与进度恢复。
- Echo / 跟读是否直接从资源详情或独立工具入口启动。

## Course Detail 与章节导航

课程详情为居中的课程介绍卡：返回课程列表、课程名、封面、描述、Continue Learning 主按钮和当前章节提示。Continue Learning 直接恢复到用户当前章节。右上角 Menu 打开覆盖式右侧章节抽屉，背景页面变暗。抽屉包含关闭按钮、章节搜索、状态筛选下拉框（默认 All）、带课程序号的章节列表及分页。首章显示为当前可进入状态，后续章节带锁图标，反映了顺序解锁/学习门槛；页面可见“Page 1 of 5”。

**关键状态与持久化关系：** CourseEnrollment 应保存当前章节；Chapter 具有序号、标题、可用/锁定状态；课程详情的 Continue Learning 依赖 CurrentChapter；章节抽屉的关键词与筛选可作为会话内 UI 状态。移动端应采用详情页 + 章节选择底部抽屉或全屏模态来替代宽屏侧抽屉，同时保留检索、筛选、锁定、分页和继续学习的行为。

## 课程章节内的 Echo / 跟读练习

进入章节后，URL 结构为 `/courses/{courseId}/chapters/{chapterId}/sections/{number}`。页面显示完成说明“Please listen to and shadow all examples to complete this section.”、可变插槽式 Expression、Examples 汇总进度（示例为 0/3 Listened、0/3 Shadowed），以及逐例句子练习卡。

每个示例卡包含：例句序号与文本；原音播放控制（播放/暂停、0:00–0:00 时长/进度条）；音量控制；附加的图标次级动作；Pitch contour 可展开区；Record 按钮；以及 1/3 的例句分页前后导航。页面右下还有 Open Chat 浮动入口，表明课程可在指定上下文中衔接对话练习。该界面将“听原音”和“录制跟读”分别计数，章节达成条件由两个进度共同组成。

**拟重建的关键状态机：** `idle → playingOriginal → originalCompleted → recording → processing/saving → recordingReady → replayingRecording`，并独立维护 `listenCompleted` 与 `shadowCompleted`。每个 Example 必须可恢复其原音进度、录音、完成状态及当前选中的例句页；章节进度应由示例聚合更新，不能以单一播放按钮替代。

## 课程内上下文辅助聊天

课程页面右下角的 Open Chat 悬浮按钮会打开固定宽度的侧边聊天面板；打开后按钮文案变为 Close Chat，背景课程仍保持可见。面板有欢迎语、预设快捷动作“分析 / 简化 / 改写 / 解释”、附件入口和消息输入框。关闭后练习状态不变。虽然页面上方存在 Tips 按钮，但本次可观察到的激活结果是该上下文聊天面板；后续应避免把课程提示与聊天支持的行为合并为不可关闭的全屏对话页。

**对移动端的含义：** 实现为可保留课程上下文的底部抽屉/全屏面板，进入时传入 Course、Chapter、Section、Expression、Example 等上下文，保留快捷指令与附件能力；关闭仅改变 UI 面板状态，不丢失课程练习状态。

## Pitch contour 分析

展开 Pitch contour 后，界面先显示“Analyzing audio...”加载态，分析完成后呈现时间横轴、音高纵轴、青色分段轮廓、浅色波形/参考轨迹，以及两个独立开关：Toggle reference 和 Toggle waveform。也就是说，音高图并非静态装饰；它是一个按音频派生并可缓存的可视化结果，必须具备 `idle / analyzing / ready / error` 状态，并提供参考轨/波形层的显示控制。最小可行移动端实现应保留异步分析、图表、参考/波形可见性开关和失败重试；如浏览器/设备不支持实际 pitch 分析，则需显示受控的不可用或降级状态，不能伪造发音评分。

## Chat 对话主页与新建会话

Chat 页面采用双栏：左栏为会话列表，上部有 New Chat 主按钮；右侧为会话内容区。空态明确展示“Start a conversation… / No conversations yet”。点击 New Chat 创建一个名为 New Chat 的会话占位项，并展示欢迎消息“Hello there! How can I help you today?”以及四个引导性快捷提示：解释语法、学习词汇与短语、练习发音/口音、日常对话练习。输入区为文本框，提供附件动作和发送控件。

由此可拆分出 ConversationSession（标题、创建/更新时间、上下文、消息列表、可选关联伙伴/资源）和 ConversationMessage（角色、正文、附件、生成/播放状态）。在新会话未发送消息前，会话标题为可持久化的临时值；模型首次回复或用户首次消息后可转为自动摘要标题。移动端应保留“会话列表 → 新建 → 引导快捷入口 → 输入/附件 → 流式消息”的连续流程，而非将对话入口做成一次性模态框。

## Voice Synthesis / TTS

语音合成页标明当前 Provider 为 Enjoy API，并提供 Change 跳转至 `Settings?tab=ai`。表单依次为 Target Language 下拉框、Voice 下拉框、文本输入区和 Synthesize 主操作。无文本时 Synthesize 被禁用。当前默认音色为 Jenny (US, Female)，元数据为“US English female voice”。Target Language 下拉实际可选语言为 English、中文、日本語、한국어、Español、Français、Deutsch、Português。页面提供可折叠的 Show History；空态为 No synthesis history。

**重建要求：** TTS 配置与生成记录分离。TTSSettings 保存 provider、语言、默认 voice 与速率等参数；SynthesisRecord 保存输入文本哈希、音色、语言、参数、音频 URI、生成状态与时间戳。输入为空时禁用生成；生成时显示 loading；成功后提供播放/重放；失败时给出可重试的明确错误；重复相同文本+音色+参数时优先命中本地缓存。

补充观察：语言下拉框可通过键盘 Escape 关闭。关闭时不改变当前语言或生成历史；该菜单属于短暂 UI 状态，不应自动持久化。

TTS 的英语音色选择器公开展示的当前目录包括：Jenny（US, Female）、Guy（US, Male）、Aria（US, Female）、Davis（US, Male）、Sonia（UK, Female）、Ryan（UK, Male），每项均附有国家/地区、性别和“English voice”描述。克隆不应硬编码该清单；应使用 `Voice` 实体承载 `id、displayName、locale、region、gender、description、provider`，并由 `TTSProvider.listVoices(language)` 返回。UI 应按所选语言刷新可用音色，同时允许后续替换为合法可访问的公开服务目录。

## Smart Translation 作为结构化资源生成入口

Smart Translation 页同样展示 Provider（Enjoy API）和 Settings 的 Change 链接。表单包括 Source Language（默认中文）、Swap languages、Target Language（默认 English）、Translation Style、Source Text 和 Translate 按钮；空文本时 Translate 禁用。Translation Style 实际选项为 Literal、Natural、Casual、Formal、Simplified、Detailed、Custom。下方有 Show History 以及按 source / translated text 搜索的历史列表，当前空态为 No translation history。

在克隆中，翻译不应只是一次性的字符串替换。应保存 `TranslationRecord`（源/目标语言、风格、原文、译文、使用模型、创建时间、状态），并可一键转换为共享 Resource。`Custom` 风格需额外显示指令输入；其他风格以受控的系统提示生成。交换语言是无损地交换两个选择值的本地操作，历史检索应同时检索源文和译文。

## Settings — AI Services

设置页包含 General、Appearance、Language、AI Services 四个页签；General 当前仅见 Daily Goal（分钟/天）。AI Services 将服务按职责清楚拆成四张独立卡片，且各自有 Provider 选择器：

| 服务层                   | 原产品说明                                                       | 克隆中的接口边界                                                           |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Text Generation (LLM)    | 用于翻译、智能翻译、上下文翻译、词典查询                         | `AIProvider.chat / streamChat / generateStructured / testConnection`       |
| Speech Recognition (ASR) | 使用 Whisper 进行带时间戳的转写                                  | `STTProvider.transcribe / startRecording / stopRecording / testConnection` |
| Text-to-Speech (TTS)     | 为跟读材料生成音频                                               | `TTSProvider.listVoices / synthesize / stop / getAudio`                    |
| Pronunciation Assessment | 使用 Azure Speech Services，且说明其是唯一支持音素级评分的提供方 | `PronunciationProvider.assess`，必须允许不可用和降级                       |

原产品设置已体现了录音、转写、LLM、TTS 与发音测评分层的核心架构。用户的克隆将以自有 OpenAI-compatible LLM 设置替换 LLM 依赖，另行实现/配置 STT 和 TTS，绝不复用 Enjoy 的私有凭据或受保护端点。

## 指定功能与当前目标版本的边界

在已登录的当前 Enjoy 应用中，`/chat-partners` 与 `/resource-generator` 均返回 Not Found；全局侧边栏也没有对应入口。现有的内容生成入口为 Smart Translation 与 Voice Synthesis，Chat 为通用会话工具。因此，用户要求的“Chat Partners”和“Resource Generator”不能被误写为现有界面的直接像素复刻；将基于已观察到的 Enjoy 设计语言、资源关系和会话交互，新增为可运行的扩展模块，并在最终功能对照中明确标记为“以 Enjoy 工作流为依据的增强实现”。

## 对话创建的补充观察

经确认执行最小测试时，点击 New Chat 会立即在左侧会话列表新增一个 `New Chat` 项，并在右侧打开欢迎界面和四项提示卡；本次列表中可见多个同名 New Chat 占位项，说明新会话是在发送首条消息前即写入持久化列表。克隆实现需避免因重复点击生成无用空会话：应在新建后自动聚焦输入框，并在用户离开空会话时提供删除或复用逻辑；但为了接近当前行为，至少需支持“创建后未发送任何消息的会话占位状态”。

## 对话请求的实测加载态

已在用户确认后发送最小、无敏感测试文本。提交后，用户消息立即以右侧气泡显示；左侧会话标题从 New Chat 截断更新为首条用户消息；中间出现带旋转指示的 `Thinking…` AI 占位态；输入框仍显示消息文本，发送控件转为停止/处理中状态；顶部出现 Clear messages 操作。页面在短暂观察窗口内仍处于 Thinking 状态，尚未获得完成回复，因此完整流式文本、回复操作以及会话 TTS 尚未实测。

克隆实现应使 `sending` 成为持久消息写入后的可恢复状态，且避免无限等待：必须设置网络超时、取消请求、失败消息、重试和重新加载后未完成请求的明确恢复策略。会话标题可由首条用户消息派生，但需在真实产品中保留可编辑的显示名。

## 对话请求的实测完成态

最小测试请求随后成功完成，AI 回复为“Hello there! 👋”。完成后的消息旁出现 Copy、Export as Markdown、Refresh 三个操作；输入区恢复可编辑与 Send message 可用状态。可见行为表明：消息应有 `complete` 状态并支持复制、将会话导出为 Markdown、对回复重新生成/刷新。原产品的该回复卡在本次观察中未显示单独 TTS 播放按钮，因此克隆可将自动/手动朗读设计为用户可配置的增强行为，而不应宣称它是当前页面已验证的默认行为。

随后已进入 Voice Synthesis 页面，保持默认 English + Jenny (US, Female) 配置，准备进行经确认的最小合成测试。

## TTS 实测处理态

填写短文本后，Synthesize 由禁用变为可用；点击后语言与音色选择器视觉上进入不可编辑状态，按钮替换为 `Synthesizing…`，旁边出现 `Cancel`，历史区仍保持可见但尚无记录。短暂观察后仍在合成中，尚未获得音频结果或失败反馈。克隆必须实现这一可取消的任务状态：创建带 `pending` 状态的合成记录、禁用会改变任务输入的控件、允许取消并在取消后恢复表单。还需设置合成超时；若超时或服务失败，记录应进入 `failed`，并在历史中以可重试方式呈现，不能无限停留在 `pending`。

## TTS 实测成功态与播放

合成任务成功后出现 Generated Audio 卡：圆形播放/暂停主控、进度条、已播放/总时长（本次为 0:00 / 0:03）、音量图标、Download 和 Regenerate 操作。播放后主控切为暂停图标且进度显示为 0:01，证明播放状态与音频位置同步。历史区域在当前观察中仍显示 No synthesis history，表明页面中的“当前生成结果”和“可查询历史”可能分别管理，或历史刷新需显式展开/重新载入。

移动端应以真实的 `expo-audio` 播放器实现 `ready / playing / paused / ended / error`，存储音频 URI 与时长；需要提供播放/暂停、进度、音量、下载/保存（依平台能力）和重新生成。Download / Regenerate 是成功状态的次级动作；Regenerate 应创建替换或新版本，绝不能在没有告知的情况下覆盖用户已关联的资源音频。

## 录音权限/设备错误实测

经用户确认点击课程中的 Record 后，当前浏览器环境未能获取设备，页面在不破坏原有练习卡的情况下弹出红色错误 Toast：`Device access error occurred`。Record 按钮和原音播放控件仍可用，未进入伪录音状态，也没有错误地增加 Shadowed 计数。

克隆必须把设备/权限失败作为一等状态：录音权限被拒、没有麦克风、设备被占用、启动失败都应在状态机中终止到可重试的 `error`，提示用户到系统设置授权或切换设备；不得保存空录音、不得将例句标记为已跟读。后续只有真实录音成功后，才可调用 STT、播放用户录音和更新 shadow progress。
