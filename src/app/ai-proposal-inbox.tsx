import { CircleAction } from "./mira-controls";
import { ChevronRight, ChevronLeft } from "lucide-react-native";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AiProposal, AiProposalState } from "../ai/proposal";
import { AppSafeArea } from "./app-safe-area";
import { useTheme, type Theme } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

const GROUPS: readonly Readonly<{ state: AiProposalState; label: string }>[] = Object.freeze([
  Object.freeze({ state: "pending", label: "Pending" }),
  Object.freeze({ state: "stale", label: "Stale" }),
  Object.freeze({ state: "apply_failed", label: "Failed" }),
  Object.freeze({ state: "applied", label: "Applied" }),
  Object.freeze({ state: "rejected", label: "Rejected" }),
]);

export function AiProposalInbox(
  props: Readonly<{
    visible: boolean;
    proposals: readonly AiProposal[];
    onSelect: (proposal: AiProposal) => void;
    onClose: () => void;
  }>,
) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={props.onClose}
      visible={props.visible}
    >
      <AppSafeArea style={{ backgroundColor: theme.colors.background }}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <View>
              <Text accessibilityRole="header" style={styles.title}>
                Proposal inbox
              </Text>
              <Text style={styles.subtitle}>AI changes never apply themselves</Text>
            </View>
            <CircleAction label="Close proposal inbox" onPress={props.onClose} muted>
              <ChevronLeft color={theme.colors.text} size={22} />
            </CircleAction>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {GROUPS.map((group) => {
              const proposals = props.proposals.filter((item) => item.state === group.state);
              if (proposals.length === 0) return null;
              return (
                <View key={group.state} style={styles.group}>
                  <Text style={styles.groupLabel}>
                    {group.label.toLocaleUpperCase()} · {proposals.length}
                  </Text>
                  {proposals.map((proposal) => (
                    <Pressable
                      key={proposal.id}
                      onPress={() => props.onSelect(proposal)}
                      style={styles.row}
                    >
                      <View style={styles.rowCopy}>
                        <Text numberOfLines={1} style={styles.path}>
                          {proposal.targetPath}
                        </Text>
                        <Text numberOfLines={1} style={styles.meta}>
                          {proposal.explanation || "AI note update"}
                        </Text>
                      </View>
                      <ChevronRight color={theme.colors.mutedText} size={18} />
                    </Pressable>
                  ))}
                </View>
              );
            })}
            {props.proposals.length === 0 ? (
              <Text style={styles.empty}>No proposals yet</Text>
            ) : null}
          </ScrollView>
        </View>
      </AppSafeArea>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, padding: 16, backgroundColor: theme.colors.background },
    header: {
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    subtitle: { marginTop: 3, color: theme.colors.mutedText, fontSize: 11 },
    content: { gap: 18, paddingBottom: 32 },
    group: { gap: 5 },
    groupLabel: {
      marginBottom: 3,
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    row: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
    },
    rowCopy: { minWidth: 0, flex: 1 },
    path: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    meta: { marginTop: 3, color: theme.colors.mutedText, fontSize: 11 },
    empty: { paddingTop: 80, color: theme.colors.mutedText, textAlign: "center" },
  });
}
