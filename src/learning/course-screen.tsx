import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BookOpen, Check, ChevronRight, Lock, PlayCircle } from "lucide-react-native";
import type { Theme } from "../app/theme";
import type {
  CourseProgress,
  LearningCourse,
  LearningCourseLesson,
  LearningSnapshot,
} from "./learning-types";

export function CourseScreen({
  snapshot,
  onChange,
  theme,
}: Readonly<{
  snapshot: LearningSnapshot;
  onChange: (snapshot: LearningSnapshot) => void;
  theme: Theme;
}>) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selected =
    snapshot.courses.find((course) => course.id === snapshot.ui.selectedCourseId) ??
    snapshot.courses[0] ??
    null;
  function selectCourse(courseId: string) {
    onChange(
      Object.freeze({
        ...snapshot,
        ui: Object.freeze({ ...snapshot.ui, selectedCourseId: courseId }),
      }),
    );
  }
  function openLesson(course: LearningCourse, lesson: LearningCourseLesson) {
    if (!lessonAvailable(course, lesson, snapshot.courseProgress)) return;
    const now = new Date().toISOString();
    const current = progressFor(snapshot.courseProgress, course.id, lesson.id);
    const nextProgress = upsertProgress(
      snapshot.courseProgress,
      Object.freeze({
        courseId: course.id,
        lessonId: lesson.id,
        state: current?.state === "completed" ? "completed" : "in_progress",
        completionPercent: current?.completionPercent ?? 0,
        lastOpenedAt: now,
        updatedAt: now,
      }),
    );
    onChange(
      Object.freeze({
        ...snapshot,
        courseProgress: nextProgress,
        ui: Object.freeze({
          ...snapshot.ui,
          selectedCourseId: course.id,
          selectedLessonId: lesson.id,
          selectedResourceId: lesson.resourceId,
          section: "practice",
        }),
      }),
    );
  }
  function completeLesson(course: LearningCourse, lesson: LearningCourseLesson) {
    const now = new Date().toISOString();
    let next = upsertProgress(
      snapshot.courseProgress,
      Object.freeze({
        courseId: course.id,
        lessonId: lesson.id,
        state: "completed",
        completionPercent: 100,
        lastOpenedAt: now,
        updatedAt: now,
      }),
    );
    const following = course.lessons.find((candidate) => candidate.order === lesson.order + 1);
    if (following)
      next = upsertProgress(
        next,
        Object.freeze({
          courseId: course.id,
          lessonId: following.id,
          state: "available",
          completionPercent: 0,
          lastOpenedAt: null,
          updatedAt: now,
        }),
      );
    onChange(
      Object.freeze({
        ...snapshot,
        courseProgress: next,
        ui: Object.freeze({
          ...snapshot.ui,
          selectedCourseId: course.id,
          selectedLessonId: lesson.id,
        }),
      }),
    );
  }
  if (!selected)
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconContainer}>
          <BookOpen color={theme.colors.mutedText} size={28} />
        </View>
        <Text style={styles.emptyTitle}>No courses yet</Text>
        <Text style={styles.emptyCopy}>
          Generated or imported learning resources can become lessons here.
        </Text>
      </View>
    );
  const completed = selected.lessons.filter(
    (lesson) => progressFor(snapshot.courseProgress, selected.id, lesson.id)?.state === "completed",
  ).length;
  const activeLesson =
    selected.lessons.find((lesson) => lesson.id === snapshot.ui.selectedLessonId) ??
    selected.lessons.find((lesson) => lessonAvailable(selected, lesson, snapshot.courseProgress)) ??
    selected.lessons[0] ??
    null;
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>COURSES</Text>
        <Text style={styles.title}>Structured learning</Text>
        <Text style={styles.copy}>
          Progress is saved per lesson and keeps the next available step ready when you return.
        </Text>
      </View>
      <Text style={styles.sectionTitle}>Course library</Text>
      {snapshot.courses.map((course) => {
        const chosen = course.id === selected.id;
        const done = course.lessons.filter(
          (lesson) =>
            progressFor(snapshot.courseProgress, course.id, lesson.id)?.state === "completed",
        ).length;
        return (
          <Pressable
            key={course.id}
            accessibilityRole="button"
            onPress={() => selectCourse(course.id)}
            style={({ pressed }) => [
              styles.courseCard,
              chosen && styles.courseCardSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.cover, { backgroundColor: course.coverColor }]}>
              <BookOpen color="#FFFFFF" size={23} />
            </View>
            <View style={styles.courseText}>
              <Text style={styles.courseName}>{course.title}</Text>
              <Text numberOfLines={2} style={styles.courseDescription}>
                {course.description}
              </Text>
              <Text style={styles.courseMeta}>
                {done}/{course.lessons.length} lessons complete · {course.level}
              </Text>
            </View>
            <ChevronRight color={theme.colors.mutedText} size={20} />
          </Pressable>
        );
      })}
      <View style={styles.detailCard}>
        <Text style={styles.cardKicker}>CURRENT COURSE</Text>
        <Text style={styles.detailTitle}>{selected.title}</Text>
        <Text style={styles.detailCopy}>{selected.description}</Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round((completed / Math.max(selected.lessons.length, 1)) * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {completed} of {selected.lessons.length} lessons complete
        </Text>
      </View>
      <Text style={styles.sectionTitle}>Lessons</Text>
      {selected.lessons.map((lesson) => {
        const progress = progressFor(snapshot.courseProgress, selected.id, lesson.id);
        const available = lessonAvailable(selected, lesson, snapshot.courseProgress);
        const isCompleted = progress?.state === "completed";
        const isActive = activeLesson?.id === lesson.id;
        return (
          <View key={lesson.id} style={[styles.lessonRow, isActive && styles.lessonRowActive]}>
            <View style={[styles.lessonIndex, isCompleted && styles.lessonIndexCompleted]}>
              {isCompleted ? (
                <Check color={theme.colors.canvas} size={15} />
              ) : available ? (
                <Text style={styles.lessonIndexText}>{lesson.order}</Text>
              ) : (
                <Lock color={theme.colors.mutedText} size={14} />
              )}
            </View>
            <View style={styles.lessonText}>
              <Text style={styles.lessonTitle}>{lesson.title}</Text>
              <Text style={styles.lessonState}>
                {isCompleted
                  ? "Completed"
                  : available
                    ? progress?.state === "in_progress"
                      ? "In progress"
                      : "Available"
                    : "Complete the previous lesson to unlock"}
              </Text>
            </View>
            {available ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openLesson(selected, lesson)}
                style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
              >
                <PlayCircle color={theme.colors.primary} size={17} />
                <Text style={styles.openText}>{isCompleted ? "Review" : "Open"}</Text>
              </Pressable>
            ) : null}
            {isActive && !isCompleted ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => completeLesson(selected, lesson)}
                style={({ pressed }) => [styles.completeButton, pressed && styles.pressed]}
              >
                <Text style={styles.completeText}>Complete</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
function progressFor(
  progress: readonly CourseProgress[],
  courseId: string,
  lessonId: string,
): CourseProgress | null {
  return progress.find((item) => item.courseId === courseId && item.lessonId === lessonId) ?? null;
}
function lessonAvailable(
  course: LearningCourse,
  lesson: LearningCourseLesson,
  progress: readonly CourseProgress[],
): boolean {
  if (!lesson.locked) return true;
  const previous = course.lessons.find((item) => item.order === lesson.order - 1);
  return Boolean(previous && progressFor(progress, course.id, previous.id)?.state === "completed");
}
function upsertProgress(
  progress: readonly CourseProgress[],
  entry: CourseProgress,
): readonly CourseProgress[] {
  const present = progress.some(
    (item) => item.courseId === entry.courseId && item.lessonId === entry.lessonId,
  );
  return Object.freeze(
    present
      ? progress.map((item) =>
          item.courseId === entry.courseId && item.lessonId === entry.lessonId ? entry : item,
        )
      : [...progress, entry],
  );
}
function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: {
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
    },
    hero: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      gap: theme.spacing.xs,
      padding: theme.spacing.lg,
    },
    kicker: { color: theme.colors.primary, fontSize: 11, fontWeight: "600", letterSpacing: 1 },
    title: { color: theme.colors.text, fontSize: 24, fontWeight: "600" },
    copy: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20 },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "600",
      marginTop: theme.spacing.xs,
    },
    courseCard: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
    },
    courseCardSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    cover: {
      alignItems: "center",
      borderRadius: theme.radius.md,
      height: 56,
      justifyContent: "center",
      width: 56,
    },
    courseText: { flex: 1, gap: theme.spacing.xs },
    courseName: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    courseDescription: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    courseMeta: { color: theme.colors.primary, fontSize: 11, fontWeight: "600", marginTop: 2 },
    detailCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      gap: theme.spacing.sm,
      padding: theme.spacing.lg,
    },
    cardKicker: { color: theme.colors.primary, fontSize: 11, fontWeight: "600", letterSpacing: 1 },
    detailTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "600" },
    detailCopy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19 },
    progressTrack: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      height: 8,
      marginTop: theme.spacing.xs,
      overflow: "hidden",
    },
    progressFill: { backgroundColor: theme.colors.primary, height: "100%" },
    progressText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "700" },
    lessonRow: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
    },
    lessonRowActive: { borderColor: theme.colors.primary },
    lessonIndex: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.sm,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    lessonIndexCompleted: { backgroundColor: theme.colors.success },
    lessonIndexText: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
    lessonText: { flex: 1 },
    lessonTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    lessonState: { color: theme.colors.mutedText, fontSize: 11, lineHeight: 16, marginTop: 2 },
    openButton: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radius.sm,
      flexDirection: "row",
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    openText: { color: theme.colors.primary, fontSize: 12, fontWeight: "600" },
    completeButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    completeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
    empty: {
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.xxxl,
    },
    emptyIconContainer: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      height: 56,
      justifyContent: "center",
      width: 56,
      marginBottom: theme.spacing.xs,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "600" },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20, textAlign: "center" },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
