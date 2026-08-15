import { findMarkdownBlockRange } from "../editor-kernel/editor-kernel-state";

export type VmarkGenieScope = "selection" | "block" | "document";
export type VmarkGenieCategory = "editing" | "creative" | "structure" | "tools";
export type VmarkGenieAction = "replace" | "insert";

export type VmarkGenie = Readonly<{
  id: string;
  name: string;
  description: string;
  scope: VmarkGenieScope;
  category: VmarkGenieCategory;
  action: VmarkGenieAction;
  context: 0;
  template: string;
  sourceSha256: string;
}>;

function prompt(...lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

function genie(input: Omit<VmarkGenie, "context">): VmarkGenie {
  return Object.freeze({ ...input, context: 0 });
}

export const VMARK_GENIES: readonly VmarkGenie[] = Object.freeze([
  genie({
    id: "polish",
    name: "Polish",
    description: "Improve clarity and flow",
    scope: "selection",
    category: "editing",
    action: "replace",
    sourceSha256: "1e4ebdf2b5fe95eef596e74b6aede71491dfbfdf8200c63a990f1a707a2a2857",
    template: prompt(
      "You are an expert editor. Improve the clarity, flow, and conciseness",
      "of the following text while preserving the author's voice and intent.",
      "",
      "Return only the improved text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "condense",
    name: "Condense",
    description: "Make text more concise",
    scope: "selection",
    category: "editing",
    action: "replace",
    sourceSha256: "f3abefa7bc194c1b700b9facb57f3e419bb019e11c5e14e03f78a90ce1c01cbd",
    template: prompt(
      "Shorten the following text while preserving all key information.",
      "Remove redundancy, tighten sentences, and cut unnecessary words.",
      "",
      "Return only the shortened text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "fix-grammar",
    name: "Fix Grammar",
    description: "Fix grammar and spelling",
    scope: "selection",
    category: "editing",
    action: "replace",
    sourceSha256: "ac1d817ad22b6cac134842e2d24bd97ae8ea95f9021047ac1e724ac2d28b0d99",
    template: prompt(
      "Fix all grammar, spelling, and punctuation errors in the following text.",
      "Do not change the meaning, style, or tone.",
      "",
      "Return only the corrected text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "simplify",
    name: "Simplify",
    description: "Use simpler language",
    scope: "selection",
    category: "editing",
    action: "replace",
    sourceSha256: "f47387d2d3636c993cc94cdcf8320e4ed77406325f70312e78339e1aed0b9a8b",
    template: prompt(
      "Rewrite the following text using simpler words and shorter sentences.",
      "Make it accessible to a broader audience while keeping the original meaning.",
      "",
      "Return only the simplified text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "expand",
    name: "Expand",
    description: "Develop idea into fuller prose",
    scope: "selection",
    category: "creative",
    action: "replace",
    sourceSha256: "879863864b4012989229a19b4c9ac8c24babbf58923e8f3ec5b15a2a7f26fb52",
    template: prompt(
      "Expand the following brief text into fuller, well-developed prose.",
      "Add supporting details, examples, or explanations while keeping",
      "the author's tone and style.",
      "",
      "Return only the expanded text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "rephrase",
    name: "Rephrase",
    description: "Say the same thing differently",
    scope: "selection",
    category: "creative",
    action: "replace",
    sourceSha256: "b256c0964f7e4e2423a10024fe3e810da78616bdb6072cc0f6e316909d6f894e",
    template: prompt(
      "Rephrase the following text using different words and sentence structures.",
      "Preserve the original meaning and tone exactly.",
      "",
      "Return only the rephrased text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "vivid",
    name: "Vivid",
    description: "Add sensory details and imagery",
    scope: "selection",
    category: "creative",
    action: "replace",
    sourceSha256: "c12c8e05cbff15d591e0d54e1f2edbaf8062e06f6af9751d76cd6e26bb801d2c",
    template: prompt(
      "Enrich the following text with vivid sensory details, concrete imagery,",
      "and stronger word choices. Make the writing come alive while preserving",
      "the original meaning and structure.",
      "",
      "Return only the enriched text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "continue",
    name: "Continue",
    description: "Continue writing from here",
    scope: "block",
    category: "creative",
    action: "insert",
    sourceSha256: "bf81ebe037713bd58123304124d295c95e9713659e0f2d069dcf9a9ec84b218c",
    template: prompt(
      "Continue writing naturally from where the following text leaves off.",
      "Match the author's voice, style, and tone. Write 2-3 paragraphs.",
      "",
      "Do not repeat or summarize the existing text — just continue it.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "summarize",
    name: "Summarize",
    description: "Summarize the document",
    scope: "document",
    category: "structure",
    action: "replace",
    sourceSha256: "a70320d5422053522e9a963bac84a3d71f49765ce76b596fd17b501acad9a004",
    template: prompt(
      "Summarize the following document in a concise paragraph.",
      "Capture the main points, key arguments, and conclusions.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "outline",
    name: "Outline",
    description: "Generate an outline",
    scope: "document",
    category: "structure",
    action: "replace",
    sourceSha256: "8401a6d47b61d0b17651f79dfd21a4d4eaec33f178ca50629486c242489ef2d5",
    template: prompt(
      "Generate a clear, hierarchical outline of the following document.",
      "Use markdown heading levels (##, ###) and bullet points.",
      "Capture the main sections, key arguments, and supporting points.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "headline",
    name: "Headline",
    description: "Suggest title options",
    scope: "document",
    category: "structure",
    action: "replace",
    sourceSha256: "9ad8221619e9323058e6f470acf42c19ca0faf992dd7996f451216a7ae42dafa",
    template: prompt(
      "Read the following document and suggest 5 compelling title options.",
      "Each title should be concise, clear, and capture the essence of the content.",
      "",
      "Format as a numbered list. No other commentary.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "translate",
    name: "Translate",
    description: "Translate to English",
    scope: "selection",
    category: "tools",
    action: "replace",
    sourceSha256: "91c640779c34975b8c4f1fd4ba0756bb05d542c579163765ce35194f63a1c678",
    template: prompt(
      "Translate the following text into English.",
      "Preserve the original meaning, tone, and formatting.",
      "",
      "Return only the translated text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
  genie({
    id: "rewrite-in-english",
    name: "Rewrite in English",
    description: "Rewrite text in English",
    scope: "selection",
    category: "tools",
    action: "replace",
    sourceSha256: "c07d86e72256039cd3ec3b42cc6dbe0640fef3db501fad551c73f8b956ceb654",
    template: prompt(
      "Rewrite the following text in clear, natural English.",
      "If the text is already in English, improve its fluency and readability.",
      "If the text is in another language, rewrite it in English while preserving",
      "the original meaning, tone, and structure.",
      "",
      "Return only the rewritten text — no explanations.",
      "",
      "{{content}}",
    ),
  }),
]);

export const VMARK_GENIE_ZH_CN: Readonly<
  Record<string, Readonly<{ name: string; description: string }>>
> = Object.freeze({
  polish: Object.freeze({ name: "润色", description: "改善清晰度与行文流畅度" }),
  condense: Object.freeze({ name: "精简", description: "保留要点并压缩文字" }),
  "fix-grammar": Object.freeze({ name: "语法修正", description: "修正语法、拼写和标点" }),
  simplify: Object.freeze({ name: "简化", description: "使用更简单易懂的语言" }),
  expand: Object.freeze({ name: "扩写", description: "将想法发展为更完整的文字" }),
  rephrase: Object.freeze({ name: "改写", description: "用不同表达保留原意" }),
  vivid: Object.freeze({ name: "增强描写", description: "加入感官细节与具体意象" }),
  continue: Object.freeze({ name: "续写", description: "从当前位置自然续写" }),
  summarize: Object.freeze({ name: "总结", description: "概括文档要点与结论" }),
  outline: Object.freeze({ name: "大纲", description: "生成层级化 Markdown 大纲" }),
  headline: Object.freeze({ name: "标题", description: "给出五个标题选项" }),
  translate: Object.freeze({ name: "翻译", description: "翻译为英文并保留格式" }),
  "rewrite-in-english": Object.freeze({ name: "英文改写", description: "改写为自然流畅的英文" }),
});

export type GenieTarget = Readonly<{ from: number; to: number; content: string }>;

export function captureGenieTarget(
  markdown: string,
  selection: Readonly<{ anchor: number; head: number }>,
  scope: VmarkGenieScope,
): GenieTarget {
  if (scope === "document")
    return Object.freeze({ from: 0, to: markdown.length, content: markdown });
  const from = Math.max(0, Math.min(selection.anchor, selection.head, markdown.length));
  const to = Math.max(from, Math.min(Math.max(selection.anchor, selection.head), markdown.length));
  if (scope === "selection" && to > from)
    return Object.freeze({ from, to, content: markdown.slice(from, to) });
  const block = findMarkdownBlockRange(markdown, selection.head);
  return Object.freeze({ from: block.from, to: block.to, content: block.markdown });
}

export function renderVmarkGeniePrompt(genie: VmarkGenie, content: string): string {
  return genie.template.replace("{{content}}", content);
}

export function applyVmarkGenieResult(
  markdown: string,
  target: GenieTarget,
  action: VmarkGenieAction,
  output: string,
): string {
  if (action === "insert") {
    const separator = markdown.slice(target.to).startsWith("\n") ? "\n" : "\n\n";
    return `${markdown.slice(0, target.to)}${separator}${output}${markdown.slice(target.to)}`;
  }
  return `${markdown.slice(0, target.from)}${output}${markdown.slice(target.to)}`;
}

export function serializeVmarkGenieSource(genie: VmarkGenie): string {
  const action = genie.action === "insert" ? "action: insert\n" : "";
  return `---\ndescription: ${genie.description}\nscope: ${genie.scope}\ncategory: ${genie.category}\n${action}---\n\n${genie.template}`;
}
