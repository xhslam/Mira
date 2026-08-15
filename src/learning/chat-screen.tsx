import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MessageCircle, Plus, Save, Send, Trash2, UserRound } from "lucide-react-native";
import type { AppServices } from "../app/app-services";
import type { Theme } from "../app/theme";
import { collectLearningResponse } from "./learning-ai";
import type {
  ChatPartner,
  LearningConversation,
  LearningMessage,
  LearningSnapshot,
} from "./learning-types";

export function ChatScreen({
  snapshot,
  onChange,
  theme,
  services,
}: Readonly<{
  snapshot: LearningSnapshot;
  onChange: (snapshot: LearningSnapshot) => void;
  theme: Theme;
  services: AppServices;
}>) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idSequence = useRef(0);
  function createId(prefix: string): string {
    idSequence.current += 1;
    return `${prefix}-${idSequence.current}`;
  }
  const partner =
    snapshot.partners.find(
      (item) => item.id === snapshot.ui.selectedConversationId?.replace("conversation-for-", ""),
    ) ??
    snapshot.partners[0] ??
    null;
  const conversation =
    snapshot.conversations.find((item) => item.id === snapshot.ui.selectedConversationId) ?? null;
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const editingPartner = snapshot.partners.find((item) => item.id === editingPartnerId) ?? null;

  function patch(next: LearningSnapshot) {
    onChange(next);
  }

  function startConversation(selected: ChatPartner) {
    const existing = snapshot.conversations.find((item) => item.partnerId === selected.id);
    if (existing) {
      patch(
        Object.freeze({
          ...snapshot,
          ui: Object.freeze({ ...snapshot.ui, selectedConversationId: existing.id }),
        }),
      );
      return;
    }
    const now = new Date().toISOString();
    const conversationId = createId("conversation");
    const opening: LearningMessage = Object.freeze({
      id: createId("message-opening"),
      conversationId,
      role: "assistant",
      content: selected.openingMessage,
      state: "complete",
      audioUri: null,
      createdAt: now,
    });
    const created: LearningConversation = Object.freeze({
      id: conversationId,
      partnerId: selected.id,
      title: selected.scenario,
      objective: selected.learningGoal,
      createdAt: now,
      updatedAt: now,
      messages: Object.freeze([opening]),
    });
    patch(
      Object.freeze({
        ...snapshot,
        conversations: Object.freeze([created, ...snapshot.conversations]),
        ui: Object.freeze({ ...snapshot.ui, selectedConversationId: created.id }),
      }),
    );
  }

  async function sendMessage() {
    if (!conversation || !partner || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    const user: LearningMessage = Object.freeze({
      id: createId("message-user"),
      conversationId: conversation.id,
      role: "user",
      content: draft.trim(),
      state: "complete",
      audioUri: null,
      createdAt: now,
    });
    const assistantId = createId("message-assistant");
    const placeholder: LearningMessage = Object.freeze({
      id: assistantId,
      conversationId: conversation.id,
      role: "assistant",
      content: "",
      state: "streaming",
      audioUri: null,
      createdAt: now,
    });
    let working = replaceConversation(
      snapshot,
      Object.freeze({
        ...conversation,
        title: conversation.messages.length === 1 ? user.content.slice(0, 48) : conversation.title,
        updatedAt: now,
        messages: Object.freeze([...conversation.messages, user, placeholder]),
      }),
    );
    patch(working);
    setDraft("");
    try {
      const history = [...conversation.messages, user].map((message) =>
        Object.freeze({
          role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: message.content,
        }),
      );
      const response = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content: `You are ${partner.name}, an English learning conversation partner. Personality: ${partner.personality} Scenario: ${partner.scenario}. Goal: ${partner.learningGoal}. Correction policy: ${partner.correctionStyle}. ${partner.customInstructions} Keep replies concise, supportive, and ask one natural follow-up question.`,
          }),
          ...history,
        ]),
        onDelta: (text) => {
          const updatedConversation = working.conversations.find(
            (item) => item.id === conversation.id,
          );
          if (!updatedConversation) return;
          const messages = updatedConversation.messages.map((item) =>
            item.id === assistantId
              ? Object.freeze({ ...item, content: item.content + text })
              : item,
          );
          working = replaceConversation(
            working,
            Object.freeze({
              ...updatedConversation,
              messages: Object.freeze(messages),
              updatedAt: new Date().toISOString(),
            }),
          );
          patch(working);
        },
      });
      const updatedConversation = working.conversations.find((item) => item.id === conversation.id);
      if (updatedConversation) {
        const messages = updatedConversation.messages.map((item) =>
          item.id === assistantId
            ? Object.freeze({ ...item, content: response, state: "complete" as const })
            : item,
        );
        working = replaceConversation(
          working,
          Object.freeze({
            ...updatedConversation,
            messages: Object.freeze(messages),
            updatedAt: new Date().toISOString(),
          }),
        );
        patch(working);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The conversation request failed.";
      setError(message);
      const updatedConversation = working.conversations.find((item) => item.id === conversation.id);
      if (updatedConversation) {
        const messages = updatedConversation.messages.map((item) =>
          item.id === assistantId
            ? Object.freeze({ ...item, content: message, state: "incomplete" as const })
            : item,
        );
        patch(
          replaceConversation(
            working,
            Object.freeze({
              ...updatedConversation,
              messages: Object.freeze(messages),
              updatedAt: new Date().toISOString(),
            }),
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function createPartner() {
    const now = new Date().toISOString();
    const created: ChatPartner = Object.freeze({
      id: createId("partner"),
      name: "New partner",
      avatarSeed: "New partner",
      description: "A reusable partner configuration.",
      personality: "Supportive and patient.",
      scenario: "Everyday English practice",
      learningGoal: "Speak more confidently.",
      difficulty: "beginner",
      openingMessage: "Hi! What would you like to practise today?",
      voiceId: null,
      correctionStyle: "gentle",
      customInstructions: "Ask short follow-up questions and give brief helpful corrections.",
      createdAt: now,
      updatedAt: now,
    });
    patch(Object.freeze({ ...snapshot, partners: Object.freeze([...snapshot.partners, created]) }));
    setEditingPartnerId(created.id);
  }

  function updatePartner(values: Partial<ChatPartner>) {
    if (!editingPartner) return;
    const updated = Object.freeze({
      ...editingPartner,
      ...values,
      updatedAt: new Date().toISOString(),
    });
    patch(
      Object.freeze({
        ...snapshot,
        partners: Object.freeze(
          snapshot.partners.map((item) => (item.id === updated.id ? updated : item)),
        ),
      }),
    );
  }

  function removePartner() {
    if (!editingPartner || snapshot.partners.length <= 1) {
      setError("Keep at least one partner available for conversation practice.");
      return;
    }
    patch(
      Object.freeze({
        ...snapshot,
        partners: Object.freeze(snapshot.partners.filter((item) => item.id !== editingPartner.id)),
        conversations: Object.freeze(
          snapshot.conversations.filter((item) => item.partnerId !== editingPartner.id),
        ),
      }),
    );
    setEditingPartnerId(null);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>CONVERSATION</Text>
        <Text style={styles.title}>Speak with a partner</Text>
        <Text style={styles.copy}>
          Partners are reusable configurations. Sessions preserve their own message history and
          learning objective.
        </Text>
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.sectionTitle}>Chat partners</Text>
        <Pressable
          accessibilityRole="button"
          onPress={createPartner}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Plus color={theme.colors.canvas} size={16} />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={styles.partnerList}
        showsHorizontalScrollIndicator={false}
      >
        {snapshot.partners.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => startConversation(item)}
            style={({ pressed }) => [
              styles.partnerCard,
              partner?.id === item.id && styles.partnerSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.partnerAvatar}>
              <UserRound color={theme.colors.accent} size={22} />
            </View>
            <Text numberOfLines={1} style={styles.partnerName}>
              {item.name}
            </Text>
            <Text numberOfLines={2} style={styles.partnerDetail}>
              {item.scenario}
            </Text>
            <Text style={styles.partnerAction}>Start chat</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.headingRow}>
        <Text style={styles.sectionTitle}>Conversation</Text>
        {partner ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditingPartnerId(partner.id)}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonText}>Edit partner</Text>
          </Pressable>
        ) : null}
      </View>
      {!conversation ? (
        <View style={styles.empty}>
          <MessageCircle color={theme.colors.mutedText} size={30} />
          <Text style={styles.emptyTitle}>Choose a partner to begin</Text>
          <Text style={styles.emptyCopy}>
            A session starts with the partner’s opening message and is saved locally before the
            first reply.
          </Text>
        </View>
      ) : (
        <View style={styles.chatCard}>
          <Text style={styles.objective}>{conversation.objective}</Text>
          {conversation.messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.role === "user" ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text style={[styles.bubbleRole, message.role === "user" && styles.userBubbleText]}>
                {message.role === "user" ? "You" : (partner?.name ?? "Partner")}
              </Text>
              <Text style={[styles.bubbleText, message.role === "user" && styles.userBubbleText]}>
                {message.content || "Thinking…"}
              </Text>
            </View>
          ))}
          <View style={styles.composer}>
            <TextInput
              editable={!busy}
              multiline
              onChangeText={setDraft}
              placeholder="Speak or type a message…"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.composerInput}
              value={draft}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy || !draft.trim()}
              onPress={() => void sendMessage()}
              style={({ pressed }) => [
                styles.sendButton,
                (busy || !draft.trim()) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.canvas} />
              ) : (
                <Send color={theme.colors.canvas} size={18} />
              )}
            </Pressable>
          </View>
        </View>
      )}
      {editingPartner ? (
        <View style={styles.editor}>
          <Text style={styles.sectionTitle}>Edit partner</Text>
          <LabelInput
            label="Name"
            value={editingPartner.name}
            onChangeText={(name) => updatePartner({ name, avatarSeed: name })}
            styles={styles}
            theme={theme}
          />
          <LabelInput
            label="Scenario"
            value={editingPartner.scenario}
            onChangeText={(scenario) => updatePartner({ scenario })}
            styles={styles}
            theme={theme}
          />
          <LabelInput
            label="Learning goal"
            value={editingPartner.learningGoal}
            onChangeText={(learningGoal) => updatePartner({ learningGoal })}
            styles={styles}
            theme={theme}
          />
          <LabelInput
            label="Personality"
            value={editingPartner.personality}
            onChangeText={(personality) => updatePartner({ personality })}
            styles={styles}
            theme={theme}
          />
          <LabelInput
            label="Opening message"
            value={editingPartner.openingMessage}
            multiline
            onChangeText={(openingMessage) => updatePartner({ openingMessage })}
            styles={styles}
            theme={theme}
          />
          <LabelInput
            label="Custom instructions"
            value={editingPartner.customInstructions}
            multiline
            onChangeText={(customInstructions) => updatePartner({ customInstructions })}
            styles={styles}
            theme={theme}
          />
          <View style={styles.editorActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditingPartnerId(null)}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            >
              <Save color={theme.colors.canvas} size={16} />
              <Text style={styles.addText}>Done</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={removePartner}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
            >
              <Trash2 color={theme.colors.danger} size={17} />
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
function LabelInput({
  label,
  value,
  onChangeText,
  multiline,
  styles,
  theme,
}: Readonly<{
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        placeholderTextColor={theme.colors.mutedText}
      />
    </View>
  );
}
function replaceConversation(
  snapshot: LearningSnapshot,
  conversation: LearningConversation,
): LearningSnapshot {
  return Object.freeze({
    ...snapshot,
    conversations: Object.freeze(
      snapshot.conversations.map((item) => (item.id === conversation.id ? conversation : item)),
    ),
    ui: Object.freeze({ ...snapshot.ui, selectedConversationId: conversation.id }),
  });
}
function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: { gap: 16, padding: 20, paddingBottom: 36 },
    hero: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 6,
      padding: 20,
    },
    kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: "600", letterSpacing: 1 },
    title: { color: theme.colors.text, fontSize: 24, fontWeight: "600" },
    copy: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20 },
    headingRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "600" },
    addButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    addText: { color: theme.colors.canvas, fontSize: 12, fontWeight: "600" },
    partnerList: { gap: 10 },
    partnerCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 6,
      padding: 14,
      width: 150,
    },
    partnerSelected: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
    partnerAvatar: {
      alignItems: "center",
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 10,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    partnerName: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    partnerDetail: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 16, minHeight: 32 },
    partnerAction: { color: theme.colors.accent, fontSize: 12, fontWeight: "600", marginTop: 2 },
    textButton: { padding: 6 },
    textButtonText: { color: theme.colors.accent, fontSize: 13, fontWeight: "600" },
    empty: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 9,
      padding: 26,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "600" },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19, textAlign: "center" },
    chatCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 10,
      padding: 13,
    },
    objective: {
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 10,
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: "700",
      padding: 10,
    },
    bubble: { borderRadius: 10, gap: 4, maxWidth: "88%", padding: 11 },
    assistantBubble: { alignSelf: "flex-start", backgroundColor: theme.colors.surfaceMuted },
    userBubble: { alignSelf: "flex-end", backgroundColor: theme.colors.accent },
    bubbleRole: { color: theme.colors.accent, fontSize: 11, fontWeight: "600" },
    bubbleText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
    userBubbleText: { color: theme.colors.canvas },
    composer: {
      alignItems: "flex-end",
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 8,
      padding: 8,
    },
    composerInput: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 14,
      maxHeight: 112,
      minHeight: 42,
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    sendButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    editor: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 12,
      padding: 16,
    },
    inputWrap: { gap: 5 },
    label: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    input: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    textarea: { minHeight: 78, textAlignVertical: "top" },
    editorActions: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
    saveButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    deleteButton: {
      alignItems: "center",
      borderColor: theme.colors.danger,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    deleteText: { color: theme.colors.danger, fontSize: 12, fontWeight: "600" },
    error: { color: theme.colors.error, fontSize: 13, fontWeight: "700", lineHeight: 18 },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
