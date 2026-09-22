# INC-2026-09-22：学习译文在资料页与逐句页不一致

## 用户可见症状

- 资料卡显示句子已经生成译文，逐句学习仍提示“这句还没有译文”。
- 再次触发逐句翻译会重复调用 AI，而不是复用已经保存的结果。

## 已验证根因

学习快照同时保留 `resources[].sentences` 和 `transcriptTracks[].sentences`。旧翻译流程只更新前者与翻译缓存；逐句页则优先读取当前字幕轨。存在字幕轨时，两份句子投影因此发生分叉。规范化存储写入又以字幕轨为准，旧译文还可能在下次载入时被旧轨道覆盖。

## 修复

- `applyLearningTranslations()` 同步更新资源句子、同资料的全部字幕轨与翻译缓存。
- `reconcileLearningTranslations()` 按句子 ID 和文本指纹复用任一投影或缓存中的已有译文；打开资料和逐句页时自动修复旧数据。
- `missingLearningTranslations()` 在协调已有数据后只返回真正缺失的句子。逐句页只请求缺失部分；全部存在时不调用 AI。
- 资料列表改为点按直接进入逐句学习，四宫格与裸露删除入口移除；右滑资料行后才显示下载和删除。

## 防回归证据

- `tests/unit/learning/learning-session.test.ts` 覆盖“资料已有译文、活动字幕轨为空”的原始矛盾，并验证打开资料后字幕轨自愈。
- 同一测试验证新生成译文同时进入资源、字幕轨和翻译缓存，随后缺失列表为空。
- `tests/unit/app/learning-library-layout-regression.test.ts` 锁定直接进入、右滑阈值、下载/删除动作以及逐句页智能翻译入口。
- 定向反馈循环：
  `npx vitest run tests/unit/learning/learning-session.test.ts tests/unit/app/learning-library-layout-regression.test.ts`。

## 长期不变量

1. 已存在的译文必须优先复用，不得因展示投影不同而再次请求 AI。
2. 资源句子、字幕轨和翻译缓存中的同一句译文必须在一次不可变快照更新中保持一致。
3. 资料列表的主要动作是进入学习；破坏性操作只在明确手势后出现，删除仍需二次确认。
