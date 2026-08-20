import type {
  LearningResource,
  LearningSavedItem,
  LearningSentence,
  LearningSnapshot,
  PracticeProgress,
} from "./learning-types";

export function openLearningResource(
  snapshot: LearningSnapshot,
  resourceId: string,
  now = new Date().toISOString(),
): LearningSnapshot {
  const resource = snapshot.resources.find((item) => item.id === resourceId);
  if (!resource) return snapshot;
  const progress = snapshot.practice
    .filter((item) => item.resourceId === resourceId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const selectedSentenceId =
    progress?.sentenceId ?? resource.sentences[0]?.id ?? snapshot.ui.selectedSentenceId;
  return Object.freeze({
    ...snapshot,
    resources: Object.freeze(
      snapshot.resources.map((item) =>
        item.id === resourceId
          ? Object.freeze({ ...item, lastOpenedAt: now, updatedAt: now })
          : item,
      ),
    ),
    ui: Object.freeze({
      ...snapshot.ui,
      section: "practice",
      selectedResourceId: resourceId,
      selectedSentenceId,
    }),
  });
}

export function persistLearningPosition(
  snapshot: LearningSnapshot,
  options: Readonly<{
    resource: LearningResource;
    sentence: LearningSentence;
    positionMs: number;
    listened?: boolean;
    shadowed?: boolean;
    now?: string;
  }>,
): LearningSnapshot {
  const now = options.now ?? new Date().toISOString();
  const previous = snapshot.practice.find(
    (item) => item.resourceId === options.resource.id && item.sentenceId === options.sentence.id,
  );
  const next: PracticeProgress = Object.freeze({
    resourceId: options.resource.id,
    sentenceId: options.sentence.id,
    listened: options.listened ?? previous?.listened ?? false,
    shadowed: options.shadowed ?? previous?.shadowed ?? false,
    lastPositionMs: Math.max(0, Math.round(options.positionMs)),
    selected: true,
    updatedAt: now,
  });
  return Object.freeze({
    ...snapshot,
    resources: Object.freeze(
      snapshot.resources.map((item) =>
        item.id === options.resource.id
          ? Object.freeze({
              ...item,
              lastPositionMs: next.lastPositionMs,
              lastOpenedAt: now,
              updatedAt: now,
            })
          : item,
      ),
    ),
    practice: Object.freeze([
      ...snapshot.practice.filter(
        (item) =>
          item.resourceId !== options.resource.id || item.sentenceId !== options.sentence.id,
      ),
      next,
    ]),
    ui: Object.freeze({
      ...snapshot.ui,
      selectedResourceId: options.resource.id,
      selectedSentenceId: options.sentence.id,
    }),
  });
}

export function addPracticeMinutes(
  snapshot: LearningSnapshot,
  elapsedMs: number,
  now = new Date(),
): LearningSnapshot {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return snapshot;
  const today = now.toISOString().slice(0, 10);
  const isSameDay = snapshot.goal.lastActivityDate === today;
  const minutes = elapsedMs / 60_000;
  return Object.freeze({
    ...snapshot,
    goal: Object.freeze({
      ...snapshot.goal,
      practiceMinutesToday: (isSameDay ? snapshot.goal.practiceMinutesToday : 0) + minutes,
      lastActivityDate: today,
      streakDays: isSameDay ? snapshot.goal.streakDays : snapshot.goal.streakDays + 1,
    }),
  });
}

export function resourceProgress(snapshot: LearningSnapshot, resource: LearningResource): number {
  if (!resource.sentences.length) return 0;
  const completed = snapshot.practice.filter(
    (item) => item.resourceId === resource.id && (item.listened || item.shadowed),
  ).length;
  return Math.min(100, Math.round((completed / resource.sentences.length) * 100));
}

export function deleteLearningResource(
  snapshot: LearningSnapshot,
  resourceId: string,
): LearningSnapshot {
  const resource = snapshot.resources.find((item) => item.id === resourceId);
  if (!resource) return snapshot;

  const removedTracks = snapshot.transcriptTracks.filter(
    (track) => track.resourceId === resourceId,
  );
  const removedTrackIds = new Set(removedTracks.map((track) => track.id));
  const removedSentenceIds = new Set([
    ...resource.sentences.map((sentence) => sentence.id),
    ...removedTracks.flatMap((track) => track.sentences.map((sentence) => sentence.id)),
  ]);
  const removedRecordings = snapshot.recordings.filter((recording) =>
    removedSentenceIds.has(recording.sentenceId),
  );
  const removedRecordingIds = new Set(removedRecordings.map((recording) => recording.id));
  const removedLessonIds = new Set(
    snapshot.courses.flatMap((course) =>
      course.lessons
        .filter((lesson) => lesson.resourceId === resourceId)
        .map((lesson) => lesson.id),
    ),
  );

  return Object.freeze({
    ...snapshot,
    resources: Object.freeze(snapshot.resources.filter((item) => item.id !== resourceId)),
    recordings: Object.freeze(
      snapshot.recordings.filter((recording) => !removedSentenceIds.has(recording.sentenceId)),
    ),
    practice: Object.freeze(
      snapshot.practice.filter(
        (progress) =>
          progress.resourceId !== resourceId && !removedSentenceIds.has(progress.sentenceId),
      ),
    ),
    vocabulary: Object.freeze(
      snapshot.vocabulary.map((card) =>
        card.sourceResourceId === resourceId
          ? Object.freeze({ ...card, sourceResourceId: null })
          : card,
      ),
    ),
    assessments: Object.freeze(
      snapshot.assessments.filter(
        (assessment) =>
          !removedRecordingIds.has(assessment.recordingId) &&
          !removedSentenceIds.has(assessment.sentenceId),
      ),
    ),
    translations: Object.freeze(
      snapshot.translations.filter(
        (translation) => !removedSentenceIds.has(translation.sentenceId),
      ),
    ),
    transcriptionJobs: Object.freeze(
      snapshot.transcriptionJobs.filter((job) => job.resourceId !== resourceId),
    ),
    posters: Object.freeze(
      snapshot.posters.filter((poster) => !removedSentenceIds.has(poster.sentenceId)),
    ),
    courses: Object.freeze(
      snapshot.courses.map((course) =>
        course.lessons.some((lesson) => removedLessonIds.has(lesson.id))
          ? Object.freeze({
              ...course,
              lessons: Object.freeze(
                course.lessons.filter((lesson) => !removedLessonIds.has(lesson.id)),
              ),
            })
          : course,
      ),
    ),
    courseProgress: Object.freeze(
      snapshot.courseProgress.filter((progress) => !removedLessonIds.has(progress.lessonId)),
    ),
    transcriptTracks: Object.freeze(
      snapshot.transcriptTracks.filter((track) => track.resourceId !== resourceId),
    ),
    savedItems: Object.freeze(
      snapshot.savedItems.filter(
        (item) => item.mediaId !== resourceId && !removedSentenceIds.has(item.cueId),
      ),
    ),
    analyses: Object.freeze(
      snapshot.analyses.filter(
        (analysis) =>
          analysis.resourceId !== resourceId && !removedSentenceIds.has(analysis.sentenceId),
      ),
    ),
    ui: Object.freeze({
      ...snapshot.ui,
      selectedResourceId:
        snapshot.ui.selectedResourceId === resourceId ? null : snapshot.ui.selectedResourceId,
      selectedSentenceId:
        snapshot.ui.selectedSentenceId && removedSentenceIds.has(snapshot.ui.selectedSentenceId)
          ? null
          : snapshot.ui.selectedSentenceId,
      activeTranscriptTrackId:
        snapshot.ui.activeTranscriptTrackId &&
        removedTrackIds.has(snapshot.ui.activeTranscriptTrackId)
          ? null
          : snapshot.ui.activeTranscriptTrackId,
      selectedLessonId:
        snapshot.ui.selectedLessonId && removedLessonIds.has(snapshot.ui.selectedLessonId)
          ? null
          : snapshot.ui.selectedLessonId,
    }),
  });
}

export function saveLearningItem(
  snapshot: LearningSnapshot,
  input: Omit<LearningSavedItem, "id" | "createdAt"> &
    Readonly<{ id?: string; createdAt?: string }>,
): LearningSnapshot {
  const existing = snapshot.savedItems.find(
    (item) =>
      item.kind === input.kind &&
      item.mediaId === input.mediaId &&
      item.cueId === input.cueId &&
      item.term.toLowerCase() === input.term.toLowerCase(),
  );
  if (existing) return snapshot;
  const item: LearningSavedItem = Object.freeze({
    ...input,
    id: input.id ?? `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  return Object.freeze({ ...snapshot, savedItems: Object.freeze([item, ...snapshot.savedItems]) });
}
