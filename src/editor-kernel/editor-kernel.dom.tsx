"use dom";

import "../formats/excalidraw/excalidraw-asset-path";

import { Editor } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { redo as codeMirrorRedo, undo as codeMirrorUndo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { codeLanguageForPath } from "../formats/code-language";
import {
  bufferCompositionUpdate,
  commitComposition,
  createCompositionBuffer,
  type CompositionBuffer,
} from "./editor-composition";
import { shouldApplyIncomingSelection } from "./editor-focus-policy";
import { recordEditorFocusDiagnosticEvent } from "./editor-focus-diagnostics";
import { editorRuntimeErrorMessage, isRecoverableEditorRuntimeError } from "./editor-runtime-error";

import {
  createEditorSaveRequestedMessage,
  shouldStartEditorFlush,
  type EditorFlushRequest,
} from "../editor-bridge/editor-flush";
import {
  createEditorChangeMessage,
  createEditorReadyMessage,
  createEditorSelectionChangeMessage,
} from "../editor-bridge/editor-message-builder";
import { parseEditorMessage } from "../editor-bridge/editor-message";
import type { EditorMessage, EditorSavedMessage } from "../editor-bridge/editor-message";
import { assembleDocumentOpenTransfer } from "../editor-bridge/document-open-transfer";
import { createIncrementalTextChange, type EditorBridgeBase } from "../editor-bridge/text-change";
import type { EditorMode } from "../session/document-session";
import { formatCjkSpacing } from "../markdown/cjk-format";
import { renderedBlockMarkdownOffset } from "./editor-kernel-state";
import { createExtendedMarkdownExtensions } from "./extended-markdown";
import { HighlightedCodeBlock } from "./highlighted-code-block";
import ExcalidrawEditor from "../formats/excalidraw/excalidraw-editor";

export type EditorCommandName =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "heading"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "code-block"
  | "table"
  | "table-row-before"
  | "table-row-after"
  | "table-row-delete"
  | "table-column-before"
  | "table-column-after"
  | "table-column-delete"
  | "table-delete"
  | "link"
  | "wiki-link"
  | "image"
  | "format-cjk"
  | "find"
  | "replace-document";

export type EditorCommand = Readonly<{
  id: number;
  name: EditorCommandName;
  content?: string;
}>;

type KernelEditorMode = Extract<EditorMode, "wysiwyg" | "source" | "reading">;

export type EditorKernelProps = Readonly<{
  sessionId: string;
  documentId: string;
  markdown: string;
  revision: number;
  selection: Selection;
  mode: KernelEditorMode;
  formatId: string;
  path: string;
  readOnly: boolean;
  themeMode: "light" | "dark";
  locale: "en" | "zh-CN";
  editorFontSize: number;
  editorLineHeight: number;
  showLineNumbers: boolean;
  wordWrap: boolean;
  localResources: Readonly<Record<string, string>>;
  /**
   * Monotonic revision of `localResources`, advanced by the native side only when
   * the resolved resource values change. The Expo DOM bridge re-serializes props
   * on every native render, so the map itself arrives with a fresh identity each
   * push and cannot be used to decide whether the editor must be rebuilt.
   */
  localResourceRevision: number;
  command: EditorCommand | null;
  flushRequest: EditorFlushRequest | null;
  documentOpenMessages: readonly EditorMessage[];
  documentSavedMessage: EditorSavedMessage | null;
  onSnapshot: (message: unknown) => Promise<void>;
  onProtocolMessage: (message: unknown) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  onOpenWiki: (target: string) => Promise<void>;
  onPickAttachment: () => Promise<string | null>;
  onShareExport: (name: string, format: "png" | "svg", contents: string) => Promise<boolean>;
  onRendererError: (message: string) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}>;

type Selection = Readonly<{ anchor: number; head: number }>;
type PendingComposition = Readonly<{
  markdown: string;
  selection: Selection;
  mode: KernelEditorMode;
}>;

const REMOTE_URL = /^https?:\/\//i;

function createSafeImage(getLocalResources: () => Readonly<Record<string, string>>) {
  return TiptapImage.extend({
    addNodeView() {
      return ({ node }) => {
        const source = typeof node.attrs.src === "string" ? node.attrs.src : "";
        if (REMOTE_URL.test(source)) {
          const placeholder = document.createElement("span");
          placeholder.className = "remote-media";
          try {
            placeholder.textContent = `Remote image: ${new URL(source).host}`;
          } catch {
            placeholder.textContent = "Remote image";
          }
          return { dom: placeholder };
        }

        const image = document.createElement("img");
        image.src = getLocalResources()[source] ?? source;
        image.alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
        image.loading = "lazy";
        return { dom: image };
      };
    },
  });
}

function createEditorExtensions(getLocalResources: () => Readonly<Record<string, string>>) {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
    }),
    HighlightedCodeBlock,
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
    createSafeImage(getLocalResources).configure({ allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: false }),
    ...createExtendedMarkdownExtensions(),
  ];
}

function selectionFromCodeMirror(view: EditorView): Selection {
  const range = view.state.selection.main;
  return Object.freeze({ anchor: range.anchor, head: range.head });
}

function selectionFromTiptap(editor: Editor, markdown: string, preferredOffset: number): Selection {
  const blockText = editor.state.selection.$from.parent.textContent;
  const offset = renderedBlockMarkdownOffset(markdown, blockText, preferredOffset);
  return Object.freeze({ anchor: offset, head: offset });
}

