import { describe, expect, test } from "vitest";

import {
  acknowledgeEditorRendererReady,
  beginEditorRendererRecovery,
  createEditorRendererRecoveryState,
  retryEditorRendererRecovery,
} from "../../../src/app/editor-renderer-recovery";

describe("editor renderer recovery", () => {
  test("remounts from native state and resets after the next editor ready", () => {
    const initial = createEditorRendererRecoveryState();
    const recovering = beginEditorRendererRecovery(initial, 4);
    const ready = acknowledgeEditorRendererReady(recovering, 5);

    expect(recovering).toEqual({
      status: "recovering",
      generation: 1,
      consecutiveFailures: 1,
      readyVersionTarget: 5,
    });
    expect(ready).toEqual({
      status: "ready",
      generation: 1,
      consecutiveFailures: 0,
      readyVersionTarget: null,
    });
    expect(initial).toEqual({
      status: "ready",
      generation: 0,
      consecutiveFailures: 0,
      readyVersionTarget: null,
    });
    expect(Object.isFrozen(recovering)).toBe(true);
    expect(Object.isFrozen(ready)).toBe(true);
  });

  test("stops automatic remounts after three consecutive failures", () => {
    const first = beginEditorRendererRecovery(createEditorRendererRecoveryState(), 1);
    const second = beginEditorRendererRecovery(first, 1);
    const third = beginEditorRendererRecovery(second, 1);
    const failed = beginEditorRendererRecovery(third, 1);

    expect(third.generation).toBe(3);
    expect(failed).toEqual({
      status: "failed",
      generation: 3,
      consecutiveFailures: 4,
      readyVersionTarget: null,
    });
  });

  test("allows an explicit retry after automatic recovery is exhausted", () => {
    const first = beginEditorRendererRecovery(createEditorRendererRecoveryState(), 2);
    const second = beginEditorRendererRecovery(first, 2);
    const third = beginEditorRendererRecovery(second, 2);
    const failed = beginEditorRendererRecovery(third, 2);

    expect(retryEditorRendererRecovery(failed, 2)).toEqual({
      status: "recovering",
      generation: 4,
      consecutiveFailures: 1,
      readyVersionTarget: 3,
    });
  });
});
