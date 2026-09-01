import type { LearningResource } from "./learning-types";

export type DiscoverResourceFilter = "all" | "video" | "audio" | "text";

export function discoverResourceKind(
  resource: LearningResource,
): Exclude<DiscoverResourceFilter, "all"> {
  if (
    resource.mediaKind === "video" ||
    resource.mediaKind === "youtube" ||
    resource.mediaKind === "bilibili"
  ) {
    return "video";
  }
  return resource.mediaKind === "audio" ? "audio" : "text";
}

export function listDiscoverResources(
  resources: readonly LearningResource[],
  filter: DiscoverResourceFilter,
  limit = 8,
): readonly LearningResource[] {
  if (!Number.isFinite(limit) || limit <= 0) return Object.freeze([]);

  return Object.freeze(
    resources
      .filter((resource) => filter === "all" || discoverResourceKind(resource) === filter)
      .sort((left, right) =>
        (right.lastOpenedAt ?? right.updatedAt).localeCompare(left.lastOpenedAt ?? left.updatedAt),
      )
      .slice(0, Math.floor(limit)),
  );
}
