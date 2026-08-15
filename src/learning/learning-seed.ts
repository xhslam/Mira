import {
  type ChatPartner,
  type CourseProgress,
  type LearningCourse,
  type LearningResource,
  type LearningSnapshot,
  type PracticeProgress,
} from "./learning-types";

const STARTER_RESOURCE_ID = "starter-evening-greetings";
const STARTER_COURSE_ID = "starter-everyday-conversations";
const STARTER_LESSON_ID = "starter-evening-greetings-lesson";

export function seedLearningSnapshot(snapshot: LearningSnapshot, now: string): LearningSnapshot {
  if (
    snapshot.resources.length > 0 ||
    snapshot.courses.length > 0 ||
    snapshot.partners.length > 0
  ) {
    return snapshot;
  }

  const resource: LearningResource = Object.freeze({
    id: STARTER_RESOURCE_ID,
    title: "晚间问候",
    description: "一组用于听力和跟读的入门短句。",
    language: "英语",
    source: "manual",
    content: "Hey, Alex! Good evening!\nHow was your day?\nIt was busy, but I learned a lot.",
    sentences: Object.freeze([
      Object.freeze({
        id: "starter-sentence-1",
        resourceId: STARTER_RESOURCE_ID,
        order: 1,
        text: "Hey, Alex! Good evening!",
        translation: "嗨，Alex！晚上好！",
        startMs: null,
        endMs: null,
        sourceAudioUri: null,
      }),
      Object.freeze({
        id: "starter-sentence-2",
        resourceId: STARTER_RESOURCE_ID,
        order: 2,
        text: "How was your day?",
        translation: "你今天过得怎么样？",
        startMs: null,
        endMs: null,
        sourceAudioUri: null,
      }),
      Object.freeze({
        id: "starter-sentence-3",
        resourceId: STARTER_RESOURCE_ID,
        order: 3,
        text: "It was busy, but I learned a lot.",
        translation: "很忙，但我学到了很多。",
        startMs: null,
        endMs: null,
        sourceAudioUri: null,
      }),
    ]),
    createdAt: now,
    updatedAt: now,
  });

  const course: LearningCourse = Object.freeze({
    id: STARTER_COURSE_ID,
    title: "日常英语会话",
    description: "通过日常表达、句子练习和引导复盘，逐步建立开口自信。",
    language: "英语",
    level: "beginner",
    coverColor: "#1E4D8C",
    createdAt: now,
    updatedAt: now,
    lessons: Object.freeze([
      Object.freeze({
        id: STARTER_LESSON_ID,
        courseId: STARTER_COURSE_ID,
        resourceId: STARTER_RESOURCE_ID,
        order: 1,
        title: "问候与道别",
        locked: false,
      }),
      Object.freeze({
        id: "starter-small-talk-lesson",
        courseId: STARTER_COURSE_ID,
        resourceId: STARTER_RESOURCE_ID,
        order: 2,
        title: "轻松闲聊",
        locked: true,
      }),
    ]),
  });

  const partner: ChatPartner = Object.freeze({
    id: "starter-partner-mia",
    name: "米娅",
    avatarSeed: "米娅",
    description: "一位陪你练习日常英语的友好对话伙伴。",
    personality: "温和、耐心、乐于倾听。",
    scenario: "日常会话",
    learningGoal: "在简短会话中，更自然地表达自己。",
    difficulty: "beginner",
    openingMessage: "你好，我是米娅。今天想聊些什么？",
    voiceId: null,
    correctionStyle: "gentle",
    customInstructions: "鼓励简短回答，追问一个问题，并仅在必要时给出简短纠正。",
    createdAt: now,
    updatedAt: now,
  });

  const progress: CourseProgress = Object.freeze({
    courseId: STARTER_COURSE_ID,
    lessonId: STARTER_LESSON_ID,
    state: "available",
    completionPercent: 0,
    lastOpenedAt: null,
    updatedAt: now,
  });

  const practice: readonly PracticeProgress[] = Object.freeze(
    resource.sentences.map((sentence, index) =>
      Object.freeze({
        resourceId: resource.id,
        sentenceId: sentence.id,
        listened: false,
        shadowed: false,
        lastPositionMs: 0,
        selected: index === 0,
        updatedAt: now,
      }),
    ),
  );

  return Object.freeze({
    ...snapshot,
    resources: Object.freeze([resource]),
    courses: Object.freeze([course]),
    partners: Object.freeze([partner]),
    courseProgress: Object.freeze([progress]),
    practice,
    ui: Object.freeze({
      ...snapshot.ui,
      selectedResourceId: resource.id,
      selectedSentenceId: resource.sentences[0]?.id ?? null,
      selectedCourseId: course.id,
      selectedLessonId: STARTER_LESSON_ID,
    }),
  });
}
