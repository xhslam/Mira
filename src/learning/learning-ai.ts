import type { AppServices } from "../app/app-services";
import type { AiProviderMessage } from "../ai/provider";
import type { AiProviderProfile } from "../ai/provider-profile";

export type ResolvedLearningProvider = Readonly<{
  profile: AiProviderProfile;
  apiKey: string;
}>;

export async function resolveLearningProvider(
  services: AppServices,
  providerProfileId: string | null,
): Promise<ResolvedLearningProvider> {
  if (!providerProfileId) {
    throw new Error("Choose an AI engine in Learning Settings before starting this action.");
  }
  const profile = await services.aiStore.getProviderProfile(
    providerProfileId as AiProviderProfile["id"],
  );
  if (!profile)
    throw new Error(
      "The selected AI engine no longer exists. Choose another engine in Learning Settings.",
    );
  const apiKey = await services.aiSecretStore.get(profile.id);
  if (!apiKey) throw new Error("The selected AI engine does not have a saved API key.");
  return Object.freeze({ profile, apiKey });
}

export async function collectLearningResponse(
  options: Readonly<{
    services: AppServices;
    providerProfileId: string | null;
    messages: readonly AiProviderMessage[];
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
  }>,
): Promise<string> {
  const selected = await resolveLearningProvider(options.services, options.providerProfileId);
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
  return response;
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
