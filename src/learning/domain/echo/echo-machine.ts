export const ECHO_STATES = [
  "idle",
  "listeningOriginal",
  "readyToRecord",
  "recording",
  "recorded",
  "replaying",
  "assessing",
  "completed",
  "error",
] as const;

export type EchoState = (typeof ECHO_STATES)[number];

export type EchoSession = Readonly<{
  state: EchoState;
  cueId: string | null;
  recordingId: string | null;
  error: string | null;
  assessmentConfigured: boolean;
}>;

export type EchoEvent =
  | Readonly<{ type: "begin"; cueId: string }>
  | Readonly<{ type: "originalFinished" }>
  | Readonly<{ type: "recordStart" }>
  | Readonly<{ type: "recordSaved"; recordingId: string }>
  | Readonly<{ type: "replayStart" }>
  | Readonly<{ type: "replayFinished" }>
  | Readonly<{ type: "assessmentStart" }>
  | Readonly<{ type: "assessmentFinished" }>
  | Readonly<{ type: "retry" }>
  | Readonly<{ type: "dismiss" }>
  | Readonly<{ type: "failed"; message: string }>;

export const initialEchoSession: EchoSession = Object.freeze({
  state: "idle",
  cueId: null,
  recordingId: null,
  error: null,
  assessmentConfigured: false,
});

export function reduceEchoSession(session: EchoSession, event: EchoEvent): EchoSession {
  switch (event.type) {
    case "begin":
      return Object.freeze({
        ...initialEchoSession,
        state: "listeningOriginal",
        cueId: event.cueId,
        assessmentConfigured: session.assessmentConfigured,
      });
    case "originalFinished":
      return session.state === "listeningOriginal"
        ? Object.freeze({ ...session, state: "readyToRecord" })
        : session;
    case "recordStart":
      return session.state === "readyToRecord" ||
        session.state === "recorded" ||
        session.state === "completed"
        ? Object.freeze({ ...session, state: "recording", error: null })
        : session;
    case "recordSaved":
      return session.state === "recording"
        ? Object.freeze({ ...session, state: "recorded", recordingId: event.recordingId })
        : session;
    case "replayStart":
      return session.state === "recorded" || session.state === "completed"
        ? Object.freeze({ ...session, state: "replaying" })
        : session;
    case "replayFinished":
      return session.state === "replaying"
        ? Object.freeze({ ...session, state: "recorded" })
        : session;
    case "assessmentStart":
      return session.state === "recorded" && session.assessmentConfigured
        ? Object.freeze({ ...session, state: "assessing" })
        : session;
    case "assessmentFinished":
      return session.state === "assessing"
        ? Object.freeze({ ...session, state: "completed" })
        : session;
    case "retry":
      return session.cueId
        ? Object.freeze({ ...session, state: "readyToRecord", recordingId: null, error: null })
        : session;
    case "dismiss":
      return Object.freeze({
        ...initialEchoSession,
        assessmentConfigured: session.assessmentConfigured,
      });
    case "failed":
      return Object.freeze({ ...session, state: "error", error: event.message });
  }
}

export function echoStatusCopy(session: EchoSession): string {
  switch (session.state) {
    case "idle":
      return "先播放原句，再开始跟读。";
    case "listeningOriginal":
      return "正在播放原音，结束后会停在句首。";
    case "readyToRecord":
      return "现在可以开始录制你的跟读。";
    case "recording":
      return "正在录制。";
    case "recorded":
      return session.assessmentConfigured
        ? "录音已保存，可回放或开始评测。"
        : "录音已保存。尚未配置发音评测，你仍可与原音对比。";
    case "replaying":
      return "正在回放你的录音。";
    case "assessing":
      return "正在请求发音评测。";
    case "completed":
      return "本次跟读已完成。";
    case "error":
      return session.error ?? "跟读暂时不可用。";
  }
}
