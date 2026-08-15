export type CompositionSnapshot<T> = Readonly<{
  value: T;
}>;

export type CompositionBuffer<T> = Readonly<{
  pending: CompositionSnapshot<T> | null;
}>;

export function createCompositionBuffer<T>(): CompositionBuffer<T> {
  return Object.freeze({ pending: null });
}

export function bufferCompositionUpdate<T>(
  buffer: CompositionBuffer<T>,
  value: T,
  composing: boolean,
): Readonly<{ buffer: CompositionBuffer<T>; emission: T | null }> {
  if (composing) {
    return Object.freeze({
      buffer: Object.freeze({ pending: Object.freeze({ value }) }),
      emission: null,
    });
  }
  return Object.freeze({ buffer: createCompositionBuffer<T>(), emission: value });
}

export function commitComposition<T>(
  buffer: CompositionBuffer<T>,
): Readonly<{ buffer: CompositionBuffer<T>; emission: T | null }> {
  return Object.freeze({
    buffer: createCompositionBuffer<T>(),
    emission: buffer.pending?.value ?? null,
  });
}
