import { useState } from "react";
import { Alert } from "react-native";

import type {
  WorkspaceBrowserCapabilities,
  WorkspaceConflictPolicy,
} from "../workspace/workspace-browser";
import type { BrowserCommandResult } from "./browser-command";
import type { FileTemplate } from "./file-template-registry";
import { contentForNewExcalidrawPath } from "../formats/excalidraw/excalidraw-file";
import type { WorkspaceCreateKind } from "./workspace-drawer-dialogs";

export function useEntryCreation(options: {
  capabilities: WorkspaceBrowserCapabilities;
  onCreateFile: (
    path: string,
    content: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  onCreateDirectory: (path: string) => Promise<BrowserCommandResult>;
}) {
  const [newMenuVisible, setNewMenuVisible] = useState(false);
  const [templateMenuVisible, setTemplateMenuVisible] = useState(false);
  const [kind, setKind] = useState<WorkspaceCreateKind | null>(null);
  const [value, setValue] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openMenu(): void {
    setNewMenuVisible(true);
    setError(null);
  }

  function closeMenu(): void {
    setNewMenuVisible(false);
  }

  function openTemplates(): void {
    setNewMenuVisible(false);
    setTemplateMenuVisible(true);
  }

  function closeTemplates(): void {
    setTemplateMenuVisible(false);
  }

  function begin(nextKind: WorkspaceCreateKind): void {
    setNewMenuVisible(false);
    setKind(nextKind);
    setValue(nextKind === "file" ? "Untitled.md" : "New folder");
    setContent("");
    setError(null);
  }

  function beginTemplate(template: FileTemplate): void {
    setTemplateMenuVisible(false);
    setKind("file");
    setValue(template.defaultPath);
    setContent(template.content);
    setError(null);
  }

  function cancel(): void {
    if (busy) return;
    setKind(null);
    setValue("");
    setContent("");
    setError(null);
  }

  async function submit(conflict: WorkspaceConflictPolicy = "fail"): Promise<void> {
    if (!kind || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === "directory"
          ? await options.onCreateDirectory(value)
          : await options.onCreateFile(
              value,
              contentForNewExcalidrawPath(value, content),
              conflict,
            );
      if (!result.ok && result.errorCode === "ALREADY_EXISTS" && conflict === "fail") {
        showConflict();
        return;
      }
      if (!result.ok) {
        setError(result.error ?? "The workspace operation failed.");
        return;
      }
      setKind(null);
      setValue("");
      setContent("");
    } catch {
      setError("The workspace operation failed.");
    } finally {
      setBusy(false);
    }
  }

  function showConflict(): void {
    const actions: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
    if (options.capabilities.createKeepBoth) {
      actions.push({ text: "Keep both", onPress: () => void submit("keep-both") });
    }
    if (options.capabilities.createReplace) {
      actions.push({
        text: "Replace",
        style: "destructive",
        onPress: () => void submit("replace"),
      });
    }
    Alert.alert("A file already exists", value, actions);
  }

  return Object.freeze({
    newMenuVisible,
    templateMenuVisible,
    kind,
    value,
    busy,
    error,
    openMenu,
    closeMenu,
    openTemplates,
    closeTemplates,
    begin,
    beginTemplate,
    cancel,
    setValue,
    submit,
  });
}
