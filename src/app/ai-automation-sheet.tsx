import * as Crypto from "expo-crypto";
import { Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AiAutomation, AiAutomationSchedule } from "../ai/automation";
import type { AiProviderProfile } from "../ai/provider-profile";
import type { AppServices } from "./app-services";
import { useTheme, type Theme } from "./theme";

type ScheduleKind = AiAutomationSchedule["kind"];

export function AiAutomationSheet(
  props: Readonly<{
    services: AppServices;
    currentPath: string | null;
    visible: boolean;
    onClose: () => void;
  }>,
) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [tasks, setTasks] = useState<readonly AiAutomation[]>(Object.freeze([]));
  const [profiles, setProfiles] = useState<readonly AiProviderProfile[]>(Object.freeze([]));
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("app-open");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [requiresWeb, setRequiresWeb] = useState(false);
  const [requiresWhole, setRequiresWhole] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reload(): Promise<void> {
    const [stored, summaries] = await Promise.all([
      props.services.aiStore.listAutomations(props.services.activeWorkspace.grant.workspaceId),
      props.services.aiProviderProfiles.list(),
    ]);
    setTasks(stored);
    setProfiles(Object.freeze(summaries.map((item) => item.profile)));
  }

  useEffect(() => {
    if (!props.visible) return;
    let active = true;
    void Promise.all([
      props.services.aiStore.listAutomations(props.services.activeWorkspace.grant.workspaceId),
      props.services.aiProviderProfiles.list(),
    ]).then(([stored, summaries]) => {
      if (!active) return;
      setTasks(stored);
      setProfiles(Object.freeze(summaries.map((item) => item.profile)));
    });
    return () => {
      active = false;
    };
  }, [props.services, props.visible]);

  async function save(): Promise<void> {
    const profile = profiles[0];
    const contextPath = props.currentPath;
    if (!profile || !contextPath || !name.trim() || !prompt.trim() || busy) return;
    setBusy(true);
    const [hourText, minuteText] = time.split(":");
    const hour = Math.max(0, Math.min(23, Number(hourText) || 0));
    const minute = Math.max(0, Math.min(59, Number(minuteText) || 0));
    const schedule: AiAutomationSchedule =
      kind === "app-open"
        ? Object.freeze({ kind, debounceMinutes: 30 })
        : kind === "daily"
          ? Object.freeze({ kind, hour, minute })
          : Object.freeze({ kind, weekday, hour, minute });
    const now = new Date().toISOString();
    const task = Object.freeze({
      id: Crypto.randomUUID() as AiAutomation["id"],
      workspaceId: props.services.activeWorkspace.grant.workspaceId,
      scheduleVersion: Crypto.randomUUID(),
      name: name.trim(),
      prompt: prompt.trim(),
      schedule,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      providerProfileId: profile.id,
      contextPaths: Object.freeze([contextPath]),
      requiresWebSearch: requiresWeb,
      requiresWholeWorkspaceSearch: requiresWhole,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await props.services.aiStore.upsertAutomation(task);
    setName("");
    setPrompt("");
    setBusy(false);
    await reload();
  }

  async function toggle(task: AiAutomation): Promise<void> {
    await props.services.aiStore.upsertAutomation(
      Object.freeze({
        ...task,
        enabled: !task.enabled,
        updatedAt: new Date().toISOString(),
      }),
    );
    await reload();
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} visible={props.visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              AI automations
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close AI automations"
            onPress={props.onClose}
            style={styles.icon}
          >
            <X color={theme.colors.text} size={22} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text style={styles.sectionLabel}>NEW TASK</Text>
            <TextInput
              onChangeText={setName}
              placeholder="Task name"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              value={name}
            />
            <TextInput
              multiline
              onChangeText={setPrompt}
              placeholder="What should the AI do?"
              placeholderTextColor={theme.colors.mutedText}
              style={[styles.input, styles.prompt]}
              value={prompt}
            />
            <View style={styles.segmented}>
              {(["app-open", "daily", "weekly"] as const).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setKind(item)}
                  style={[styles.segment, kind === item && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, kind === item && styles.segmentTextActive]}>
                    {item === "app-open" ? "On open" : item}
                  </Text>
                </Pressable>
              ))}
            </View>
            {kind !== "app-open" ? (
              <TextInput
                accessibilityLabel="Automation local time"
                onChangeText={setTime}
                placeholder="09:00"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
                value={time}
              />
            ) : null}
            {kind === "weekly" ? (
              <View style={styles.weekdays}>
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <Pressable
                    key={day}
                    onPress={() => setWeekday(day)}
                    style={[styles.day, weekday === day && styles.dayActive]}
                  >
                    <Text style={weekday === day ? styles.dayTextActive : styles.dayText}>
                      {["S", "M", "T", "W", "T", "F", "S"][day]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.option}>
              <Text style={styles.optionText}>Provider-native web search</Text>
              <Switch onValueChange={setRequiresWeb} value={requiresWeb} />
            </View>
            <View style={styles.option}>
              <Text style={styles.optionText}>Allow whole-workspace search for this task</Text>
              <Switch onValueChange={setRequiresWhole} value={requiresWhole} />
            </View>
            <Text style={styles.context}>Context: {props.currentPath ?? "Open a note first"}</Text>
            <Pressable
              disabled={
                busy ||
                !name.trim() ||
                !prompt.trim() ||
                !props.currentPath ||
                profiles.length === 0
              }
              onPress={() => void save()}
              style={[
                styles.primary,
                (busy ||
                  !name.trim() ||
                  !prompt.trim() ||
                  !props.currentPath ||
                  profiles.length === 0) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.primaryText}>Create automation</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionLabel}>TASKS</Text>
          {tasks.length === 0 ? (
            <Text style={styles.empty}>No automations yet</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.task}>
                <View style={styles.taskCopy}>
                  <Text style={styles.taskName}>{task.name}</Text>
                  <Text style={styles.taskMeta}>
                    {task.schedule.kind} · next foreground · only latest missed run
                  </Text>
                </View>
                <Switch onValueChange={() => void toggle(task)} value={task.enabled} />
                <Pressable
                  accessibilityLabel={`Delete ${task.name}`}
                  onPress={() => void props.services.aiStore.removeAutomation(task.id).then(reload)}
                  style={styles.icon}
                >
                  <Trash2 color={theme.colors.error} size={18} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, padding: theme.spacing.md, backgroundColor: theme.colors.background },
    header: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing["3xl"] },
    form: {
      gap: 11,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    sectionLabel: {
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    input: {
      minHeight: 45,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
    },
    prompt: { minHeight: 84, paddingTop: 12, textAlignVertical: "top" },
    segmented: {
      flexDirection: "row",
      padding: 3,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceMuted,
    },
    segment: {
      minHeight: 36,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
    },
    segmentActive: { backgroundColor: theme.colors.background },
    segmentText: { color: theme.colors.mutedText, fontSize: 11 },
    segmentTextActive: { color: theme.colors.primary, fontWeight: "700" },
    weekdays: { flexDirection: "row", justifyContent: "space-between" },
    day: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceMuted,
    },
    dayActive: { backgroundColor: theme.colors.primary },
    dayText: { color: theme.colors.mutedText },
    dayTextActive: { color: "#FFFFFF", fontWeight: "700" },
    option: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    optionText: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 12 },
    context: { color: theme.colors.mutedText, fontSize: 11 },
    primary: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.primary,
    },
    primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
    disabled: { opacity: 0.4 },
    empty: { padding: 24, color: theme.colors.mutedText, textAlign: "center" },
    task: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    taskCopy: { minWidth: 0, flex: 1 },
    taskName: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    taskMeta: { marginTop: 3, color: theme.colors.mutedText, fontSize: 10 },
  });
}
