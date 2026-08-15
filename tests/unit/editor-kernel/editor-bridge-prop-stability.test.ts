import { describe, expect, test } from "vitest";

import { shouldStartEditorFlush } from "../../../src/editor-bridge/editor-flush";
import {
  advanceLocalResourceState,
  createLocalResourceState,
} from "../../../src/formats/local-resource";

/**
 * The DOM editor kernel receives its props across the Expo DOM bridge. Every
 * native render re-serializes the whole prop bag and the WebView side rebuilds
 * it from JSON, so object and function props arrive with a new identity even
 * when nothing changed.
 *
 * Any kernel effect that destroys and rebuilds the editor instance, announces
 * the editor session, or drives a flush must therefore key off scalar *values*,
 * never off prop identity. Depending on identity caused three connected
 * regressions on Android:
 *   - the editor instance was rebuilt on every push, which reset DOM focus
 *     ownership and discarded the pending IME composition buffer, so freshly
 *     typed (especially composed CJK) text disappeared;
 *   - re-announcing `editor.ready` advanced the native ready version, which
 *     re-rendered the shell and pushed props again, forming a feedback loop that
 *     rebuilt the editor continuously and made the keyboard flash open/closed;
 *   - re-running the flush effect abandoned the in-flight flush through its
 *     cleanup, so the native side timed out waiting for an acknowledgement.
 */
describe("editor bridge prop stability", () => {
  test("a bridge round trip changes object identity but preserves scalar values", () => {
    const resources = Object.freeze({ "img/a.png": "data:image/png;base64,AAA" });
    const revision = 7;

    const pushed = JSON.parse(JSON.stringify({ resources, revision })) as {
      resources: Record<string, string>;
      revision: number;
    };

    // This is the hazard: a structurally identical map is a different object.
    expect(pushed.resources).not.toBe(resources);
    expect(pushed.resources).toEqual(resources);
    // A number survives with a stable identity, which is why the rebuild signal
    // is a revision counter rather than the resource map itself.
    expect(pushed.revision).toBe(revision);
  });

  test("an unchanged resource map keeps the same state and revision", () => {
    const initial = createLocalResourceState();
    expect(initial.revision).toBe(0);

    const first = advanceLocalResourceState(initial, { "img/a.png": "data:one" });
    expect(first.revision).toBe(1);

    // A fresh object with equal contents (what every bridge push looks like)
    // must not advance the rebuild signal.
    const echoed = advanceLocalResourceState(first, { "img/a.png": "data:one" });
    expect(echoed).toBe(first);
    expect(echoed.revision).toBe(1);
  });

  test("the revision advances only when resource values actually change", () => {
    const state = advanceLocalResourceState(createLocalResourceState(), { "a.png": "data:one" });

    const changedValue = advanceLocalResourceState(state, { "a.png": "data:two" });
    expect(changedValue.revision).toBe(2);

    const addedKey = advanceLocalResourceState(changedValue, {
      "a.png": "data:two",
      "b.png": "data:three",
    });
    expect(addedKey.revision).toBe(3);

    const removedKey = advanceLocalResourceState(addedKey, { "a.png": "data:two" });
    expect(removedKey.revision).toBe(4);
  });

  test("resource state is frozen so it cannot be mutated across the bridge", () => {
    const state = advanceLocalResourceState(createLocalResourceState(), { "a.png": "data:one" });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.resources)).toBe(true);
  });

  test("a flush starts once per request id and ignores identity-only pushes", () => {
    // First request of a freshly mounted kernel.
    expect(shouldStartEditorFlush({ handledRequestId: null, requestId: 4 })).toBe(true);
    // The same request pushed again (new object, same id) must not restart the
    // flush: the re-run's cleanup would abandon the in-flight attempt.
    expect(shouldStartEditorFlush({ handledRequestId: 4, requestId: 4 })).toBe(false);
    // A genuinely new request must start.
    expect(shouldStartEditorFlush({ handledRequestId: 4, requestId: 5 })).toBe(true);
  });

  test("no request means no flush", () => {
    expect(shouldStartEditorFlush({ handledRequestId: null, requestId: null })).toBe(false);
    expect(shouldStartEditorFlush({ handledRequestId: 9, requestId: null })).toBe(false);
  });

  test("a wrapped request id still starts a flush", () => {
    // The native side wraps its monotonic counter back to 1 at MAX_SAFE_INTEGER.
    // Comparing by identity value rather than by ordering keeps that request
    // runnable instead of rejecting every later flush forever.
    expect(
      shouldStartEditorFlush({ handledRequestId: Number.MAX_SAFE_INTEGER, requestId: 1 }),
    ).toBe(true);
  });
});
