import { describe, expect, test } from "vitest";
import { createSerializedStateQueue } from "../../../src/learning/serialized-state-queue";

type Session = Readonly<{
  status: "active" | "paused";
  reviewDraft: readonly string[];
  providerTurn: number;
}>;

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return Object.freeze({ promise, resolve });
}

describe("serialized state queue", () => {
  test("preserves a review draft when a mode switch is queued immediately after it", async () => {
    const persisted: Session[] = [];
    const queue = createSerializedStateQueue<Session>(
      Object.freeze({ status: "active", reviewDraft: Object.freeze([]), providerTurn: 0 }),
      async (next) => {
        persisted.push(next);
      },
    );
    const edit = queue.enqueue((current) =>
      Object.freeze({ ...current, reviewDraft: Object.freeze(["Could I get tea?"]) }),
    );
    const pause = queue.enqueue((current) => Object.freeze({ ...current, status: "paused" }));
    await Promise.all([edit, pause]);
    expect(queue.current()).toEqual({
      status: "paused",
      reviewDraft: ["Could I get tea?"],
      providerTurn: 0,
    });
    expect(persisted).toHaveLength(2);
  });

  test("does not let a stale render snapshot replace queued updates", async () => {
    const firstWrite = deferred();
    const persisted: Session[] = [];
    const queue = createSerializedStateQueue<Session>(
      Object.freeze({ status: "active", reviewDraft: Object.freeze([]), providerTurn: 0 }),
      async (next) => {
        persisted.push(next);
        if (persisted.length === 1) await firstWrite.promise;
      },
    );
    const edit = queue.enqueue((current) =>
      Object.freeze({ ...current, reviewDraft: Object.freeze(["Please help me."]) }),
    );
    queue.sync(
      Object.freeze({ status: "active", reviewDraft: Object.freeze([]), providerTurn: 0 }),
      async (next) => {
        persisted.push(next);
      },
    );
    const pause = queue.enqueue((current) => Object.freeze({ ...current, status: "paused" }));
    firstWrite.resolve();
    await Promise.all([edit, pause]);
    expect(queue.current()).toMatchObject({
      status: "paused",
      reviewDraft: ["Please help me."],
    });
  });

  test("keeps a paused session paused when an older provider response reaches the queue", async () => {
    const queue = createSerializedStateQueue<Session>(
      Object.freeze({ status: "active", reviewDraft: Object.freeze([]), providerTurn: 0 }),
      async () => undefined,
    );
    await queue.enqueue((current) => Object.freeze({ ...current, status: "paused" }));
    await queue.enqueue((current) =>
      current.status === "active"
        ? Object.freeze({ ...current, providerTurn: current.providerTurn + 1 })
        : current,
    );
    expect(queue.current()).toEqual({ status: "paused", reviewDraft: [], providerTurn: 0 });
  });
});

test("blocks queued state changes after a rejection and allows a retry with the local draft", async () => {
  const persisted: Session[] = [];
  let failFirst = true;
  const queue = createSerializedStateQueue<Session>(
    Object.freeze({ status: "active", reviewDraft: Object.freeze([]), providerTurn: 0 }),
    async (next) => {
      if (failFirst) {
        failFirst = false;
        throw new Error("storage unavailable");
      }
      persisted.push(next);
    },
  );
  const edit = queue.enqueue((current) =>
    Object.freeze({ ...current, reviewDraft: Object.freeze(["Please help me."]) }),
  );
  const pause = queue.enqueue((current) => Object.freeze({ ...current, status: "paused" }));
  await expect(edit).rejects.toThrow("storage unavailable");
  await expect(pause).rejects.toThrow("previous state write failed");
  expect(queue.current()).toEqual({ status: "active", reviewDraft: [], providerTurn: 0 });
  const retried = await queue.enqueue((current) =>
    Object.freeze({
      ...current,
      status: "paused",
      reviewDraft: Object.freeze(["Please help me."]),
    }),
  );
  expect(retried).toEqual({
    status: "paused",
    reviewDraft: ["Please help me."],
    providerTurn: 0,
  });
  expect(persisted).toEqual([retried]);
});
