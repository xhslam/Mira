import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  MainMenu,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
// Expo DOM does not currently resolve the package's condition-only CSS export. The version-locked
// production asset is imported directly so native and web DOM bundles use the same stylesheet.
import "../../../node_modules/@excalidraw/excalidraw/dist/prod/index.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorFlushRequest } from "../../editor-bridge/editor-flush";
import {
  createEditorReadyMessage,
  createEditorSnapshotMessage,
} from "../../editor-bridge/editor-message-builder";
import {
  EDITOR_PROTOCOL_VERSION,
  type EditorSaveRequestedMessage,
} from "../../editor-bridge/editor-message";
import {
  createRecoveredExcalidrawMarkdownFile,
  isExcalidrawMarkdownPath,
  parseExcalidrawFile,
  serializeExcalidrawFile,
  type ExcalidrawScene,
} from "./excalidraw-file";

type ExcalidrawEditorProps = Readonly<{
  documentId: string;
  flushRequest: EditorFlushRequest | null;
  locale: "en" | "zh-CN";
  path: string;
  revision: number;
  sessionId: string;
  source: string;
  themeMode: "light" | "dark";
  onOpenLink: (link: string) => Promise<void>;
  onShareExport: (name: string, format: "png" | "svg", contents: string) => Promise<boolean>;
  onProtocolMessage: (message: unknown) => Promise<void>;
  onSnapshot: (message: unknown) => Promise<void>;
}>;

function sceneFromSerialized(serialized: string): ExcalidrawScene {
  const parsed = JSON.parse(serialized) as ExcalidrawScene;
  return parsed;
}

