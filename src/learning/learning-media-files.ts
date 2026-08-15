import * as FileSystem from "expo-file-system/legacy";

const VIDEO_FILE_PATTERN = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3g2)$/iu;
const AUDIO_FILE_PATTERN = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/iu;

function extensionFor(name: string, mimeType: string | null | undefined): string {
  const fromName = name.match(/\.([a-z0-9]{1,8})$/iu)?.[1];
  if (fromName) return fromName.toLowerCase();
  const mime = mimeType?.toLowerCase() ?? "";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("matroska")) return "mkv";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

function safeStem(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/u, "")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 48) || "media"
  );
}

export function isLocalVideoAsset(name: string, mimeType?: string | null): boolean {
  return Boolean(mimeType?.toLowerCase().startsWith("video/") || VIDEO_FILE_PATTERN.test(name));
}

export function isLocalAudioAsset(name: string, mimeType?: string | null): boolean {
  return Boolean(mimeType?.toLowerCase().startsWith("audio/") || AUDIO_FILE_PATTERN.test(name));
}

export async function persistLearningMedia(
  input: Readonly<{ uri: string; name: string; mimeType?: string | null }>,
): Promise<string> {
  const sourceUri = input.uri.trim();
  if (!sourceUri) throw new Error("没有读取到所选媒体文件，请重新选择。");
  if (FileSystem.documentDirectory === null)
    throw new Error("应用存储目录暂不可用，请重启应用后重试。");

  const extension = extensionFor(input.name, input.mimeType);
  const directoryUri = `${FileSystem.documentDirectory}learning-media/`;
  const targetUri = `${directoryUri}${Date.now()}-${safeStem(input.name)}.${extension}`;

  try {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
    // legacy copyAsync can resolve Android content:// provider streams and iOS cache URIs,
    // unlike the synchronous File API which only reliably accepts local file:// paths.
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
    const result = await FileSystem.getInfoAsync(targetUri);
    if (
      !result.exists ||
      result.isDirectory ||
      (typeof result.size === "number" && result.size <= 0)
    ) {
      throw new Error("复制后的媒体文件为空或不可用。");
    }
    return targetUri;
  } catch (reason) {
    const details = reason instanceof Error ? reason.message : "未知系统错误";
    throw new Error(
      `无法保存所选媒体。请确认文件仍在本机、未被云盘占位且格式受设备支持后重试。（${details}）`,
    );
  }
}

export function isAppManagedLearningMedia(uri: string | undefined): boolean {
  return Boolean(uri && uri.includes("/learning-media/"));
}
