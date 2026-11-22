export const SENTENCE_ROLES = [
  "subject",
  "predicate",
  "object",
  "attributive",
  "postmodifier",
  "adverbial",
  "predicative",
  "complement",
  "other",
] as const;
export type SentenceRole = (typeof SENTENCE_ROLES)[number];
export type SentenceComponent = Readonly<{ text: string; role: SentenceRole }>;

export const SENTENCE_ROLE_LABELS: Readonly<Record<SentenceRole, string>> = Object.freeze({
  subject: "主语",
  predicate: "谓语",
  object: "宾语",
  attributive: "定语",
  postmodifier: "后置定语",
  adverbial: "状语",
  predicative: "表语",
  complement: "补语",
  other: "其他",
});

// Distinct foreground colors, not colored cards. Unknown content stays neutral.
export const SENTENCE_ROLE_COLORS: Readonly<Record<SentenceRole, readonly [string, string]>> =
  Object.freeze({
    subject: ["#2563A6", "#8DBBFA"],
    predicate: ["#B44336", "#FF9D91"],
    object: ["#237657", "#81D6AF"],
    attributive: ["#77529E", "#C5A4EB"],
    postmodifier: ["#9E507A", "#EEA5CD"],
    adverbial: ["#93651D", "#EBC47E"],
    predicative: ["#087B89", "#7CD4DF"],
    complement: ["#85583D", "#DBAF91"],
    other: ["#525866", "#B6BECC"],
  });

/** Reject a whole annotation if it changes the original or uses unrecognized roles. */
export function parseSentenceComponents(
  value: unknown,
  source?: string,
): readonly SentenceComponent[] {
  if (!Array.isArray(value) || value.length > 128) return Object.freeze([]);
  const components: SentenceComponent[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.text !== "string" ||
      !item.text ||
      item.text.length > 8_000 ||
      !SENTENCE_ROLES.includes(item.role)
    ) {
      return Object.freeze([]);
    }
    components.push(Object.freeze({ text: item.text, role: item.role as SentenceRole }));
  }
  if (source !== undefined && components.map((item) => item.text).join("") !== source)
    return Object.freeze([]);
  return Object.freeze(components);
}
