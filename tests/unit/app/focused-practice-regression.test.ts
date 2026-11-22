import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../src/learning/practice-screen.tsx"),
  "utf8",
);
const shell = readFileSync(resolve(__dirname, "../../../src/app/learning-screen.tsx"), "utf8");
const transcript = readFileSync(
  resolve(__dirname, "../../../src/learning/presentation/transcript/transcript-panel.tsx"),
  "utf8",
);

describe("focused sentence practice", () => {
  it("constrains the reading viewport independently of the transport", () => {
    expect(source).toContain("setFocusHeight(event.nativeEvent.layout.height)");
    expect(source).toContain("styles.focusStage, { height: focusHeight }");
    expect(source.indexOf("</SentenceScrollView>")).toBeLessThan(
      source.indexOf("<View style={styles.transport}>"),
    );
    expect(source).toContain("sentenceViewport: { flex: 1, minHeight: 0 }");
    expect(source).toContain("followTranscript={false}");
    expect(transcript).toContain(
      "if (focusOnCuePress) listRef.current?.scrollToOffset({ offset: 0, animated: true })",
    );
  });

  it("puts secondary content below focus and keeps the microphone affordance discreet", () => {
    expect(source).toContain("[recordingExpanded, setRecordingExpanded] = useState(false)");
    expect(source.indexOf("{recordingExpanded ? (")).toBeGreaterThan(
      source.indexOf("styles.transport}>"),
    );
    expect(source).toContain("size={14}");
    expect(source).toContain("minWidth: 48");
    expect(source).toContain("minHeight: 48");
    expect(source).toContain(
      "revealHeaderOffset={recordingExpanded ? Math.max(0, focusHeight - 140) : 0}",
    );
    expect(shell).toContain(
      'snapshot?.ui.section !== "practice" ? renderBottomNavigation(actions) : null',
    );
  });

  it("makes follow-reading record-only and stops other audio before recording", () => {
    const action = source.slice(
      source.indexOf("async function handleEchoAction()"),
      source.indexOf("function retryEcho()"),
    );
    expect(action).toContain("return startEchoRecording()");
    expect(action).toContain("return stopEchoRecording()");
    expect(action).not.toMatch(/replay|playOriginal|speak/u);
    const record = source.slice(
      source.indexOf("async function startEchoRecording()"),
      source.indexOf("async function stopEchoRecording()"),
    );
    expect(record.indexOf("await Speech.stop()")).toBeLessThan(
      record.indexOf("echoRecorder.record()"),
    );
    expect(record.indexOf("await audioSession.pause()")).toBeLessThan(
      record.indexOf("echoRecorder.record()"),
    );
    expect(record).toContain("echoBusyRef.current = true");
    expect(source).toContain("回放我的录音");
    expect(source).toContain("allowsRecording: false");
  });

  it("uses exact-source role annotations without changing the sentence", () => {
    expect(source).toContain("parseStructuredSentenceAnalysis(content, sentence.text)");
    expect(source).toContain("currentAnalysis?.sentenceComponents");
    expect(source).toContain("SENTENCE_ROLE_COLORS[span.role]");
    expect(source).toContain('span.role !== "other"');
  });
});
