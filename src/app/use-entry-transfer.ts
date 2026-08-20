import { useState } from "react";
import { Alert } from "react-native";

import type { FileEntry } from "../workspace/workspace-adapter";
import type {
  WorkspaceBrowserCapabilities,
  WorkspaceConflictPolicy,
} from "../workspace/workspace-browser";
import type { BrowserCommandResult } from "./browser-command";

export type EntryTransferKind = "move" | "copy";

type EntryTransfer = Readonly<{
  kind: EntryTransferKind;
  entry: FileEntry;
}>;

export function useEntryTransfer(options: {
  capabilities: WorkspaceBrowserCapabilities;
  onMove: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  onCopy: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
}) {
  const [transfer, setTransfer] = useState<EntryTransfer | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function begin(kind: EntryTransferKind, entry: FileEntry): void {
    setTransfer(Object.freeze({ kind, entry }));
    setValue(entry.path);
    setError(null);
  }

  function cancel(): void {
    if (busy) return;
    setTransfer(null);
    setValue("");
  }

  async function submit(conflict: WorkspaceConflictPolicy = "fail"): Promise<void> {
    if (!transfer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await (transfer.kind === "move"
        ? options.onMove(transfer.entry, value, conflict)
        : options.onCopy(transfer.entry, value, conflict));
      if (!result.ok && result.errorCode === "ALREADY_EXISTS" && conflict === "fail") {
        showConflict();
        return;
      }
      if (!result.ok) {
        setError(result.error ?? "The workspace operation failed.");
        return;
      }
      setTransfer(null);
      setValue("");
    } catch {
      setError("The workspace operation failed.");
    } finally {
      setBusy(false);
    }
  }

  function showConflict(): void {
    if (!transfer) return;
    const canReplace =
      transfer.kind === "move"
        ? options.capabilities.moveReplace
        : options.capabilities.copyReplace;
    const canKeepBoth =
      transfer.kind === "move"
        ? options.capabilities.moveKeepBoth
        : options.capabilities.copyKeepBoth;
    const actions: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
    if (canKeepBoth) {
      actions.push({ text: "Keep both", onPress: () => void submit("keep-both") });
    }
    if (canReplace) {
      actions.push({
        text: "Replace",
        style: "destructive",
        onPress: () => void submit("replace"),
      });
    }
    Alert.alert("A file already exists", value, actions);
  }

  return Object.freeze({
    transfer,
    value,
    busy,
    error,
    begin,
    cancel,
    setValue,
    submit,
  });
}
