import { describe, expect, it } from "vitest";

import {
  bufferCompositionUpdate,
  commitComposition,
  createCompositionBuffer,
} from "../../../src/editor-kernel/editor-composition";

describe("editor composition buffer", () => {
  it("suppresses intermediate IME candidate updates and emits only the latest commit", () => {
    const first = bufferCompositionUpdate(createCompositionBuffer<string>(), "n", true);
    const second = bufferCompositionUpdate(first.buffer, "ni", true);
    const third = bufferCompositionUpdate(second.buffer, "你", true);
    const committed = commitComposition(third.buffer);

    expect(first.emission).toBeNull();
    expect(second.emission).toBeNull();
    expect(third.emission).toBeNull();
    expect(committed.emission).toBe("你");
    expect(committed.buffer.pending).toBeNull();
  });

  it("emits ordinary non-composition edits immediately", () => {
    const result = bufferCompositionUpdate(createCompositionBuffer<string>(), "text", false);

    expect(result.emission).toBe("text");
    expect(result.buffer.pending).toBeNull();
  });

  it("commits nothing when composition did not change content", () => {
    expect(commitComposition(createCompositionBuffer()).emission).toBeNull();
  });
});
