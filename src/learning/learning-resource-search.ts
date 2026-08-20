import type { LearningResource } from "./learning-types";

function searchableText(resource: LearningResource): string {
  return [
    resource.title,
    resource.description,
    resource.language,
    resource.sourceUrl ?? "",
    resource.content,
    ...resource.sentences.flatMap((sentence) => [sentence.text, sentence.translation ?? ""]),
  ]
    .join("\n")
    .toLocaleLowerCase();
}

function recentTimestamp(resource: LearningResource): string {
  return resource.lastOpenedAt ?? resource.updatedAt;
}

export function searchLearningResources(
  resources: readonly LearningResource[],
  query: string,
): readonly LearningResource[] {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = normalized
    ? resources.filter((resource) => searchableText(resource).includes(normalized))
    : [...resources];

  return Object.freeze(
    matches.sort((left, right) => {
      if (normalized) {
        const leftTitleMatch = left.title.toLocaleLowerCase().includes(normalized);
        const rightTitleMatch = right.title.toLocaleLowerCase().includes(normalized);
        if (leftTitleMatch !== rightTitleMatch) return leftTitleMatch ? -1 : 1;
      }
      return recentTimestamp(right).localeCompare(recentTimestamp(left));
    }),
  );
}
