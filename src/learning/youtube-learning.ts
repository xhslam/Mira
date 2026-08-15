export type YouTubeCaptionCue = Readonly<{
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}>;

export function youtubeVideoId(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    const candidate =
      host === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : host.endsWith("youtube.com")
          ? (url.searchParams.get("v") ??
            url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/u)?.[1])
          : null;
    return candidate && /^[\w-]{6,}$/u.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(sourceUrl: string): string | null {
  const videoId = youtubeVideoId(sourceUrl);
  return videoId
    ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&playsinline=1&cc_load_policy=1&rel=0`
    : null;
}

export function parseYoutubeVtt(vtt: string): readonly YouTubeCaptionCue[] {
  const blocks = vtt
    .replace(/^\uFEFF?WEBVTT[^\n]*\n+/iu, "")
    .trim()
    .split(/\n\s*\n/gu);
  const cues: YouTubeCaptionCue[] = [];
  for (const block of blocks) {
    const lines = block
      .split(/\n/gu)
      .map((line) => line.trim())
      .filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex]!.split("-->");
    const startMs = parseVttTimestamp(timing[0] ?? "");
    const endMs = parseVttTimestamp((timing[1] ?? "").trim().split(/\s+/u)[0] ?? "");
    const text = decodeCaptionText(lines.slice(timingIndex + 1).join(" "));
    if (startMs === null || endMs === null || endMs <= startMs || !text) continue;
    const previous = cues[cues.length - 1];
    if (previous?.text === text && startMs - previous.endMs < 120) {
      cues[cues.length - 1] = Object.freeze({ ...previous, endMs });
      continue;
    }
    cues.push(Object.freeze({ index: cues.length + 1, startMs, endMs, text }));
  }
  return Object.freeze(cues);
}

export async function fetchYoutubeCaptions(
  sourceUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly YouTubeCaptionCue[]> {
  const videoId = youtubeVideoId(sourceUrl);
  if (!videoId) throw new Error("不是可解析的 YouTube 视频链接。 ");
  const baseUrl = "https://www.youtube.com/api/timedtext";
  for (const suffix of ["", "&kind=asr"]) {
    const response = await fetchImpl(
      `${baseUrl}?v=${encodeURIComponent(videoId)}&lang=en&fmt=vtt${suffix}`,
      { headers: { Accept: "text/vtt,text/plain" } },
    );
    if (!response.ok) continue;
    const cues = parseYoutubeVtt(await response.text());
    if (cues.length) return cues;
  }
  throw new Error("此视频没有可公开获取的英文字幕；请选择带英文字幕的视频，或改用本地视频导入。 ");
}

function parseVttTimestamp(value: string): number | null {
  const matched = value.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2}[.,]\d{3})$/u);
  if (!matched) return null;
  const hours = Number(matched[1] ?? 0);
  const minutes = Number(matched[2]);
  const seconds = Number((matched[3] ?? "").replace(",", "."));
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return Math.max(0, Math.round((hours * 3600 + minutes * 60 + seconds) * 1_000));
}

function decodeCaptionText(value: string): string {
  return value
    .replace(/<[^>]+>/gu, "")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/\s+/gu, " ")
    .trim();
}