export default function ExcalidrawEditor({
  documentId,
  flushRequest,
  locale,
  path,
  revision,
  sessionId,
  source,
  themeMode,
  onOpenLink,
  onShareExport,
  onProtocolMessage,
  onSnapshot,
}: ExcalidrawEditorProps) {
  const parsed = useMemo(() => parseExcalidrawFile(source, path), [path, source]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const originalSourceRef = useRef(source);
  const revisionRef = useRef(revision);
  const lastEmittedRef = useRef(source);
  const pendingSourceRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const lastFlushRequestRef = useRef(0);
  const initialChangeRef = useRef(true);
  const applyingExternalRef = useRef(false);

  useEffect(() => {
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.style.touchAction = "none";
    const root = document.getElementById("root");
    if (root) root.style.height = "100%";
  }, []);

  useEffect(() => {
    revisionRef.current = Math.max(revisionRef.current, revision);
    originalSourceRef.current = source;
    if (!api || source === lastEmittedRef.current) return;
    const external = parseExcalidrawFile(source, path);
    if (!external.ok) return;
    applyingExternalRef.current = true;
    api.updateScene({
      elements: external.value.elements as never,
      appState: external.value.appState as never,
    });
    if (external.value.files) api.addFiles(Object.values(external.value.files) as never);
    api.history.clear();
    lastEmittedRef.current = source;
    queueMicrotask(() => {
      applyingExternalRef.current = false;
    });
  }, [api, path, revision, source]);

  const emitPending = useCallback(async () => {
    const next = pendingSourceRef.current;
    pendingSourceRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next === null || next === lastEmittedRef.current) return;
    queueRef.current = queueRef.current.then(async () => {
      const baseRevision = revisionRef.current;
      await onSnapshot(
        createEditorSnapshotMessage({
          sessionId,
          documentId,
          baseRevision,
          revision: baseRevision + 1,
          mode: "source",
          markdown: next,
          selection: Object.freeze({ anchor: 0, head: 0 }),
        }),
      );
      revisionRef.current = baseRevision + 1;
      lastEmittedRef.current = next;
      originalSourceRef.current = next;
    });
    await queueRef.current;
  }, [documentId, onSnapshot, sessionId]);

  useEffect(() => {
    void onProtocolMessage(createEditorReadyMessage({ sessionId, documentId }));
  }, [documentId, onProtocolMessage, sessionId]);

  useEffect(() => {
    if (!flushRequest || flushRequest.requestId === lastFlushRequestRef.current) return;
    lastFlushRequestRef.current = flushRequest.requestId;
    void (async () => {
      await emitPending();
      const message: EditorSaveRequestedMessage = Object.freeze({
        protocolVersion: EDITOR_PROTOCOL_VERSION,
        type: "document.saveRequested",
        sessionId: sessionId as EditorSaveRequestedMessage["sessionId"],
        documentId: documentId as EditorSaveRequestedMessage["documentId"],
        revision: revisionRef.current,
        requestId: flushRequest.requestId,
      });
      await onProtocolMessage(message);
    })();
  }, [documentId, emitPending, flushRequest, onProtocolMessage, sessionId]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void emitPending();
    },
    [emitPending],
  );

  async function repairMarkdownCanvas(): Promise<void> {
    if (!isExcalidrawMarkdownPath(path)) return;
    try {
      const recovered = createRecoveredExcalidrawMarkdownFile(path, source);
      const baseRevision = revisionRef.current;
      await onSnapshot(
        createEditorSnapshotMessage({
          sessionId,
          documentId,
          baseRevision,
          revision: baseRevision + 1,
          mode: "source",
          markdown: recovered,
          selection: Object.freeze({ anchor: 0, head: 0 }),
        }),
      );
      revisionRef.current = baseRevision + 1;
      lastEmittedRef.current = recovered;
      originalSourceRef.current = recovered;
    } catch {
      setRecoveryMessage(
        locale === "zh-CN"
          ? "修复未能保存。原文件未被覆盖，请检查存储权限后重试。"
          : "Repair could not be saved. The original file was not overwritten; check storage permissions and try again.",
      );
    }
  }
  if (!parsed.ok) {
    const canRepair = parsed.error.recoverable && isExcalidrawMarkdownPath(path);
    const title = locale === "zh-CN" ? "画板文件无法打开" : "Unable to open drawing";
    const hint = canRepair
      ? locale === "zh-CN"
        ? "可安全创建一个新画板；原始内容会保留在同一文件的恢复区，并可从版本历史找回。"
        : "You can safely create a new canvas. The original source will be retained in a recovery section and remains available in version history."
      : locale === "zh-CN"
        ? "原文件未被修改，请从版本历史恢复。"
        : "The source file has not been modified. Restore it from version history.";
    return (
      <main className="mira-drawing-error">
        <div className="mira-drawing-error-card">
          <span>EXCALIDRAW</span>
          <h1>{title}</h1>
          <p>{parsed.error.message}</p>
          <p className="mira-drawing-error-hint">{hint}</p>
          {canRepair ? (
            <button
              className="mira-drawing-repair"
              onClick={() => void repairMarkdownCanvas()}
              type="button"
            >
              {locale === "zh-CN" ? "安全修复为新画板" : "Safely repair as new canvas"}
            </button>
          ) : null}
          {recoveryMessage ? (
            <p aria-live="polite" className="mira-drawing-error-feedback">
              {recoveryMessage}
            </p>
          ) : null}
        </div>
        <style>{ERROR_STYLES}</style>
      </main>
    );
  }

  async function shareExport(format: "png" | "svg"): Promise<void> {
    if (!api) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();
    const fileName = path.split("/").at(-1) ?? "drawing";
    try {
      const contents =
        format === "png"
          ? await new Promise<string>((resolve, reject) => {
              void exportToBlob({ elements, appState, files, mimeType: "image/png" })
                .then((blob: Blob) => {
                  const reader = new FileReader();
                  reader.onerror = () => reject(reader.error ?? new Error("Export failed"));
                  reader.onload = () =>
                    resolve(String(reader.result ?? "").replace(/^data:image\/png;base64,/, ""));
                  reader.readAsDataURL(blob);
                })
                .catch(reject);
            })
          : new XMLSerializer().serializeToString(await exportToSvg({ elements, appState, files }));
      const shared = await onShareExport(fileName, format, contents);
      if (!shared) api.setToast({ message: "无法打开系统分享", closable: true });
    } catch {
      api.setToast({ message: "导出失败，请稍后重试", closable: true });
    }
  }

  return (
    <div className="mira-excalidraw-shell">
      <Excalidraw
        aiEnabled={false}
        autoFocus
        detectScroll={false}
        excalidrawAPI={setApi}
        handleKeyboardGlobally
        initialData={{
          elements: parsed.value.elements as never,
          appState: {
            ...parsed.value.appState,
            theme: themeMode,
            collaborators: new Map(),
          } as never,
          files: (parsed.value.files ?? {}) as never,
          scrollToContent: true,
        }}
        langCode={locale}
        name={
          path
            .split("/")
            .at(-1)
            ?.replace(/\.excalidraw(?:\.md)?$/i, "") ?? "Mira"
        }
        onChange={(elements, appState, files) => {
          if (initialChangeRef.current) {
            initialChangeRef.current = false;
            return;
          }
          if (applyingExternalRef.current) return;
          const serialized = serializeAsJSON(elements, appState, files, "local");
          const next = serializeExcalidrawFile(
            sceneFromSerialized(serialized),
            path,
            originalSourceRef.current,
          );
          pendingSourceRef.current = next;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => void emitPending(), 280);
        }}
        onLinkOpen={(element) => {
          if (element.link) void onOpenLink(element.link);
        }}
        theme={themeMode}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: { saveFileToDisk: true },
            loadScene: true,
            saveAsImage: true,
            saveToActiveFile: true,
            toggleTheme: true,
          },
          tools: { image: true },
        }}
      >
        <MainMenu>
          <MainMenu.Group title={locale === "zh-CN" ? "Mira 导出" : "Mira export"}>
            <MainMenu.Item onSelect={() => void shareExport("png")}>
              {locale === "zh-CN" ? "分享 PNG 到其他应用" : "Share PNG to another app"}
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => void shareExport("svg")}>
              {locale === "zh-CN" ? "分享 SVG 到其他应用" : "Share SVG to another app"}
            </MainMenu.Item>
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
      <div aria-hidden className="mira-pencil-status">
        <i />
        {api ? "LOCAL CANVAS" : "OPENING CANVAS"}
      </div>
      <style>{SHELL_STYLES}</style>
    </div>
  );
}

