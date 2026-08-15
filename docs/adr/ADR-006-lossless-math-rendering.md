# ADR-006：无损数学公式渲染管线

**最后更新：** 2026-08-15
**状态：** Accepted

## 背景

Inkstone 同时承担 Markdown 编辑和富文本阅读。真实笔记可能包含标准 LaTeX、不同 Markdown
定界符、大模型额外转义和部分格式污染。直接用正则替换源文件虽然能让部分公式显示，却会破坏
Markdown 作为唯一内容真源的原则，也可能改变用户有意输入的转义。

Tiptap 官方数学节点提供 KaTeX 渲染能力，但 Inkstone 还需要原始 Markdown 定界符无损往返、
多种模型输出兼容和离线 WebView 资产控制，因此不能把源文本交给不可逆迁移。

## 决策

采用四段式管线：

```text
原始 Markdown
  -> 有界、精确配对的自定义 tokenizer
  -> 保存 raw/source 的原子 Tiptap 数学节点
  -> 仅渲染副本的保守归一化
  -> 受限 KaTeX HTML + MathML / 安全文本降级
```

必须遵守：

- `raw` 是序列化真源；渲染归一化结果永不进入保存路径。
- tokenizer 必须线性且有长度上限，不能恢复为跨行非贪婪正则。
- 多行结束定界符独占一行，反斜杠层数精确配对。
- 模糊语义保持原文，不通过激进“修复”猜测用户意图。
- KaTeX 保持 `trust: false`，限制尺寸和宏展开，并输出 MathML。
- release 必须离线携带 KaTeX 字体。
- 无法解析时显示安全原文并暴露稳定错误码，不能隐藏失败或注入原始 HTML。

## 结果

优点：

- 兼容标准 Markdown 和常见大模型输出，同时保持文档逐字可恢复。
- 富文本、阅读和源码模式共享同一内容，不会因切换模式改写笔记。
- 解析时间和 KaTeX 资源消耗有明确上限。
- DOM 和真机脚本能区分解析失败、过长与不支持命令。

代价：

- 需要维护一套小型 Markdown 数学 tokenizer，而不是完全委托给通用扩展。
- 兼容策略必须以新增失败样例和回归测试演进，不能随意扩大自动归一化范围。

## 证据

- [`math-markdown.ts`](../../src/editor-kernel/math-markdown.ts)
- [`math-markdown.test.ts`](../../tests/unit/editor-kernel/math-markdown.test.ts)
- [`INC-2026-08-15`](../incidents/INC-2026-08-15-markdown-math-rendering.md)
