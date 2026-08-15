import type { DiscoverFeedEntry, DiscoverSubscription } from "./learning-types";

export type ContentSourceProvider = Readonly<{
  id: "youtube" | "bilibili";
  label: string;
  canSubscribe(url: string): boolean;
  normalizeSubscription(
    url: string,
  ): Readonly<{ sourceId: string; sourceUrl: string; title: string }>;
  fetchFeed(subscription: DiscoverSubscription): Promise<readonly DiscoverFeedEntry[]>;
}>;

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function parseYoutube(url: string) {
  const trimmed = url.trim();
  const parsed = new URL(trimmed);
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/iu.test(parsed.hostname)) {
    throw new Error("请输入 YouTube 频道、@handle 或播放列表链接。");
  }
  const path = parsed.pathname.replace(/\/+$/u, "");
  const handle = path.match(/^\/@([\w.-]+)$/u)?.[1];
  const channel = path.match(/^\/channel\/([^/]+)$/u)?.[1];
  const playlist = parsed.searchParams.get("list");
  const sourceId = channel
    ? `channel:${channel}`
    : handle
      ? `handle:${handle}`
      : playlist
        ? `playlist:${playlist}`
        : "";
  if (!sourceId) throw new Error("该链接不是可订阅的 YouTube 频道、@handle 或播放列表。");
  return Object.freeze({
    sourceId,
    sourceUrl: parsed.toString(),
    title: handle ? `@${handle}` : (channel ?? `播放列表 ${playlist}`),
  });
}

const youtube: ContentSourceProvider = Object.freeze({
  id: "youtube",
  label: "YouTube",
  canSubscribe(url) {
    try {
      parseYoutube(url);
      return true;
    } catch {
      return false;
    }
  },
  normalizeSubscription: parseYoutube,
  async fetchFeed(subscription) {
    const key = subscription.sourceId.split(":", 2);
    const kind = key[0];
    const identifier = key[1];
    if (!identifier || !kind || !["channel", "handle", "playlist"].includes(kind))
      throw new Error("订阅来源无效，请重新添加。");
    const endpoint = `https://rsshub.app/youtube/${kind === "handle" ? "user" : kind}/${encodeURIComponent(kind === "handle" ? `@${identifier}` : identifier)}?format=json`;
    const response = await fetch(endpoint, {
      headers: { Accept: "application/feed+json, application/json" },
    });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "频道刷新过于频繁，请稍后再试。"
          : "暂时无法获取该频道内容，请稍后重试。",
      );
    const data = (await response.json()) as Readonly<{
      items?: readonly Record<string, unknown>[];
    }>;
    const now = new Date().toISOString();
    return Object.freeze(
      (data.items ?? []).flatMap((item) => {
        const sourceUrl = typeof item.url === "string" ? item.url : "";
        const externalId =
          sourceUrl.match(/[?&]v=([^&]+)/u)?.[1] ?? (typeof item.id === "string" ? item.id : "");
        const title = typeof item.title === "string" ? item.title.trim() : "";
        if (!sourceUrl || !externalId || !title) return [];
        const attachments = Array.isArray(item.attachments) ? item.attachments : [];
        const attachment = attachments[0] as Record<string, unknown> | undefined;
        const durationSeconds =
          typeof attachment?.duration_in_seconds === "number"
            ? attachment.duration_in_seconds
            : null;
        return [
          Object.freeze({
            id: `discover-${subscription.id}-${externalId}`,
            subscriptionId: subscription.id,
            provider: "youtube" as const,
            externalId,
            title,
            sourceUrl,
            thumbnailUrl: typeof item.image === "string" ? item.image : null,
            publishedAt: isoOrNull(item.date_published),
            durationMs: durationSeconds === null ? null : Math.round(durationSeconds * 1000),
            description: typeof item.summary === "string" ? item.summary : null,
            createdAt: now,
            updatedAt: now,
          }),
        ];
      }),
    );
  },
});

const bilibili: ContentSourceProvider = Object.freeze({
  id: "bilibili",
  label: "哔哩哔哩",
  canSubscribe(url) {
    return /bilibili\.com/iu.test(url);
  },
  normalizeSubscription() {
    throw new Error("哔哩哔哩频道订阅接口尚未配置。你仍可通过 URL 一次性导入内容。");
  },
  async fetchFeed() {
    throw new Error("哔哩哔哩频道订阅暂不可用，未创建虚假 Feed。 ");
  },
});

export const CONTENT_SOURCE_PROVIDERS: readonly ContentSourceProvider[] = Object.freeze([
  youtube,
  bilibili,
]);

export function providerForUrl(url: string): ContentSourceProvider | null {
  return CONTENT_SOURCE_PROVIDERS.find((provider) => provider.canSubscribe(url)) ?? null;
}

export const RECOMMENDED_CHANNELS = Object.freeze([
  Object.freeze({ title: "TED", url: "https://www.youtube.com/@TED", language: "en" }),
  Object.freeze({
    title: "BBC Learning English",
    url: "https://www.youtube.com/@bbclearningenglish",
    language: "en",
  }),
  Object.freeze({
    title: "National Geographic",
    url: "https://www.youtube.com/@NatGeo",
    language: "en",
  }),
]);
