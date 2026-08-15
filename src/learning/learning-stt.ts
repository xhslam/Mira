import * as SecureStore from "expo-secure-store";
import { File } from "expo-file-system";
import { splitLearningSentences } from "./enjoy-player-domain";

const STT_SECRET_KEY = "inkstone.learning.stt-api-key.v1";

export type TranscribedCue = Readonly<{
  index: number;
  startMs: number | null;
  endMs: number | null;
  text: string;
}>;

export async function saveLearningSttKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(STT_SECRET_KEY);
    return;
  }
  await SecureStore.setItemAsync(STT_SECRET_KEY, trimmed, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function hasLearningSttKey(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(STT_SECRET_KEY));
}

export async function transcribeOpenAiCompatibleMedia(
  options: Readonly<{
    baseUrl: string;
    mediaUri: string;
    language?: string;
    apiKey?: string;
  }>,
): Promise<readonly TranscribedCue[]> {
  const apiKey = options.apiKey ?? (await SecureStore.getItemAsync(STT_SECRET_KEY));
  if (!apiKey) throw new Error("请先在学习设置中保存转写服务密钥，再使用 AI 字幕。");
  const media = new File(options.mediaUri);
  if (!media.exists) throw new Error("找不到导入的媒体文件，无法转写。");
  const form = new FormData();
  form.append("file", media);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  if (options.language) form.append("language", options.language);
  const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `AI 字幕请求失败（${response.status}）${body ? `：${body.slice(0, 140)}` : ""}`,
    );
  }
  return parseTranscription(await response.json());
}

function parseTranscription(payload: unknown): readonly TranscribedCue[] {
  if (!payload || typeof payload !== "object") throw new Error("转写服务返回了无效结果。");
  const value = payload as Record<string, unknown>;
  const segments = Array.isArray(value.segments) ? value.segments : [];
  const cues = segments.flatMap((segment, index) => {
    if (!segment || typeof segment !== "object") return [];
    const record = segment as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) return [];
    const start =
      typeof record.start === "number" ? Math.max(0, Math.round(record.start * 1000)) : null;
    const end = typeof record.end === "number" ? Math.max(0, Math.round(record.end * 1000)) : null;
    return [Object.freeze({ index: index + 1, startMs: start, endMs: end, text })];
  });
  if (cues.length) return Object.freeze(cues);
  const text = typeof value.text === "string" ? value.text.trim() : "";
  const sentences = splitLearningSentences(text);
  if (!sentences.length) throw new Error("转写结果中没有可学习的英文句子。");
  return Object.freeze(
    sentences.map((sentence, index) =>
      Object.freeze({ index: index + 1, startMs: null, endMs: null, text: sentence }),
    ),
  );
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
    throw new Error("转写服务地址必须是安全的 HTTPS API 地址。");
  }
  return parsed.toString().replace(/\/$/u, "");
}
