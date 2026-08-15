# INC-2026-08-15：Markdown 数学公式渲染失败

**最后更新：** 2026-08-15
**状态：** 已修复、已通过自动化与真机 release 验证
**影响范围：** Markdown 富文本/阅读模式中的行内与块级 LaTeX
**验证设备：** HONOR REP-AN00，Android API 36 目标包 `app.inkstone.markdown`

## 用户影响

大模型生成的笔记含数学公式时，部分公式显示为红色 LaTeX 源码或被截成多个错误块，无法达到现代大模型平台的富文本阅读效果。长公式、错误公式和普通货币文本也缺少完整的误判与资源边界。

真机故障样例包含：

```markdown
\[
\\boxed{\\mathcal L\[te^{-t}\]=\\frac{1}{(s+1)^2}}
\]
```

以及公式块中混入的 Markdown 行级标记：

```markdown
\[
\\mathcal L\[t\]
=============

# \\frac{1!}{s^2}

\\frac1{s^2}
\]
```

## 复现证据

修复前通过 WebView CDP 检查真实 DOM：

- 共识别 26 个公式节点。
- 6 个节点的 `data-math-error="true"`。
- 典型错误节点没有 `.katex`/`.katex-display`，只保留红色源码。
- 单独启动旧调试包时还会因 Metro 不可达显示 “Unable to load script”。

## 根因

这是解析、归一化与交付三层共同造成的问题：

1. 块公式使用非贪婪正则匹配 1-3 个反斜杠的 `\]`。外层和内部括号没有严格配对，内部 `\mathcal L\[t\]` 的右括号会提前结束整个公式。
2. 大模型/JSON 输出存在额外反斜杠层。旧归一化只处理少数组合，无法安全区分 TeX 命令、矩阵换行和冗余数学定界符。
3. `\[...\]` 被嵌入已处于数学模式的 `\boxed{...}` 中时，KaTeX 会把它视为非法嵌套定界符。
4. 公式块中偶尔混入 Setext 分隔线或 Markdown 标题前缀，这些字符不是合法 TeX。
5. 渲染缺少显式长度上限、`maxSize`、错误分类以及完整的移动端横向溢出策略。
6. 真机安装的是依赖 Metro 的调试包，不能作为离线交付物验收；KaTeX WOFF2 字体也必须进入最终 DOM 资产目录。

## 修复设计

### 解析

- 新增 `src/editor-kernel/math-markdown.ts`，使用有界线性扫描替代跨行正则。
- 支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]` 的同行和多行形式。
- 多行公式的结束定界符必须独占一行；转义层数必须精确配对。
- 单美元行内公式遵循空白/数字边界，避免把 `$5 and $10` 当作公式。
- 扫描和渲染上限为 16,384 个字符，避免恶意或异常输入拖垮 WebView。

### 无损归一化

- Tiptap 节点继续保存原始 `raw` Markdown，序列化时逐字返回。
- 仅传给 KaTeX 的副本会折叠可确认的额外命令转义、移除成对的内部数学定界符，并清理整行 Markdown 标记。
- 保留 `\\` 矩阵换行及其 `\\[6pt]` 可选间距。
- 模式切换前后以设备文件 SHA-256 验证没有改写笔记。

### 安全与降级

- KaTeX 使用 `output: "htmlAndMathml"`、`trust: false`、`throwOnError: true`、
  `maxExpand: 1000`、`maxSize: 20` 和 `minRuleThickness: 0.04`。
- 错误节点写入 `data-math-error-code`：`empty-formula`、`formula-too-long`、
  `unsupported-command` 或 `invalid-latex`。
- 真正无法解析的公式安全显示原始文本，不注入 HTML，也不伪造错误结果。
- 行内与块级公式在移动端提供有界横向滚动。

### 离线发布

- release 构建复制 KaTeX WOFF2 字体到 DOM CSS 的相对字体目录。
- 构建必须验证唯一 HTML、JavaScript、source map、原生 bundle 和最终 APK。
- 覆盖安装前比较新旧 APK 签名，签名一致后使用 `adb install -r` 保留应用数据。
- 移除 `adb reverse tcp:8081` 后冷启动 release 包。

## 代码与测试映射

| 文件                                                 | 责任                                                  |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `src/editor-kernel/math-markdown.ts`                 | 有界 tokenizer、定界符配对、仅渲染副本归一化          |
| `src/editor-kernel/extended-markdown.ts`             | Tiptap 数学节点、KaTeX 安全选项、错误分类             |
| `src/editor-kernel/editor-kernel.dom.tsx`            | 公式阅读样式和横向溢出                                |
| `tests/unit/editor-kernel/math-markdown.test.ts`     | 货币误判、嵌套定界符、同行/多行、超长输入和归一化矩阵 |
| `tests/unit/editor-kernel/extended-markdown.test.ts` | Tiptap 无损往返与真实大模型公式渲染                   |
| `tests/unit/scripts/android-release-assets.test.ts`  | release 字体和 DOM 资产布局                           |
| `scripts/inspect-live-math-dom.mjs`                  | 真机公式数量、KaTeX、display、溢出和错误码审计        |

## 验证结果

- 全仓：107 个测试文件、608 项测试通过。
- 定向数学/release：3 个测试文件、28 项测试通过。
- Lint、严格 TypeScript、全仓 Prettier 通过。
- 真机富文本：26/26 公式包含 `.katex`，26/26 块公式包含 `.katex-display`，错误 0。
- 真机阅读模式：26 个公式，错误 0。
- 模式切换前后文档 SHA-256 完全一致。
- release APK 构建成功，KaTeX 书法体、分式、上标和方框在断开 Metro 后仍正确显示。
- release 包不含 `DEBUGGABLE` 标志。

## 防回归要求

以下任一情况都必须阻止发布：

- 删除或绕过 `math-markdown.test.ts` 的货币、嵌套定界符或长度上限用例。
- 在保存路径中调用公式归一化并改写原始 Markdown。
- 将 KaTeX `trust` 改为 `true`，或移除 `maxSize`/`maxExpand` 上限。
- release APK 未包含 KaTeX WOFF2 字体，或需要 Metro/CDN 才能显示公式。
- 混合转义真机样例存在任何 `data-math-error="true"`。
- 覆盖安装前签名不一致却通过卸载方式继续安装。

## 明确边界

本修复只容错数学节点内部可确认的模型转义/Markdown 污染。公式外部的 `\*\*`、`&gt;`
等仍按标准 Markdown 原义显示；不得为了“看起来像模型回答”而全局取消用户转义。若未来需要导入模型富文本，应在 AI/导入边界设计独立、可预览且需用户确认的规范化流程。