function wrapCodeMirrorSelection(view: EditorView, marker: string, closingMarker = marker): void {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const insertion = `${marker}${selected || "text"}${closingMarker}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: insertion },
    selection: {
      anchor: range.from + marker.length,
      head: range.from + insertion.length - closingMarker.length,
    },
  });
  view.focus();
}

function prefixCodeMirrorLine(view: EditorView, prefix: string): void {
  const position = view.state.selection.main.head;
  const line = view.state.doc.lineAt(position);
  view.dispatch({ changes: { from: line.from, insert: prefix } });
  view.focus();
}

function replaceCodeMirrorSelection(view: EditorView, insertion: string): void {
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: insertion },
    selection: { anchor: range.from + insertion.length },
  });
  view.focus();
}

function installContentSecurityPolicy(): () => void {
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src data: blob: file: content:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "media-src data: blob: file: content:",
    "frame-src 'none'",
  ].join("; ");
  document.head.append(meta);
  return () => meta.remove();
}

function blockWindowOpen(): () => void {
  const blocked: () => null = () => null;
  const previousOpen = window.open;
  try {
    window.open = blocked;
  } catch {
    // Some WebView runtimes expose window.open as read-only; CSP frame-src blocks popups anyway.
  }
  return () => {
    try {
      window.open = previousOpen;
    } catch {
      // Restoring a read-only binding is not possible; CSP remains the enforcement boundary.
    }
  };
}

export default function EditorKernel(props: EditorKernelProps) {
  const onRendererErrorRef = useRef(props.onRendererError);
  useEffect(() => {
    onRendererErrorRef.current = props.onRendererError;
  }, [props.onRendererError]);
  useEffect(() => {
    let reported = false;
    const report = (input: unknown, preventDefault: () => void) => {
      if (reported || !isRecoverableEditorRuntimeError(input)) return;
      reported = true;
      preventDefault();
      const message = editorRuntimeErrorMessage(input);
      void onRendererErrorRef.current(message).catch(() => undefined);
    };
    const handleError = (event: ErrorEvent) =>
      report(event.error ?? event.message, () => event.preventDefault());
    const handleUnhandledRejection = (event: PromiseRejectionEvent) =>
      report(event.reason, () => event.preventDefault());
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (props.formatId === "excalidraw") {
    return (
      <ExcalidrawEditor
        documentId={props.documentId}
        flushRequest={props.flushRequest}
        locale={props.locale}
        onOpenLink={async (link) => {
          const wiki = link.match(/^\[\[([\s\S]+?)\]\]$/);
          if (wiki?.[1]) {
            await props.onOpenWiki(wiki[1].split("|", 1)[0] ?? wiki[1]);
            return;
          }
          await props.onOpenExternal(link);
        }}
        onProtocolMessage={props.onProtocolMessage}
        onShareExport={props.onShareExport}
        onSnapshot={props.onSnapshot}
        path={props.path}
        revision={props.revision}
        sessionId={props.sessionId}
        source={props.markdown}
        themeMode={props.themeMode}
      />
    );
  }
  return <TextEditorKernel {...props} />;
}

function TextEditorKernel({
  sessionId,
  documentId,
  markdown,
  revision,
  selection,
  mode,
  formatId,
  path,
  readOnly,
  themeMode,
  editorFontSize,
  editorLineHeight,
  showLineNumbers,
  wordWrap,
  localResources,
  localResourceRevision,
  command,
  flushRequest,
  documentOpenMessages,
  documentSavedMessage,
  onSnapshot,
  onProtocolMessage,
  onOpenExternal,
  onOpenWiki,
  onPickAttachment,
}: EditorKernelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tiptapRef = useRef<Editor | null>(null);
  const codeMirrorRef = useRef<EditorView | null>(null);
  /** Tracks DOM focus ownership inside the kernel. While true, the editor owns
   * selection; incoming native selections are echoes and must not yank the
   * cursor (Markdown offsets and ProseMirror positions differ). */
  const focusedRef = useRef(false);
  const bridgeBaseRef = useRef<EditorBridgeBase>(
    Object.freeze({ sessionId, documentId, revision, markdown }),
  );
  const modeRef = useRef(mode);
  const selectionRef = useRef(selection);
  const openExternalRef = useRef(onOpenExternal);
  const openWikiRef = useRef(onOpenWiki);
  const pickAttachmentRef = useRef(onPickAttachment);
  /**
   * Props that cross the Expo DOM bridge arrive with a new identity on every
   * native render, so anything an editor-instance effect needs at call time is
   * read through a ref instead of being listed as a dependency. Listing them
   * would destroy and rebuild Tiptap/CodeMirror on every push, which resets DOM
   * focus ownership and discards the pending IME composition buffer.
   */
  const localResourcesRef = useRef(localResources);
  const protocolMessageRef = useRef(onProtocolMessage);
  const flushRequestRef = useRef(flushRequest);
  const handledFlushRequestIdRef = useRef<number | null>(null);
  const commandIdRef = useRef(0);
  const bridgeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const compositionBufferRef =
    useRef<CompositionBuffer<PendingComposition>>(createCompositionBuffer());
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const savedRevisionRef = useRef<Readonly<{ revision: number; contentHash: string }> | null>(null);

  const isMarkdown = formatId === "markdown";
  // Only the request *identity value* may drive the flush effect. The request
  // object itself is re-serialized on every bridge push, and re-running the
  // effect would abort the in-flight flush through its cleanup, leaving the
  // native side waiting for an acknowledgement that never arrives.
  const flushRequestId = flushRequest?.requestId ?? null;
  // Memoized so the editor-instance effect sees a stable identity:
  // `codeLanguageForPath` builds a fresh CodeMirror `Language` on every call.
  const codeLanguage = useMemo(
    () => (formatId === "code" ? codeLanguageForPath(path) : null),
    [formatId, path],
  );
  // Captured once so the component-lifecycle effect stays dependency-free while
  // still reporting the identity of the mounted session.
  const mountIdentityRef = useRef<Readonly<{ mode: KernelEditorMode; documentId: string }>>(
    Object.freeze({ mode, documentId }),
  );
  useEffect(() => {
    mountedRef.current = true;
    const identity = mountIdentityRef.current;
    recordEditorFocusDiagnosticEvent(
      "kernel.mount",
      `mode:${identity.mode} doc:${identity.documentId}`,
    );
    return () => {
      mountedRef.current = false;
      recordEditorFocusDiagnosticEvent("kernel.unmount", `mode:${modeRef.current}`);
    };
    // Component lifecycle only: editor-instance recreation on mode switches is
    // tracked separately as "mode.recreate" in the initialization effect.
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Track focus ownership on the host element. `focusin`/`focusout` bubble,
    // so this covers the Tiptap contenteditable, the CodeMirror content DOM and
    // any auxiliary controls without leaking per-instance listeners.
    const handleFocusIn = (): void => {
      focusedRef.current = true;
      recordEditorFocusDiagnosticEvent("editor.focus");
    };
    const handleFocusOut = (): void => {
      focusedRef.current = false;
      recordEditorFocusDiagnosticEvent("editor.blur");
    };
    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("focusout", handleFocusOut);
    return () => {
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("focusout", handleFocusOut);
    };
  }, []);
  const reportBridgeError = useCallback((message: string | null): void => {
    queueMicrotask(() => {
      if (mountedRef.current) setBridgeError(message);
    });
  }, []);
  const emitSnapshot = useCallback(
    (nextMarkdown: string, nextSelection: Selection, nextMode: KernelEditorMode): void => {
      const base = bridgeBaseRef.current;
      const changes = createIncrementalTextChange(base.markdown, nextMarkdown);
      if (changes.length === 0) return;
      const baseRevision = base.revision;
      const nextRevision = baseRevision + 1;
      bridgeBaseRef.current = Object.freeze({
        ...base,
        revision: nextRevision,
        markdown: nextMarkdown,
      });
      modeRef.current = nextMode;
      const message = createEditorChangeMessage({
        sessionId: base.sessionId,
        documentId: base.documentId,
        baseRevision,
        revision: nextRevision,
        mode: nextMode,
        changes,
        selection: nextSelection,
      });
      bridgeQueueRef.current = bridgeQueueRef.current
        .then(() => (mountedRef.current ? onSnapshot(message) : undefined))
        .then(() => {
          if (mountedRef.current) setBridgeError(null);
        })
        .catch(() => {
          if (mountedRef.current) {
            setBridgeError("The native editor bridge rejected this revision.");
          }
        });
    },
    [onSnapshot],
  );
  const emitSnapshotRef = useRef(emitSnapshot);

  const emitSelectionChange = useCallback(
    (nextSelection: Selection): void => {
      const base = bridgeBaseRef.current;
      const message = createEditorSelectionChangeMessage({
        sessionId: base.sessionId,
        documentId: base.documentId,
        revision: base.revision,
        ranges: [nextSelection],
      });
      bridgeQueueRef.current = bridgeQueueRef.current
        .then(() => (mountedRef.current ? onProtocolMessage(message) : undefined))
        .then(() => {
          if (mountedRef.current) setBridgeError(null);
        })
        .catch(() => {
          if (mountedRef.current) {
            setBridgeError("The native editor bridge rejected this selection.");
          }
        });
    },
    [onProtocolMessage],
  );
  const emitSelectionChangeRef = useRef(emitSelectionChange);

  const queueEditorUpdate = useCallback((pending: PendingComposition, composing: boolean): void => {
    const result = bufferCompositionUpdate(compositionBufferRef.current, pending, composing);
    compositionBufferRef.current = result.buffer;
    if (result.emission !== null) {
      emitSnapshotRef.current(
        result.emission.markdown,
        result.emission.selection,
        result.emission.mode,
      );
    }
  }, []);

  const commitEditorComposition = useCallback((): void => {
    const result = commitComposition(compositionBufferRef.current);
    compositionBufferRef.current = result.buffer;
    if (result.emission !== null) {
      emitSnapshotRef.current(
        result.emission.markdown,
        result.emission.selection,
        result.emission.mode,
      );
    }
  }, []);

  useEffect(() => installContentSecurityPolicy(), []);
  useEffect(() => blockWindowOpen(), []);

  useEffect(() => {
    const parsed = assembleDocumentOpenTransfer(documentOpenMessages);
    if (!parsed.ok) {
      reportBridgeError("The native document-open message was invalid.");
      return;
    }
    const incoming = parsed.value;
    const current = bridgeBaseRef.current;
    const sameIdentity =
      current.sessionId === incoming.sessionId && current.documentId === incoming.documentId;
    if (sameIdentity && incoming.revision < current.revision) return;
    const contentChanged = current.markdown !== incoming.content;
    bridgeBaseRef.current = Object.freeze({
      sessionId: incoming.sessionId,
      documentId: incoming.documentId,
      revision: incoming.revision,
      markdown: incoming.content,
    });
    const applySelection = shouldApplyIncomingSelection({
      editorFocused: focusedRef.current,
      contentChanged,
    });
    recordEditorFocusDiagnosticEvent(
      applySelection ? "selection.apply" : "selection.skip",
      `contentChanged:${contentChanged} focused:${focusedRef.current}`,
    );
    const tiptap = tiptapRef.current;
    if (tiptap) {
      if (contentChanged) {
        tiptap.commands.setContent(incoming.content, {
          contentType: "markdown",
          emitUpdate: false,
        });
      }
      if (applySelection) {
        const from = Math.max(
          1,
          Math.min(incoming.selection.anchor, tiptap.state.doc.content.size),
        );
        const to = Math.max(1, Math.min(incoming.selection.head, tiptap.state.doc.content.size));
        if (tiptap.state.selection.anchor !== from || tiptap.state.selection.head !== to) {
          tiptap.commands.setTextSelection({ from, to });
        }
      }
    }
    const codeMirror = codeMirrorRef.current;
    if (codeMirror) {
      const anchor = Math.min(incoming.selection.anchor, incoming.content.length);
      const head = Math.min(incoming.selection.head, incoming.content.length);
      if (
        applySelection &&
        (contentChanged ||
          codeMirror.state.selection.main.anchor !== anchor ||
          codeMirror.state.selection.main.head !== head)
      ) {
        codeMirror.dispatch({
          ...(contentChanged
            ? { changes: { from: 0, to: codeMirror.state.doc.length, insert: incoming.content } }
            : {}),
          selection: { anchor, head },
        });
      }
    }
  }, [documentOpenMessages, reportBridgeError]);

  useEffect(() => {
    if (documentSavedMessage === null) return;
    const parsed = parseEditorMessage(documentSavedMessage);
    if (!parsed.ok || parsed.value.type !== "document.saved") {
      reportBridgeError("The native saved acknowledgement was invalid.");
      return;
    }
    const saved = parsed.value;
    const base = bridgeBaseRef.current;
    if (
      saved.sessionId !== base.sessionId ||
      saved.documentId !== base.documentId ||
      saved.revision > base.revision
    ) {
      reportBridgeError("The native saved acknowledgement did not match this editor revision.");
      return;
    }
    savedRevisionRef.current = Object.freeze({
      revision: saved.revision,
      contentHash: saved.contentHash,
    });
    reportBridgeError(null);
  }, [documentSavedMessage, reportBridgeError]);

  // Keeps every call-time value the editor-instance, ready and flush effects
  // need in sync without turning bridge-unstable prop identities into effect
  // dependencies. This effect is declared before them so the refs are populated
  // by the time they run on mount.
  useEffect(() => {
    selectionRef.current = selection;
    openExternalRef.current = onOpenExternal;
    openWikiRef.current = onOpenWiki;
    pickAttachmentRef.current = onPickAttachment;
    emitSnapshotRef.current = emitSnapshot;
    emitSelectionChangeRef.current = emitSelectionChange;
    localResourcesRef.current = localResources;
    protocolMessageRef.current = onProtocolMessage;
    flushRequestRef.current = flushRequest;
  }, [
    emitSelectionChange,
    emitSnapshot,
    flushRequest,
    localResources,
    onOpenExternal,
    onOpenWiki,
    onPickAttachment,
    onProtocolMessage,
    selection,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    recordEditorFocusDiagnosticEvent("mode.recreate", `mode:${mode}`);
    container.replaceChildren();
    tiptapRef.current?.destroy();
    codeMirrorRef.current?.destroy();
    tiptapRef.current = null;
    codeMirrorRef.current = null;
    // The previous editor DOM node is gone; without a focused child the kernel
    // does not own focus until the next user tap.
    focusedRef.current = false;
    modeRef.current = mode;
    compositionBufferRef.current = createCompositionBuffer();

    if (mode !== "source" && isMarkdown) {
      const editor = new Editor({
        element: container,
        extensions: createEditorExtensions(() => localResourcesRef.current),
        content: bridgeBaseRef.current.markdown,
        contentType: "markdown",
        editable: !readOnly,
        editorProps: {
          attributes: {
            class: "tiptap-editor",
            spellcheck: mode === "reading" ? "false" : "true",
            "aria-label": mode === "reading" ? "Markdown reading view" : "WYSIWYG Markdown editor",
          },
          handleClick(_view, _position, event) {
            const target = event.target;
            const wikiTarget =
              target instanceof HTMLElement
                ? target.closest<HTMLElement>("[data-wiki-link]")
                : null;
            if (wikiTarget?.dataset.wikiLink) {
              event.preventDefault();
              void openWikiRef.current(wikiTarget.dataset.wikiLink);
              return true;
            }
            if (target instanceof HTMLAnchorElement && target.href) {
              event.preventDefault();
              void openExternalRef.current(target.href);
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            compositionend() {
              queueMicrotask(commitEditorComposition);
              return false;
            },
          },
        },
        onUpdate({ editor: activeEditor }) {
          const nextMarkdown = activeEditor.getMarkdown();
          const sourceSelection = selectionFromTiptap(
            activeEditor,
            nextMarkdown,
            selectionRef.current.head,
          );
          selectionRef.current = sourceSelection;
          queueEditorUpdate(
            {
              markdown: nextMarkdown,
              selection: sourceSelection,
              mode: "wysiwyg",
            },
            activeEditor.view.composing,
          );
        },
        onSelectionUpdate({ editor: activeEditor }) {
          const next = selectionFromTiptap(
            activeEditor,
            bridgeBaseRef.current.markdown,
            selectionRef.current.head,
          );
          selectionRef.current = next;
          emitSelectionChangeRef.current(next);
        },
      });
      tiptapRef.current = editor;
      editor.commands.setTextSelection({
        from: Math.max(1, Math.min(selectionRef.current.anchor, editor.state.doc.content.size)),
        to: Math.max(1, Math.min(selectionRef.current.head, editor.state.doc.content.size)),
      });
    } else {
      const range = Object.freeze({
        from: 0,
        to: bridgeBaseRef.current.markdown.length,
        markdown: bridgeBaseRef.current.markdown,
      });
      const sourceSelection =
        mode === "source"
          ? {
              anchor: Math.min(selectionRef.current.anchor, range.markdown.length),
              head: Math.min(selectionRef.current.head, range.markdown.length),
            }
          : null;
      const state = EditorState.create({
        doc: range.markdown,
        ...(sourceSelection ? { selection: sourceSelection } : {}),
        extensions: [
          basicSetup,
          ...(isMarkdown ? [markdownLanguage()] : []),
          ...(codeLanguage === null ? [] : [codeLanguage]),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          keymap.of([]),
          ...(wordWrap ? [EditorView.lineWrapping] : []),
          EditorView.theme({
            "&": {
              height: "100%",
              color: themeMode === "dark" ? "#F2F4F8" : "#202124",
              backgroundColor: themeMode === "dark" ? "#191D25" : "#FFFFFF",
            },
            ".cm-scroller": {
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
              fontSize: `${editorFontSize}px`,
              lineHeight: String(editorLineHeight),
            },
            ".cm-content": { padding: "20px 18px 120px" },
            ".cm-gutters": {
              backgroundColor: themeMode === "dark" ? "#222834" : "#F7F8FA",
              color: themeMode === "dark" ? "#A6ADBA" : "#68707C",
              border: "none",
            },
            ".cm-activeLine": {
              backgroundColor: themeMode === "dark" ? "#263044" : "#F2F5FA",
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              queueEditorUpdate(
                {
                  markdown: update.state.doc.toString(),
                  selection: selectionFromCodeMirror(update.view),
                  mode: "source",
                },
                update.view.composing,
              );
            } else if (update.selectionSet) {
              emitSelectionChangeRef.current(selectionFromCodeMirror(update.view));
            }
          }),
          EditorView.domEventHandlers({
            compositionend() {
              queueMicrotask(commitEditorComposition);
              return false;
            },
          }),
        ],
      });
      codeMirrorRef.current = new EditorView({ state, parent: container });
    }

    return () => {
      tiptapRef.current?.destroy();
      codeMirrorRef.current?.destroy();
      tiptapRef.current = null;
      codeMirrorRef.current = null;
    };
    // Structural inputs only. `localResourceRevision` stands in for the resource
    // map so a rebuild happens when resource *values* change but not when the
    // bridge re-serializes an unchanged map; node views read the live map from
    // `localResourcesRef`. Callbacks are reached through refs for the same reason.
  }, [
    commitEditorComposition,
    codeLanguage,
    documentId,
    editorFontSize,
    editorLineHeight,
    formatId,
    isMarkdown,
    localResourceRevision,
    mode,
    queueEditorUpdate,
    readOnly,
    sessionId,
    themeMode,
    wordWrap,
  ]);

  useEffect(() => {
    const base = bridgeBaseRef.current;
    const message = createEditorReadyMessage({
      sessionId: base.sessionId,
      documentId: base.documentId,
    });
    void protocolMessageRef.current(message).catch(() => {
      if (mountedRef.current) {
        setBridgeError("The native editor bridge rejected the editor session.");
      }
    });
    // Announced once per editor session identity. `onProtocolMessage` must stay
    // out of the dependencies: the bridge hands the kernel a new function
    // identity on every native render, and the native side advances its editor
    // ready version for each announcement, so depending on it forms a render
    // feedback loop that rebuilds the editor continuously.
  }, [documentId, sessionId]);

  useEffect(() => {
    const request = flushRequestRef.current;
    if (
      request === null ||
      !shouldStartEditorFlush({
        handledRequestId: handledFlushRequestIdRef.current,
        requestId: flushRequestId,
      })
    ) {
      return;
    }
    handledFlushRequestIdRef.current = request.requestId;
    let active = true;

    const flush = async (): Promise<void> => {
      // Commit any in-progress IME composition so the flushed snapshot is
      // complete. The kernel must NOT blur the editor here: on Android a
      // programmatic blur detaches the WebView from the native window-focus
      // system, and the next tap then flashes the keyboard and immediately
      // loses focus. Keyboard visibility is owned by the native shell
      // (Keyboard.dismiss on explicit user actions), never by the flush path.
      recordEditorFocusDiagnosticEvent("flush.begin", `request:${request.requestId}`);
      commitEditorComposition();
      recordEditorFocusDiagnosticEvent("flush.commit-composition");
      await Promise.resolve();
      await bridgeQueueRef.current;
      if (!active) return;
      recordEditorFocusDiagnosticEvent("flush.drain");
      const message = createEditorSaveRequestedMessage(request, bridgeBaseRef.current);
      if (!message.ok) throw new Error(message.error.code);
      await protocolMessageRef.current(message.value);
      recordEditorFocusDiagnosticEvent("flush.send", `request:${request.requestId}`);
      if (active) setBridgeError(null);
    };

    void flush().catch(() => {
      if (active) setBridgeError("The editor could not flush its latest changes.");
    });
    return () => {
      active = false;
    };
    // Driven by the request id value, never by the request object identity: a
    // bridge push of an unchanged request would otherwise re-run this effect,
    // and its cleanup would abandon the in-flight flush so the native side waits
    // for an acknowledgement that never arrives and the save times out.
  }, [commitEditorComposition, flushRequestId]);

  useEffect(() => {
    if (!command || command.id <= commandIdRef.current) return;
    commandIdRef.current = command.id;
    const tiptap = tiptapRef.current;
    const codeMirror = codeMirrorRef.current;
    if (command.name === "find") {
      queueMicrotask(() => setFindVisible(true));
      return;
    }
    if (readOnly) return;

    if (tiptap) {
      const chain = tiptap.chain().focus();
      if (command.name === "undo") chain.undo().run();
      if (command.name === "redo") chain.redo().run();
      if (command.name === "bold") chain.toggleBold().run();
      if (command.name === "italic") chain.toggleItalic().run();
      if (command.name === "strike") chain.toggleStrike().run();
      if (command.name === "code") chain.toggleCode().run();
      if (command.name === "heading") chain.toggleHeading({ level: 2 }).run();
      if (command.name.startsWith("heading-")) {
        const level = Number(command.name.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6;
        chain.toggleHeading({ level }).run();
      }
      if (command.name === "bullet-list") chain.toggleBulletList().run();
      if (command.name === "ordered-list") chain.toggleOrderedList().run();
      if (command.name === "task-list") chain.toggleTaskList().run();
      if (command.name === "quote") chain.toggleBlockquote().run();
      if (command.name === "code-block") chain.toggleCodeBlock().run();
      if (command.name === "table")
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (command.name === "table-row-before") chain.addRowBefore().run();
      if (command.name === "table-row-after") chain.addRowAfter().run();
      if (command.name === "table-row-delete") chain.deleteRow().run();
      if (command.name === "table-column-before") chain.addColumnBefore().run();
      if (command.name === "table-column-after") chain.addColumnAfter().run();
      if (command.name === "table-column-delete") chain.deleteColumn().run();
      if (command.name === "table-delete") chain.deleteTable().run();
      if (command.name === "link") {
        const href = window.prompt("Link URL", "https://");
        if (href) chain.setLink({ href }).run();
      }
      if (command.name === "wiki-link") chain.insertContent("[[Page]]").run();
      if (command.name === "image") {
        void pickAttachmentRef.current().then((source) => {
          if (source && !REMOTE_URL.test(source)) {
            tiptap.chain().focus().setImage({ src: source }).run();
          }
        });
      }
      if (command.name === "format-cjk") {
        const formatted = formatCjkSpacing(tiptap.getMarkdown());
        tiptap.commands.setContent(formatted, { contentType: "markdown", emitUpdate: true });
      }
      return;
    }

    if (!codeMirror) return;
    if (command.name === "replace-document" && command.content !== undefined) {
      codeMirror.dispatch({
        changes: { from: 0, to: codeMirror.state.doc.length, insert: command.content },
      });
      codeMirror.focus();
      return;
    }
    if (command.name === "undo") codeMirrorUndo(codeMirror);
    if (command.name === "redo") codeMirrorRedo(codeMirror);
    if (command.name === "bold") wrapCodeMirrorSelection(codeMirror, "**");
    if (command.name === "italic") wrapCodeMirrorSelection(codeMirror, "_");
    if (command.name === "strike") wrapCodeMirrorSelection(codeMirror, "~~");
    if (command.name === "code") wrapCodeMirrorSelection(codeMirror, "`");
    if (command.name === "heading") prefixCodeMirrorLine(codeMirror, "## ");
    if (command.name.startsWith("heading-")) {
      prefixCodeMirrorLine(codeMirror, `${"#".repeat(Number(command.name.slice(-1)))} `);
    }
    if (command.name === "bullet-list") prefixCodeMirrorLine(codeMirror, "- ");
    if (command.name === "ordered-list") prefixCodeMirrorLine(codeMirror, "1. ");
    if (command.name === "task-list") prefixCodeMirrorLine(codeMirror, "- [ ] ");
    if (command.name === "quote") prefixCodeMirrorLine(codeMirror, "> ");
    if (command.name === "code-block") {
      const range = codeMirror.state.selection.main;
      const selected = codeMirror.state.sliceDoc(range.from, range.to) || "code";
      replaceCodeMirrorSelection(codeMirror, `\`\`\`\n${selected}\n\`\`\``);
    }
    if (command.name === "table") {
      replaceCodeMirrorSelection(
        codeMirror,
        "| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |",
      );
    }
    if (command.name === "link") {
      const range = codeMirror.state.selection.main;
      const label = codeMirror.state.sliceDoc(range.from, range.to) || "link";
      const insertion = `[${label}](https://)`;
      codeMirror.dispatch({ changes: { from: range.from, to: range.to, insert: insertion } });
      codeMirror.focus();
    }
    if (command.name === "wiki-link") wrapCodeMirrorSelection(codeMirror, "[[", "]]");
    if (command.name === "image") {
      void pickAttachmentRef.current().then((source) => {
        if (source && !REMOTE_URL.test(source) && codeMirrorRef.current) {
          replaceCodeMirrorSelection(codeMirrorRef.current, `![image](${source})`);
        }
      });
    }
    if (command.name === "format-cjk") {
      const range = codeMirror.state.selection.main;
      const wholeDocument = range.empty;
      const from = wholeDocument ? 0 : range.from;
      const to = wholeDocument ? codeMirror.state.doc.length : range.to;
      const source = codeMirror.state.sliceDoc(from, to);
      codeMirror.dispatch({ changes: { from, to, insert: formatCjkSpacing(source) } });
      codeMirror.focus();
    }
  }, [command, readOnly]);

  function findNext(): void {
    const view = codeMirrorRef.current;
    if (!view || !findQuery) return;
    const contents = view.state.doc.toString();
    const from = view.state.selection.main.to;
    const found = contents.indexOf(findQuery, from);
    const index = found >= 0 ? found : contents.indexOf(findQuery);
    if (index < 0) return;
    view.dispatch({
      selection: { anchor: index, head: index + findQuery.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  function replaceCurrent(): void {
    const view = codeMirrorRef.current;
    if (!view || !findQuery) return;
    const range = view.state.selection.main;
    if (view.state.sliceDoc(range.from, range.to) !== findQuery) {
      findNext();
      return;
    }
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: replaceQuery },
      selection: { anchor: range.from + replaceQuery.length },
    });
    findNext();
  }

  function replaceAll(): void {
    const view = codeMirrorRef.current;
    if (!view || !findQuery) return;
    const contents = view.state.doc.toString();
    const next = contents.split(findQuery).join(replaceQuery);
    if (next !== contents)
      view.dispatch({ changes: { from: 0, to: contents.length, insert: next } });
  }

  return (
    <main className={`kernel-shell kernel-${mode}`}>
      <style>{kernelStyles(themeMode, editorFontSize, editorLineHeight, showLineNumbers)}</style>
      <div className="editor-host" ref={containerRef} />
      {findVisible && mode === "source" ? (
        <div aria-label="Find and replace" className="find-panel" role="search">
          <input
            aria-label="Find text"
            onChange={(event) => setFindQuery(event.target.value)}
            placeholder="Find"
            value={findQuery}
          />
          <input
            aria-label="Replacement text"
            onChange={(event) => setReplaceQuery(event.target.value)}
            placeholder="Replace"
            value={replaceQuery}
          />
          <button type="button" onClick={findNext}>
            Next
          </button>
          <button type="button" onClick={replaceCurrent}>
            Replace
          </button>
          <button type="button" onClick={replaceAll}>
            All
          </button>
          <button
            aria-label="Close find and replace"
            type="button"
            onClick={() => setFindVisible(false)}
          >
            ×
          </button>
        </div>
      ) : null}
      {bridgeError ? (
        <div className="bridge-error" role="alert">
          {bridgeError}
        </div>
      ) : null}
    </main>
  );
}