const SHELL_STYLES = `
  .mira-excalidraw-shell { position: relative; width: 100%; height: 100%; background: #f5f3ee; }
  .mira-excalidraw-shell .excalidraw { width: 100%; height: 100%; }
  .mira-excalidraw-shell .App-menu_top { padding-top: max(0.5rem, env(safe-area-inset-top)); }
  .mira-excalidraw-shell canvas { touch-action: none; }
  .mira-pencil-status {
    position: absolute; right: max(12px, env(safe-area-inset-right)); bottom: 9px;
    display: flex; align-items: center; gap: 6px; padding: 4px 8px;
    border-radius: 999px; color: rgba(74, 70, 62, .64); background: rgba(250, 249, 246, .72);
    backdrop-filter: blur(10px); font: 600 9px/1 ui-monospace, SFMono-Regular, monospace;
    letter-spacing: .12em; pointer-events: none;
  }
  .mira-pencil-status i { width: 5px; height: 5px; border-radius: 50%; background: #c86f4a; }
`;

const ERROR_STYLES = `
  .mira-drawing-error { box-sizing: border-box; display: grid; place-items: center; width: 100%; height: 100%;
    padding: 24px; color: #25231f; background: #f4f1e9; font-family: ui-rounded, system-ui, sans-serif; }
  .mira-drawing-error-card { max-width: 460px; padding: 28px; border: 1px solid #d8d2c5; border-radius: 18px;
    background: #fffdf8; box-shadow: 0 18px 60px rgba(52, 46, 36, .1); }
  .mira-drawing-error span { color: #bd6543; font: 700 10px/1 ui-monospace, monospace; letter-spacing: .16em; }
  .mira-drawing-error h1 { margin: 12px 0 8px; font-size: 22px; }
  .mira-drawing-error p { margin: 0; color: #69645b; line-height: 1.65; }
  .mira-drawing-error .mira-drawing-error-hint { margin-top: 12px; font-size: 13px; }
  .mira-drawing-repair { margin-top: 20px; border: 1px solid #bd6543; border-radius: 10px; padding: 9px 12px; color: #fff; background: #bd6543; font: 650 13px/1.2 ui-rounded, system-ui, sans-serif; cursor: pointer; }
  .mira-drawing-repair:focus-visible { outline: 2px solid #4b8dff; outline-offset: 2px; }
  .mira-drawing-error-feedback { margin-top: 12px !important; font-size: 12px; }
`;
