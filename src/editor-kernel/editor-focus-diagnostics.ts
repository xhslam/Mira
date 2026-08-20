/**
 * Opt-in editor focus diagnostics for development environments.
 *
 * The kernel records a structured, sequence-numbered event stream covering
 * mount/unmount, DOM focus/blur, flush phases, selection application decisions
 * and document-open round trips. It is disabled by default so production
 * builds carry no logging overhead; enable it during device debugging with
 * `enableEditorFocusDiagnostics()` from the DOM console (or a temporary call in
 * the kernel) and observe `console.info("[inkstone-focus] ...")` lines through
 * `adb logcat` / the Metro logs.
 *
 * The event stream answers the five evidence questions required when triaging
 * a "first tap works, later taps lose focus" report:
 * 1. Who blurred the editor (only user taps produce DOM blur when the policy is
 *    followed; any `flush.blur` event means a regression).
 * 2. Whether the editor lost focus or was remounted (`kernel.mount` events).
 * 3. Whether the keyboard closed before the edit state exited.
 * 4. The event ordering difference between the first and the Nth session.
 * 5. Repeated listeners / stale instances (`kernel.mount` counts, `flush.*`
 *    duplication).
 */

export type EditorFocusDiagnosticKind =
  | "kernel.mount"
  | "kernel.unmount"
  | "editor.focus"
  | "editor.blur"
  | "selection.apply"
  | "selection.skip"
  | "flush.begin"
  | "flush.commit-composition"
  | "flush.drain"
  | "flush.send"
  | "mode.recreate"
  | "doc.open.apply"
  | "doc.open.skip";

export type EditorFocusDiagnosticEvent = Readonly<{
  sequence: number;
  kind: EditorFocusDiagnosticKind;
  /** Monotonic DOM time in milliseconds. */
  at: number;
  /** Optional identity, e.g. the focused element's role/class or the mode. */
  detail?: string;
}>;

const EVENT_LOG_PREFIX = "[inkstone-focus]";
const MAX_RETAINED_EVENTS = 500;

function createDisabledState(): Readonly<{
  enabled: boolean;
  events: readonly EditorFocusDiagnosticEvent[];
}> {
  return Object.freeze({ enabled: false, events: Object.freeze([]) });
}

/**
 * Immutable event log with bounded retention. Kept pure so it can be unit
 * tested without a DOM.
 */
export function recordEditorFocusDiagnostic(
  state: Readonly<{ enabled: boolean; events: readonly EditorFocusDiagnosticEvent[] }>,
  kind: EditorFocusDiagnosticKind,
  detail?: string,
): Readonly<{ enabled: boolean; events: readonly EditorFocusDiagnosticEvent[] }> {
  if (!state.enabled) return state;
  const event: EditorFocusDiagnosticEvent = Object.freeze({
    sequence: (state.events.at(-1)?.sequence ?? 0) + 1,
    kind,
    at: typeof performance !== "undefined" ? performance.now() : Date.now(),
    ...(detail === undefined ? {} : { detail }),
  });
  const events = Object.freeze([...state.events, event].slice(-MAX_RETAINED_EVENTS));
  const output = Object.freeze({ enabled: state.enabled, events });
  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info(
      EVENT_LOG_PREFIX,
      `${event.sequence} ${event.kind}${event.detail === undefined ? "" : ` ${event.detail}`}`,
    );
  }
  return output;
}

export function enableEditorFocusDiagnostics(): void {
  editorFocusDiagnostics = Object.freeze({
    enabled: true,
    events: editorFocusDiagnostics.events,
  });
}

export function disableEditorFocusDiagnostics(): void {
  editorFocusDiagnostics = createDisabledState();
}

/** Module-level switch so the kernel can log without prop plumbing. */
let editorFocusDiagnostics: Readonly<{
  enabled: boolean;
  events: readonly EditorFocusDiagnosticEvent[];
}> = createDisabledState();

export function getEditorFocusDiagnosticState(): Readonly<{
  enabled: boolean;
  events: readonly EditorFocusDiagnosticEvent[];
}> {
  return editorFocusDiagnostics;
}

export function recordEditorFocusDiagnosticEvent(
  kind: EditorFocusDiagnosticKind,
  detail?: string,
): void {
  editorFocusDiagnostics = recordEditorFocusDiagnostic(editorFocusDiagnostics, kind, detail);
}
