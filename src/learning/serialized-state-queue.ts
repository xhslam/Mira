export type StateTransform<T> = (current: T) => T;

export type SerializedStateQueue<T> = Readonly<{
  sync(value: T, writer: (next: T) => Promise<void>): void;
  enqueue(transform: StateTransform<T>): Promise<T>;
  current(): T;
}>;

export function createSerializedStateQueue<T>(
  initial: T,
  writer: (next: T) => Promise<void>,
): SerializedStateQueue<T> {
  let current = initial;
  let persist = writer;
  let pending = 0;
  let failureEpoch = 0;
  let chain: Promise<void> = Promise.resolve();

  return Object.freeze({
    sync(value, nextWriter) {
      persist = nextWriter;
      // React may re-render with a value captured before an in-flight write.
      // Never let that stale render replace the serial queue's newer state.
      if (pending === 0) current = value;
    },
    async enqueue(transform) {
      pending += 1;
      const expectedFailureEpoch = failureEpoch;
      let resolved = current;
      const operation = chain.then(async () => {
        if (failureEpoch !== expectedFailureEpoch) {
          throw new Error("A previous state write failed; retry before continuing.");
        }
        const next = transform(current);
        await persist(next);
        current = next;
        resolved = next;
      });
      chain = operation.catch(() => {
        failureEpoch += 1;
      });
      try {
        await operation;
        return resolved;
      } finally {
        pending -= 1;
      }
    },
    current() {
      return current;
    },
  });
}
