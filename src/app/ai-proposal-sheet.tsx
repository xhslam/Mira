import { X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { createProposalDiffPlan, renderProposalDiffPlan } from "../ai/proposal-diff";
import type { AiProposal } from "../ai/proposal";
import { TextDiffView } from "./text-diff-view";
import { useTheme, type Theme } from "./theme";

export function AiProposalSheet(
  props: Readonly<{
    proposal: AiProposal | null;
    busy: boolean;
    onApply: (content: string) => void;
    onReject: () => void;
    onClose: () => void;
  }>,
) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} visible={props.proposal !== null}>
      {props.proposal ? (
        <ProposalReview
          busy={props.busy}
          key={props.proposal.id}
          onApply={props.onApply}
          onClose={props.onClose}
          onReject={props.onReject}
          proposal={props.proposal}
          styles={styles}
          theme={theme}
        />
      ) : null}
    </Modal>
  );
}

function ProposalReview(
  props: Readonly<{
    proposal: AiProposal;
    busy: boolean;
    onApply: (content: string) => void;
    onReject: () => void;
    onClose: () => void;
    styles: ReturnType<typeof createStyles>;
    theme: Theme;
  }>,
) {
  const { proposal, styles, theme } = props;
  const plan = useMemo(
    () => createProposalDiffPlan(proposal.baseContent, proposal.proposedContent),
    [proposal.baseContent, proposal.proposedContent],
  );
  const hunkIds = useMemo(
    () => plan.flatMap((piece) => (piece.kind === "change" ? [piece.id] : [])),
    [plan],
  );
  const [accepted, setAccepted] = useState<ReadonlySet<number>>(() => new Set(hunkIds));
  const [focused, setFocused] = useState(0);
  const candidate = renderProposalDiffPlan(plan, accepted);
  const focusedId = hunkIds[focused] ?? null;

  function toggleFocused(): void {
    if (focusedId === null) return;
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(focusedId)) next.delete(focusedId);
      else next.add(focusedId);
      return next;
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Review changes
          </Text>
          <Text numberOfLines={1} style={styles.path}>
            {proposal.targetPath}
          </Text>
        </View>
        <Pressable accessibilityLabel="Close proposal" onPress={props.onClose} style={styles.icon}>
          <X color={theme.colors.text} size={22} />
        </Pressable>
      </View>
      {proposal.explanation ? <Text style={styles.explanation}>{proposal.explanation}</Text> : null}
      <View style={styles.diff}>
        <TextDiffView after={candidate} before={proposal.baseContent} />
      </View>
      {proposal.state === "pending" && hunkIds.length > 0 ? (
        <View style={styles.segmentReview}>
          <Text style={styles.segmentStatus}>
            Change {focused + 1} of {hunkIds.length} · {accepted.size} accepted
          </Text>
          <View style={styles.segmentActions}>
            <Pressable
              disabled={focused === 0}
              onPress={() => setFocused((value) => Math.max(0, value - 1))}
              style={styles.segmentButton}
            >
              <Text style={styles.smallAction}>Previous</Text>
            </Pressable>
            <Pressable onPress={toggleFocused} style={styles.segmentButton}>
              <Text style={styles.smallAction}>
                {focusedId !== null && accepted.has(focusedId) ? "Reject change" : "Accept change"}
              </Text>
            </Pressable>
            <Pressable
              disabled={focused >= hunkIds.length - 1}
              onPress={() => setFocused((value) => Math.min(hunkIds.length - 1, value + 1))}
              style={styles.segmentButton}
            >
              <Text style={styles.smallAction}>Next</Text>
            </Pressable>
          </View>
          <View style={styles.bulkActions}>
            <Pressable onPress={() => setAccepted(new Set())}>
              <Text style={styles.bulkText}>Reject all segments</Text>
            </Pressable>
            <Pressable onPress={() => setAccepted(new Set(hunkIds))}>
              <Text style={styles.bulkText}>Accept all segments</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <Text style={styles.safety}>
        {proposal.state === "pending"
          ? "Nothing is written until you apply these changes."
          : `Proposal status: ${proposal.state.replace("_", " ")}`}
      </Text>
      {proposal.state === "pending" ? (
        <View style={styles.actions}>
          <Pressable disabled={props.busy} onPress={props.onReject} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Reject proposal</Text>
          </Pressable>
          <Pressable
            disabled={props.busy || accepted.size === 0}
            onPress={() => props.onApply(candidate)}
            style={[styles.primaryButton, (props.busy || accepted.size === 0) && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {props.busy
                ? "Applying…"
                : accepted.size === hunkIds.length
                  ? "Apply all"
                  : accepted.size === 0
                    ? "No changes selected"
                    : "Apply selected"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, gap: 10, padding: 16, backgroundColor: theme.colors.background },
    header: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerCopy: { minWidth: 0, flex: 1 },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    path: { marginTop: 3, color: theme.colors.mutedText, fontSize: 12 },
    icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    explanation: {
      padding: 10,
      color: theme.colors.text,
      fontSize: 12,
      lineHeight: 18,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
    },
    diff: {
      flex: 1,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: 10,
    },
    segmentReview: { gap: 7, padding: 9, borderRadius: 10, backgroundColor: theme.colors.surface },
    segmentStatus: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center",
    },
    segmentActions: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
    segmentButton: { minHeight: 34, flex: 1, alignItems: "center", justifyContent: "center" },
    smallAction: { color: theme.colors.text, fontSize: 10, fontWeight: "600" },
    bulkActions: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
    bulkText: { color: theme.colors.accent, fontSize: 10, fontWeight: "600" },
    safety: { color: theme.colors.mutedText, fontSize: 11, textAlign: "center" },
    actions: { flexDirection: "row", gap: 10, paddingBottom: 6 },
    secondaryButton: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 10,
    },
    secondaryText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    primaryButton: {
      minHeight: 48,
      flex: 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
    disabled: { opacity: 0.5 },
  });
}
