import { describe, expect, test } from "vitest";

import {
  disableEditorFocusDiagnostics,
  enableEditorFocusDiagnostics,
  getEditorFocusDiagnosticState,
  recordEditorFocusDiagnostic,
  recordEditorFocusDiagnosticEvent,
} from "../../../src/editor-kernel/editor-focus-diagnostics";

const disabled = Object.freeze({ enabled: false, events: Object.freeze([]) });

describe("editor focus diagnostics", () => {
  test("recording is a no-op while disabled", () => {
    const result = recordEditorFocusDiagnostic(disabled, "editor.blur");
    expect(result).toEqual(disabled);
    expect(result).toBe(disabled);
  });

  test("events are sequence-numbered and retained in order", () => {
    const enabled = Object.freeze({ enabled: true, events: Object.freeze([]) });
    const first = recordEditorFocusDiagnostic(enabled, "kernel.mount");
    const second = recordEditorFocusDiagnostic(first, "editor.focus");
    const third = recordEditorFocusDiagnostic(second, "flush.begin", "request:7");

    expect(second.events).toHaveLength(2);
    expect(second.events[0]).toMatchObject({ sequence: 1, kind: "kernel.mount" });
    expect(second.events[1]).toMatchObject({ sequence: 2, kind: "editor.focus" });
    expect(third.events).toHaveLength(3);
    expect(third.events[0]).toMatchObject({ sequence: 1, kind: "kernel.mount" });
    expect(third.events[1]).toMatchObject({ sequence: 2, kind: "editor.focus" });
    expect(third.events[2]).toMatchObject({
      sequence: 3,
      kind: "flush.begin",
      detail: "request:7",
    });
    expect(Object.isFrozen(third.events)).toBe(true);
    expect(Object.isFrozen(third.events[2])).toBe(true);
  });

  test("the module switch enables and disables event capture", () => {
    disableEditorFocusDiagnostics();
    recordEditorFocusDiagnosticEvent("editor.blur");
    expect(getEditorFocusDiagnosticState()).toEqual(disabled);

    enableEditorFocusDiagnostics();
    recordEditorFocusDiagnosticEvent("kernel.mount", "mode:wysiwyg");
    const state = getEditorFocusDiagnosticState();
    expect(state.enabled).toBe(true);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ kind: "kernel.mount", detail: "mode:wysiwyg" });

    disableEditorFocusDiagnostics();
    recordEditorFocusDiagnosticEvent("editor.blur");
    expect(getEditorFocusDiagnosticState().events).toHaveLength(0);
  });

  test("the retained ring buffer is bounded", () => {
    let state: ReturnType<typeof recordEditorFocusDiagnostic> = Object.freeze({
      enabled: true,
      events: Object.freeze([]),
    });
    for (let index = 0; index < 1200; index += 1) {
      state = recordEditorFocusDiagnostic(state, "editor.focus");
    }
    expect(state.events).toHaveLength(500);
    expect(state.events[0]?.sequence).toBe(701);
    expect(state.events.at(-1)?.sequence).toBe(1200);
  });
});
