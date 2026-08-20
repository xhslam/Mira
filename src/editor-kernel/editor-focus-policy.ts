/**
 * Editor focus ownership policy.
 *
 * The editor runs inside a bundled Expo DOM WebView. Its DOM focus is managed
 * exclusively by the kernel: no bridge path may programmatically blur the
 * editor, because on Android a programmatic `blur()` detaches the WebView from
 * the native window-focus system and the next tap then flashes the keyboard
 * and immediately loses focus.
 *
 * Ownership split:
 * - While the DOM editor is focused (user is editing), the DOM editor owns the
 *   selection. Incoming selections from the native shell are echoes of what the
 *   editor itself just sent; applying them unconditionally yanks the cursor
 *   because Markdown source offsets and ProseMirror document positions are two
 *   different coordinate spaces.
 * - While the DOM editor is not focused, the native shell owns the selection
 *   (search navigation, history restore, document open, mode switch).
 * - Content replacement always wins, regardless of focus, so external writes
 *   (AI replacement, restore, external-version load) reposition the cursor.
 */
export function shouldApplyIncomingSelection(input: {
  editorFocused: boolean;
  contentChanged: boolean;
}): boolean {
  return input.contentChanged || !input.editorFocused;
}

/**
 * A flush must capture the latest editor text. While an IME composition is in
 * progress the kernel buffers updates instead of emitting snapshots, so the
 * flush must commit the pending composition explicitly. It must never blur the
 * editor to force that commit — blurring is the Android focus corruption
 * trigger. Committing is idempotent: an empty buffer emits nothing.
 */
export type FlushCompositionCommitPlan = Readonly<{
  commitRequired: boolean;
  reason: "composition-pending" | "no-pending-composition";
}>;

export function planFlushCompositionCommit(input: {
  compositionPending: boolean;
}): FlushCompositionCommitPlan {
  if (input.compositionPending) {
    return Object.freeze({ commitRequired: true, reason: "composition-pending" });
  }
  return Object.freeze({ commitRequired: false, reason: "no-pending-composition" });
}
