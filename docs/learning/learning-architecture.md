# 英语学习模块架构设计（工作稿）

## 设计原则

学习模块以独立领域包 `src/learning/` 接入现有应用。它复用现有的 OpenAI-compatible Provider Profile、SecureStore 密钥和流式请求能力，但不复用 Markdown 工作区的语义或数据表。SQLite 持久化保存结构化学习状态；媒体文件和录音由应用私有目录保存，数据库只保存相对 URI、元数据和缓存键。

## 导航模型

```text
Learn
├── Home / 今日学习
├── Practice
│   ├── Resource Library
│   └── Sentence Practice
├── Conversations
│   ├── Session List
│   ├── Session Detail
│   └── Chat Partners
├── Courses
│   ├── Course Library
│   ├── Course Detail
│   └── Lesson Practice
├── Generate
│   ├── Resource Generator
│   └── TTS history
└── Learning Settings
    ├── AI engine selection / connection test
    ├── TTS configuration
    └── STT configuration
```

## 核心实体

| 实体                 | 关键字段                                                                                                                      | 关系                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Resource             | id、title、description、language、source、content、createdAt、updatedAt                                                       | 含多个 Sentence；可被 CourseLesson、Conversation 引用。 |
| Sentence             | id、resourceId、order、text、translation、startMs、endMs、audioUri                                                            | 有多个 Recording、PracticeProgress。                    |
| Recording            | id、sentenceId、uri、durationMs、transcript、state、createdAt                                                                 | 对应一句用户模仿录音。                                  |
| PracticeProgress     | resourceId、sentenceId、listened、shadowed、lastPositionMs、selected                                                          | 用于资源级进度恢复。                                    |
| Partner              | id、name、avatarSeed、description、personality、scenario、goal、level、openingMessage、voiceId、systemPrompt、correctionStyle | 复用到多个 Conversation。                               |
| LearningConversation | id、partnerId、title、objective、status、createdAt、updatedAt                                                                 | 含多个 LearningMessage。                                |
| LearningMessage      | id、conversationId、role、content、state、audioUri、createdAt                                                                 | 记录用户与 AI 的可恢复会话。                            |
| Course               | id、title、description、cover、language、level、enrolled                                                                      | 含多个 CourseLesson。                                   |
| CourseLesson         | id、courseId、order、title、resourceId、locked                                                                                | 关联 Resource，并由 CourseProgress 聚合。               |
| CourseProgress       | courseId、lessonId、state、completionPercent、lastOpenedAt                                                                    | 支撑 Continue Learning 和顺序解锁。                     |
| GenerationDraft      | id、request、topic、level、language、state、structuredJson、error                                                             | 成功后转换为 Resource。                                 |
| SpeechRecord         | id、textHash、text、voiceId、locale、rate、uri、durationMs、state                                                             | TTS 缓存与历史。                                        |
| LearningSettings     | selectedProviderProfileId、ttsProvider、ttsVoiceId、ttsRate、sttProvider、autoSpeak                                           | 与现有 AI Provider Profile 解耦。                       |

## 服务边界

```text
LearningRepository
├── initialize / list / get / upsert / remove
└── 在 SQLite 中维护资源、练习、伙伴、会话、课程、生成记录和设置

LearningAiService
├── testConnection(profileId)
├── streamConversation(session, partner, text)
├── generateStructuredResource(request)
└── 基于既有 OpenAI-compatible provider，校验 JSON 并保存失败状态

TTSProvider
├── listVoices(locale)
├── synthesize(text, voice, options)
├── stop()
└── 使用设备合法能力或用户配置的公开服务；TTS 缓存键为 text+voice+rate+locale

STTProvider
├── startRecording()
├── stopRecording()
├── transcribe(recording)
└── 暂无 provider / 权限拒绝时返回类型化错误，绝不制造转写结果

PracticeService
├── selectSentence()
├── playOriginal()
├── startRecording()
├── stopRecording()
├── playRecording()
└── updateProgress()
```

## 关键状态机

| 流程         | 状态                                                     | 异常恢复                                                 |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| 原音播放     | idle → playing → paused/ended                            | audio unavailable → error → retry                        |
| 跟读录音     | idle → requestingPermission → recording → saving → ready | denied/noDevice/failed → error → retry                   |
| 对话流式回复 | composing → sending → streaming → complete               | timeout/cancel/failure → incomplete → retry              |
| TTS          | idle → pending → ready → playing                         | cancelled/failed → failed → regenerate                   |
| 资源生成     | editing → generating → validating → preview → saved      | malformed JSON / provider failure → error → revise/retry |
| 课程进度     | locked → available → inProgress → completed              | 完成后解锁下一课；离开后保存 lastOpenedAt                |

## MVP 实现边界

第一版不会伪造 STT、音高评分或私人 TTS 服务。跟读会使用真实录音权限、设备录音和真实本地音频播放；若当前原生依赖或用户的外部服务尚未配置，UI 显示可恢复的未配置/失败状态。TTS 支持本地可配置的声音抽象和缓存；API TTS 需要用户显式配置兼容端点后才发起网络请求。LLM 对话和结构化生成只能经用户已经保存并选择的 OpenAI-compatible profile 执行。
