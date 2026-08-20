import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";

const TTS_SECRET_KEY = "inkstone.learning.tts-api-key.v1";

export async function saveLearningTtsKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(TTS_SECRET_KEY);
    return;
  }
  await SecureStore.setItemAsync(TTS_SECRET_KEY, trimmed, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function hasLearningTtsKey(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(TTS_SECRET_KEY));
}

export async function synthesizeOpenAiCompatibleSpeech(
  options: Readonly<{
    baseUrl: string;
    text: string;
    voice: string;
    rate: number;
  }>,
): Promise<string> {
  const apiKey = await SecureStore.getItemAsync(TTS_SECRET_KEY);
  if (!apiKey) throw new Error("Add a TTS API key in Learning Settings before generating speech.");
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: Object.freeze({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      model: "tts-1",
      input: options.text,
      voice: options.voice,
      speed: options.rate,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `TTS request failed (${response.status})${body ? `: ${body.slice(0, 160)}` : ""}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("The TTS provider returned an empty audio file.");
  const name = `learning-tts-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`;
  const file = new File(Paths.document, "learning-audio", name);
  file.create({ intermediates: true, overwrite: false });
  file.write(bytes);
  return file.uri;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("TTS Base URL must be a secure HTTPS API base URL.");
  }
  return parsed.toString().replace(/\/$/u, "");
}
