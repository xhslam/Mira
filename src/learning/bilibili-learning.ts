export type BilibiliVideoReference = Readonly<{
  kind: "video" | "episode";
  id: string;
}>;

function isBilibiliHost(hostname: string): boolean {
  return /(^|\.)bilibili\.com$/iu.test(hostname) || hostname === "b23.tv";
}

export function bilibiliVideoReference(sourceUrl: string): BilibiliVideoReference | null {
  try {
    const url = new URL(sourceUrl);
    if (!isBilibiliHost(url.hostname.toLowerCase())) return null;
    const video = url.pathname.match(/\/video\/(BV[\w-]+)/iu)?.[1];
    const episode = url.pathname.match(/\/bangumi\/play\/(ep\d+)/iu)?.[1];
    if (video) return Object.freeze({ kind: "video", id: video });
    if (episode) return Object.freeze({ kind: "episode", id: episode });
    return null;
  } catch {
    return null;
  }
}

export function bilibiliEmbedUrl(sourceUrl: string): string | null {
  const reference = bilibiliVideoReference(sourceUrl);
  if (!reference) return null;
  const query = new URLSearchParams({
    autoplay: "0",
    danmaku: "0",
    [reference.kind === "video" ? "bvid" : "episodeId"]: reference.id,
  });
  return `https://player.bilibili.com/player.html?${query.toString()}`;
}