function kernelStyles(
  mode: "light" | "dark",
  fontSize: number,
  lineHeight: number,
  showLineNumbers: boolean,
): string {
  const readingLineHeight = Math.max(1.72, lineHeight);
  const palette =
    mode === "dark"
      ? {
          canvas: "#191D25",
          text: "#F2F4F8",
          muted: "#A6ADBA",
          divider: "#303744",
          surface: "#222834",
          readingCanvas: "#131820",
          readingPaper: "#1B2029",
          readingInset: "#232A35",
          readingAccent: "#7DCBFF",
        }
      : {
          canvas: "#FFFFFF",
          text: "#202124",
          muted: "#68707C",
          divider: "#D9DDE3",
          surface: "#F0F2F4",
          readingCanvas: "#F1EEE7",
          readingPaper: "#FFFDF8",
          readingInset: "#F4F0E7",
          readingAccent: "#2765A7",
        };
  return `
  :root { color-scheme: ${mode}; --canvas: ${palette.canvas}; --text: ${palette.text}; --muted: ${palette.muted}; --divider: ${palette.divider}; --surface: ${palette.surface}; --reading-canvas: ${palette.readingCanvas}; --reading-paper: ${palette.readingPaper}; --reading-inset: ${palette.readingInset}; --reading-accent: ${palette.readingAccent}; font-family: Inter, system-ui, -apple-system, sans-serif; }
  * { box-sizing: border-box; }
  html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: var(--canvas); }
  button, input, textarea { font: inherit; }
  .kernel-shell, .editor-host, .editor-host > .cm-editor { width: 100%; height: 100%; }
  .kernel-shell { position: relative; background: var(--canvas); color: var(--text); }
  .editor-host {
    min-width: 0;
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .tok-keyword, .tok-typeName, .tok-bool, .tok-null { color: #7c3aed; font-weight: 600; }
  .tok-string, .tok-regexp { color: #2274C7; }
  .tok-number { color: #b45309; }
  .tok-comment { color: var(--muted); font-style: italic; }
  .tok-variableName, .tok-propertyName { color: #1d4ed8; }
  .tok-function, .tok-definition { color: #0369a1; }
  .tok-operator, .tok-punctuation { color: var(--muted); }
  .hljs-keyword, .hljs-type, .hljs-literal, .hljs-built_in { color: #7c3aed; font-weight: 600; }
  .hljs-string, .hljs-regexp { color: #2274C7; }
  .hljs-number { color: #b45309; }
  .hljs-comment { color: var(--muted); font-style: italic; }
  .hljs-title, .hljs-title.function_, .hljs-attr, .hljs-property { color: #0369a1; }
  .tiptap-editor { min-height: 100%; outline: none; padding: 20px 18px 132px; color: var(--text); font-size: ${fontSize}px; line-height: ${lineHeight}; }
  ${showLineNumbers ? "" : ".cm-gutters { display: none; }"}
  .tiptap-editor > :first-child { margin-top: 0; }
  .tiptap-editor h1 { font-size: 1.8rem; line-height: 1.25; }
  .tiptap-editor h2 { font-size: 1.45rem; line-height: 1.3; }
  .tiptap-editor h3 { font-size: 1.2rem; line-height: 1.35; }
  .tiptap-editor blockquote { border-left: 3px solid #2765A7; color: #5f6873; margin-left: 0; padding-left: 14px; }
  .tiptap-editor pre { overflow-x: auto; border-radius: 6px; background: #f0f2f4; padding: 14px; }
  .tiptap-editor code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  .tiptap-editor table { width: 100%; border-collapse: collapse; overflow-x: auto; }
  .tiptap-editor th, .tiptap-editor td { border: 1px solid #d9dde3; padding: 8px; text-align: left; }
  .tiptap-editor img { max-width: 100%; height: auto; }
  .tiptap-editor .wiki-link { color: #2765A7; text-decoration: underline; text-decoration-style: dotted; cursor: pointer; }
  .tiptap-editor .wiki-embed { display: inline-flex; min-width: 12rem; align-items: center; justify-content: center;
    box-sizing: border-box; margin: .35rem .15rem; padding: 1.2rem 1rem; border: 1px solid var(--editor-divider);
    border-radius: .8rem; color: #315c6d; background: color-mix(in srgb, var(--editor-surface) 88%, #c86f4a 12%);
    font-weight: 700; cursor: pointer; }
  /* Math: keep KaTeX typographically close to modern LLM readers while remaining touch-friendly. */
  .tiptap-editor .math-node {
    box-sizing: border-box;
    color: var(--text);
    font-family: KaTeX_Main, "Times New Roman", serif;
  }
  .tiptap-editor .math-inline {
    display: inline-block;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    margin: 0 .08em;
    padding: 0;
    border-radius: 3px;
    background: color-mix(in srgb, var(--surface) 68%, transparent);
    vertical-align: -.08em;
    white-space: nowrap;
  }
  .tiptap-editor .math-inline .katex { white-space: nowrap; }
  .tiptap-editor .math-block {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    margin: 1.25em 0;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--divider) 76%, transparent);
    border-radius: 10px;
    background: var(--surface);
    text-align: center;
    line-height: 1.35;
    scrollbar-width: thin;
  }
  .tiptap-editor .math-block .katex-display {
    min-width: max-content;
    margin: 0;
  }
  .tiptap-editor .math-node[data-math-error="true"] {
    border-color: #b42318;
    background: color-mix(in srgb, #b42318 9%, var(--surface));
  }
  .tiptap-editor .math-node .katex-error,
  .tiptap-editor .math-render-fallback {
    color: #b42318;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: .9em;
    white-space: pre-wrap;
  }
  .tiptap-editor .extended-block { overflow-x: auto; border: 1px solid var(--divider); border-radius: 6px; background: var(--surface); padding: 12px; }
  .tiptap-editor .frontmatter-block { overflow: hidden; border: 0; border-left: 3px solid var(--divider); border-radius: 0; background: transparent; padding: 4px 8px; }
  .tiptap-editor .frontmatter-block::before { display: block; color: var(--muted); content: "Frontmatter metadata · edit in Source mode"; font-size: 11px; font-weight: 600; }
  .tiptap-editor .frontmatter-block pre { display: none; }
  .tiptap-editor .mermaid-fence svg { display: block; width: 100%; max-height: 420px; }
  .tiptap-editor .footnote-reference { color: #2765A7; }
  .kernel-reading, .kernel-reading .editor-host { background: var(--reading-canvas); }
  .kernel-reading .tiptap-editor {
    width: 100%;
    max-width: 760px;
    min-height: 100%;
    margin: 0 auto;
    padding: 32px 24px 168px;
    background: var(--reading-paper);
    color: var(--text);
    caret-color: transparent;
    cursor: default;
    font-family: ui-serif, "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", serif;
    font-size: ${fontSize + 1}px;
    line-height: ${readingLineHeight};
    letter-spacing: .012em;
    text-wrap: pretty;
  }
  .kernel-reading .tiptap-editor p { margin: 0 0 1.15em; }
  .kernel-reading .tiptap-editor h1,
  .kernel-reading .tiptap-editor h2,
  .kernel-reading .tiptap-editor h3 {
    margin-top: 1.7em;
    margin-bottom: .72em;
    color: var(--text);
    font-family: ui-sans-serif, system-ui, sans-serif;
    letter-spacing: -.015em;
  }
  .kernel-reading .tiptap-editor h1 { padding-bottom: .35em; border-bottom: 1px solid var(--divider); }
  .kernel-reading .tiptap-editor li { margin: .38em 0; }
  .kernel-reading .tiptap-editor blockquote {
    margin: 1.5em 0;
    border-left-color: var(--reading-accent);
    border-radius: 0 8px 8px 0;
    background: var(--reading-inset);
    color: var(--muted);
    padding: .8em 1em;
  }
  .kernel-reading .tiptap-editor pre,
  .kernel-reading .tiptap-editor .extended-block,
  .kernel-reading .tiptap-editor .math-block { background: var(--reading-inset); }
  .kernel-reading .tiptap-editor .math-block { margin: 1.65em 0; padding: 18px 12px; }
  .kernel-reading .tiptap-editor a,
  .kernel-reading .tiptap-editor .wiki-link { color: var(--reading-accent); text-underline-offset: .18em; }
  .kernel-reading .tiptap-editor img { display: block; margin: 1.6em auto; border-radius: 10px; }
  .kernel-reading .tiptap-editor hr { margin: 2.2em auto; border: 0; border-top: 1px solid var(--divider); }
  @media (min-width: 820px) {
    .kernel-reading .tiptap-editor { margin: 24px auto 48px; min-height: calc(100% - 72px); border: 1px solid var(--divider); border-radius: 12px; box-shadow: 0 18px 60px rgba(0,0,0,.12); padding-right: 56px; padding-left: 56px; }
  }
  .remote-media { display: block; border: 1px solid #d9dde3; border-radius: 6px; background: #f7f8fa; color: #68707c; padding: 12px; }
  .find-panel { position: absolute; top: 8px; right: 8px; left: 8px; z-index: 3; display: flex; gap: 5px; padding: 7px; border: 1px solid var(--divider); border-radius: 8px; background: var(--canvas); box-shadow: 0 2px 12px rgba(0,0,0,.14); }
  .find-panel input { min-width: 0; min-height: 42px; flex: 1; border: 1px solid var(--divider); border-radius: 6px; padding: 0 9px; color: var(--text); background: var(--canvas); }
  .find-panel button { min-width: 44px; min-height: 42px; border: 0; border-radius: 6px; padding: 0 9px; color: var(--text); background: var(--surface); font-weight: 600; }
  .bridge-error { position: absolute; left: 12px; right: 12px; bottom: 68px; border-radius: 6px; background: #b42318; color: #fff; padding: 10px 12px; font-size: 13px; }
`;
}
