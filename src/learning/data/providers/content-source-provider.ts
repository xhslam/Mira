export type ProviderResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; message: string; recoverable: boolean }>;

export type ContentSubscriptionInput = Readonly<{
  source: string;
  titleHint: string | null;
}>;

export type ContentSubscription = Readonly<{
  provider: "youtube" | "bilibili";
  sourceKey: string;
  sourceUrl: string;
  title: string;
  avatarUrl: string | null;
  language: string | null;
}>;

export type ContentFeedEntry = Readonly<{
  externalId: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationMs: number | null;
  description: string | null;
}>;

export type ResolvedMedia =
  | Readonly<{
      kind: "playable";
      uri: string;
      mediaKind: "audio" | "video";
      durationMs: number | null;
      title: string;
      sourceUrl: string;
    }>
  | Readonly<{
      kind: "reference";
      sourceUrl: string;
      title: string;
      message: string;
    }>;

export type ProviderTranscriptTrack = Readonly<{
  label: string;
  language: string;
  source: "imported" | "ai" | "manual" | "translation";
  cues: readonly Readonly<{
    id: string;
    order: number;
    text: string;
    translation: string | null;
    startMs: number | null;
    endMs: number | null;
  }>[];
}>;

export interface ContentSourceProvider {
  readonly id: "youtube" | "bilibili";
  validateSubscription(
    input: ContentSubscriptionInput,
  ): Promise<ProviderResult<ContentSubscription>>;
  fetchFeed(
    subscription: ContentSubscription,
  ): Promise<ProviderResult<readonly ContentFeedEntry[]>>;
  resolveMedia(entry: ContentFeedEntry): Promise<ProviderResult<ResolvedMedia>>;
  fetchTranscript?(
    entry: ContentFeedEntry,
  ): Promise<ProviderResult<readonly ProviderTranscriptTrack[]>>;
}

export class ContentSourceRegistry {
  private readonly providers = new Map<ContentSourceProvider["id"], ContentSourceProvider>();

  public register(provider: ContentSourceProvider): void {
    this.providers.set(provider.id, provider);
  }

  public get(id: ContentSourceProvider["id"]): ContentSourceProvider | null {
    return this.providers.get(id) ?? null;
  }

  public available(): readonly ContentSourceProvider["id"][] {
    return Object.freeze([...this.providers.keys()]);
  }
}
