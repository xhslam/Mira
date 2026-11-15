import * as Clipboard from "expo-clipboard";
import type { Token, Tokens } from "marked";
import { useMemo, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { parseRichText, richListItemContent, safeRichTextUrl } from "../ai/rich-text";
import { useTheme } from "./theme";

export function AiRichMessage({ content }: Readonly<{ content: string }>) {
  const { colors } = useTheme();
  const tokens = useMemo(() => parseRichText(content), [content]);
  const [notice, setNotice] = useState("");
  const styles = StyleSheet.create({
    body: { color: colors.text, fontSize: 15, lineHeight: 24 },
    code: {
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      fontSize: 13,
      lineHeight: 20,
      color: colors.text,
    },
    panel: { backgroundColor: colors.canvas, borderRadius: 12, padding: 12, gap: 8 },
    link: { color: colors.accent, textDecorationLine: "underline" },
    muted: { color: colors.mutedText, fontSize: 12 },
  });
  function inline(items: readonly Token[], depth = 0): ReactNode {
    if (depth > 16) return null;
    return items.map((token, index) => {
      const key = `${depth}-${index}`;
      switch (token.type) {
        case "strong":
          return (
            <Text key={key} style={{ fontWeight: "700" }}>
              {inline((token as Tokens.Strong).tokens, depth + 1)}
            </Text>
          );
        case "em":
          return (
            <Text key={key} style={{ fontStyle: "italic" }}>
              {inline((token as Tokens.Em).tokens, depth + 1)}
            </Text>
          );
        case "del":
          return (
            <Text key={key} style={{ textDecorationLine: "line-through" }}>
              {inline((token as Tokens.Del).tokens, depth + 1)}
            </Text>
          );
        case "codespan":
          return (
            <Text key={key} style={[styles.code, { backgroundColor: colors.surfaceMuted }]}>
              {(token as Tokens.Codespan).text}
            </Text>
          );
        case "link": {
          const link = token as Tokens.Link;
          const url = safeRichTextUrl(link.href);
          return (
            <Text
              key={key}
              accessibilityRole={url ? "link" : "text"}
              style={url ? styles.link : undefined}
              onPress={
                url
                  ? () => {
                      void Linking.openURL(url).catch(() => setNotice("链接暂时无法打开"));
                    }
                  : undefined
              }
            >
              {inline(link.tokens, depth + 1)}
            </Text>
          );
        }
        case "image":
          return <Text key={key}>[图片：{(token as Tokens.Image).text}]</Text>;
        case "br":
          return "\n";
        default:
          return (
            <Text key={key}>
              {"tokens" in token && Array.isArray(token.tokens)
                ? inline(token.tokens as Token[], depth + 1)
                : "text" in token
                  ? String(token.text)
                  : token.raw}
            </Text>
          );
      }
    });
  }
  function blocks(items: readonly Token[], depth = 0): ReactNode {
    if (depth > 16) return null;
    return items.map((token, index) => {
      const key = `${depth}-${index}`;
      switch (token.type) {
        case "space":
          return null;
        case "heading": {
          const heading = token as Tokens.Heading;
          return (
            <Text
              key={key}
              selectable
              accessibilityRole="header"
              style={[
                styles.body,
                {
                  fontSize: heading.depth === 1 ? 23 : heading.depth === 2 ? 20 : 17,
                  lineHeight: heading.depth <= 2 ? 29 : 25,
                  fontWeight: "600",
                  marginTop: 8,
                },
              ]}
            >
              {inline(heading.tokens)}
            </Text>
          );
        }
        case "code": {
          const code = token as Tokens.Code;
          return (
            <View key={key} style={styles.panel}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
                <Text style={styles.muted}>{code.lang || "代码"}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="复制代码"
                  onPress={() => {
                    void Clipboard.setStringAsync(code.text)
                      .then(() => setNotice("代码已复制"))
                      .catch(() => setNotice("复制失败"));
                  }}
                >
                  <Text style={styles.link}>复制</Text>
                </Pressable>
              </View>
              <ScrollView horizontal>
                <Text selectable style={styles.code}>
                  {code.text}
                </Text>
              </ScrollView>
            </View>
          );
        }
        case "blockquote":
          return (
            <View
              key={key}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: colors.divider,
                paddingLeft: 12,
                gap: 8,
              }}
            >
              {blocks((token as Tokens.Blockquote).tokens, depth + 1)}
            </View>
          );
        case "list": {
          const list = token as Tokens.List;
          return (
            <View key={key} style={{ gap: 8 }}>
              {list.items.map((item, ordinal) => (
                <View key={ordinal} style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={styles.body}>
                    {item.task
                      ? item.checked
                        ? "☑"
                        : "☐"
                      : list.ordered
                        ? `${Number(list.start) + ordinal}.`
                        : "•"}
                  </Text>
                  <View style={{ flex: 1, gap: 8 }}>
                    {blocks(richListItemContent(item), depth + 1)}
                  </View>
                </View>
              ))}
            </View>
          );
        }
        case "table": {
          const table = token as Tokens.Table;
          return (
            <ScrollView key={key} horizontal>
              <View
                style={{
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.divider,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {[table.header, ...table.rows].map((row, rowIndex) => (
                  <View
                    key={rowIndex}
                    style={{
                      flexDirection: "row",
                      backgroundColor: rowIndex === 0 ? colors.surfaceMuted : colors.canvas,
                    }}
                  >
                    {row.map((cell, cellIndex) => (
                      <Text
                        key={cellIndex}
                        selectable
                        style={[
                          styles.body,
                          {
                            width: 180,
                            padding: 10,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.divider,
                            fontWeight: rowIndex === 0 ? "600" : "400",
                            textAlign: table.align[cellIndex] ?? "left",
                          },
                        ]}
                      >
                        {inline(cell.tokens)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }
        case "hr":
          return (
            <View
              key={key}
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.divider,
                marginVertical: 8,
              }}
            />
          );
        default:
          return (
            <Text key={key} selectable style={styles.body}>
              {"tokens" in token && Array.isArray(token.tokens)
                ? inline(token.tokens as Token[])
                : "text" in token
                  ? String(token.text)
                  : token.raw}
            </Text>
          );
      }
    });
  }
  return (
    <View style={{ gap: 10, minWidth: 0 }}>
      {blocks(tokens)}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
}
