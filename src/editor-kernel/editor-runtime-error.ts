const RECOVERABLE_RUNTIME_ERROR =
  /failed to fetch|failed to load split bundle|loading chunk|module not loaded|asyncrequire/iu;

export function editorRuntimeErrorMessage(input: unknown): string {
  if (input instanceof Error) return input.message;
  if (typeof input === "string") return input;
  if (
    typeof input === "object" &&
    input !== null &&
    "message" in input &&
    typeof input.message === "string"
  ) {
    return input.message;
  }
  return "";
}

export function isRecoverableEditorRuntimeError(input: unknown): boolean {
  return RECOVERABLE_RUNTIME_ERROR.test(editorRuntimeErrorMessage(input));
}
