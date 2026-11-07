import type { AppServices } from "../app/app-services";
import type { AiProviderMessage } from "../ai/provider";
import type { AiProviderProfile } from "../ai/provider-profile";
import { pickDefaultAiProviderProfile } from "../ai/provider-profile-manager";

type LearningProviderServices = Readonly<{
  aiProviderProfiles: Pick<AppServices["aiProviderProfiles"], "list">;
  settingsStore: Pick<AppServices["settingsStore"], "load">;
  aiSecretStore: Pick<AppServices["aiSecretStore"], "get">;
}>;

export type ResolvedLearningProvider = Readonly<{
  profile: AiProviderProfile;
  apiKey: string;
}>;

export async function resolveLearningProvider(
  services: LearningProviderServices,
): Promise<ResolvedLearningProvider> {
  const [summaries, settings] = await Promise.all([
    services.aiProviderProfiles.list(),
    services.settingsStore.load(),
  ]);
  const profile = pickDefaultAiProviderProfile(
    summaries,
    settings.ok ? settings.value.ai.activeProviderProfileId : null,
  );
  if (!profile) throw new Error("请先在 Agent 的「模型设置」中添加模型和 API 密钥。");
  const apiKey = await services.aiSecretStore.get(profile.id);
  if (!apiKey) throw new Error("模型密钥已变更，请重试或前往 Agent 检查模型设置。");
  return Object.freeze({ profile, apiKey });
}

export async function collectLearningResponse(
  options: Readonly<{
    services: LearningProviderServices & Pick<AppServices, "aiProviders">;
    messages: readonly AiProviderMessage[];
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
  }>,
): Promise<Readonly<{ text: string; providerProfileId: AiProviderProfile["id"] }>> {
  const selected = await resolveLearningProvider(options.services);
  let response = "";
  for await (const event of options.services.aiProviders.get(selected.profile.adapter).stream({
    profile: selected.profile,
    apiKey: selected.apiKey,
    request: Object.freeze({ messages: options.messages }),
    ...(options.signal ? { signal: options.signal } : {}),
  })) {
    if (event.type === "text-delta") {
      response += event.text;
      options.onDelta?.(event.text);
    }
  }
  if (!response.trim()) throw new Error("The AI engine returned an empty response.");
  return Object.freeze({ text: response, providerProfileId: selected.profile.id });
}

export function parseGeneratedResource(raw: string): Readonly<{
  title: string;
  description: string;
  language: string;
  content: string;
  sentences: readonly Readonly<{ text: string; translation: string | null }>[];
}> {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object")
    throw new Error("The AI response was not a JSON object.");
  const value = parsed as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const language = typeof value.language === "string" ? value.language.trim() : "";
  const content = typeof value.content === "string" ? value.content.trim() : "";
  const inputSentences = Array.isArray(value.sentences) ? value.sentences : [];
  const sentences = inputSentences
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
      const translation =
        typeof candidate.translation === "string" ? candidate.translation.trim() : null;
      return text ? Object.freeze({ text, translation: translation || null }) : null;
    })
    .filter(
      (item): item is Readonly<{ text: string; translation: string | null }> => item !== null,
    );
  if (!title || !description || !language || !content || sentences.length === 0) {
    throw new Error(
      "The generated resource is missing required title, description, language, content, or sentences.",
    );
  }
  return Object.freeze({
    title,
    description,
    language,
    content,
    sentences: Object.freeze(sentences),
  });
}
