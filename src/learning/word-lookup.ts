export type DictionaryDefinition = Readonly<{
  partOfSpeech: string | null;
  definition: string;
  example: string | null;
}>;

export type WordLookup = Readonly<{
  word: string;
  phonetic: string | null;
  definitions: readonly DictionaryDefinition[];
  source: "dictionaryapi" | "local" | "phrase";
}>;

const LOCAL_GLOSSARY: Readonly<Record<string, Readonly<{ phonetic: string; definition: string }>>> =
  Object.freeze({
    acquire: Object.freeze({ phonetic: "/əˈkwaɪər/", definition: "获得；习得。" }),
    achieve: Object.freeze({ phonetic: "/əˈtʃiːv/", definition: "实现；达到。" }),
    approach: Object.freeze({ phonetic: "/əˈprəʊtʃ/", definition: "方法；接近。" }),
    context: Object.freeze({ phonetic: "/ˈkɒntekst/", definition: "上下文；语境。" }),
    effective: Object.freeze({ phonetic: "/ɪˈfektɪv/", definition: "有效的。" }),
    encounter: Object.freeze({ phonetic: "/ɪnˈkaʊntər/", definition: "遇到；遭遇。" }),
    fluency: Object.freeze({ phonetic: "/ˈfluːənsi/", definition: "流利度。" }),
    improve: Object.freeze({ phonetic: "/ɪmˈpruːv/", definition: "改善；提高。" }),
    language: Object.freeze({ phonetic: "/ˈlæŋɡwɪdʒ/", definition: "语言。" }),
    phrase: Object.freeze({ phonetic: "/freɪz/", definition: "短语；措辞。" }),
    practice: Object.freeze({ phonetic: "/ˈpræktɪs/", definition: "练习；实践。" }),
    sentence: Object.freeze({ phonetic: "/ˈsentəns/", definition: "句子。" }),
    similar: Object.freeze({ phonetic: "/ˈsɪmɪlər/", definition: "相似的。" }),
  });

const LOCAL_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  "these days": "近来；目前。用于描述当前这一段时期的情况。",
  "seltzer with lime": "加青柠的苏打水；seltzer 指无糖气泡水。",
  "at the end of the day": "归根结底；最终。用于总结或强调主要结论。",
  "make a difference": "产生影响；带来改变。",
});

export async function lookupPhrase(input: string): Promise<WordLookup> {
  const phrase = input.trim().replace(/\s+/gu, " ").toLowerCase();
  if (!/^[a-z][a-z' -]*$/iu.test(phrase) || phrase.split(" ").length < 2)
    throw new Error("请选择一个由英文单词组成的短语。 ");
  return Object.freeze({
    word: phrase,
    phonetic: null,
    definitions: Object.freeze([
      Object.freeze({
        partOfSpeech: "phrase",
        definition:
          LOCAL_PHRASES[phrase] ?? "这是一个重点短语。可结合当前句译文和语境说明理解其整体含义。",
        example: null,
      }),
    ]),
    source: "phrase",
  });
}

export async function lookupWord(input: string): Promise<WordLookup> {
  const word = input.trim().toLowerCase();
  if (!/^[a-z][a-z'-]*$/iu.test(word)) throw new Error("请选择一个英文单词。 ");
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (response.ok) {
      const payload = (await response.json()) as unknown;
      const parsed = parseDictionaryPayload(word, payload);
      if (parsed) return parsed;
    }
  } catch {
    // 网络不可用时退回本地释义；不把网络波动暴露为学习流程的死路。
  }
  const local = LOCAL_GLOSSARY[word];
  return Object.freeze({
    word,
    phonetic: local?.phonetic ?? null,
    definitions: Object.freeze([
      Object.freeze({
        partOfSpeech: null,
        definition: local?.definition ?? "暂未取得在线释义。可先收藏该词，稍后联网查看。",
        example: null,
      }),
    ]),
    source: "local",
  });
}

function parseDictionaryPayload(word: string, payload: unknown): WordLookup | null {
  if (!Array.isArray(payload) || !payload[0] || typeof payload[0] !== "object") return null;
  const entry = payload[0] as Record<string, unknown>;
  const phonetic = typeof entry.phonetic === "string" ? entry.phonetic : null;
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const definitions = meanings
    .flatMap((meaning) => {
      if (!meaning || typeof meaning !== "object") return [];
      const record = meaning as Record<string, unknown>;
      const partOfSpeech = typeof record.partOfSpeech === "string" ? record.partOfSpeech : null;
      const entries = Array.isArray(record.definitions) ? record.definitions : [];
      return entries.slice(0, 2).flatMap((definition) => {
        if (!definition || typeof definition !== "object") return [];
        const value = definition as Record<string, unknown>;
        const text = typeof value.definition === "string" ? value.definition : "";
        if (!text) return [];
        return [
          Object.freeze({
            partOfSpeech,
            definition: text,
            example: typeof value.example === "string" ? value.example : null,
          }),
        ];
      });
    })
    .slice(0, 4);
  if (!definitions.length) return null;
  return Object.freeze({
    word,
    phonetic,
    definitions: Object.freeze(definitions),
    source: "dictionaryapi",
  });
}
