import { BookOpen, Bot, Grid2X2Plus, NotebookPen, Settings } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { PRIMARY_TABS, type PrimaryTab } from "./app-shell-state";
import { useTranslate } from "./locale";
import { CircleAction } from "./mira-controls";
import { triggerClickFeedback } from "./press-feedback";
import { useTheme } from "./theme";
import { useUiSound } from "./ui-sound-context";

const FOOTER_HEIGHT = 66;

const destinationIcons = {
  agent: Bot,
  learn: BookOpen,
  files: NotebookPen,
  settings: Settings,
} as const;

export function PrimaryNavigation({
  activeTab,
  clickVibration,
  onSelect,
  children,
}: Readonly<{
  activeTab: PrimaryTab;
  clickVibration: boolean;
  onSelect: (tab: PrimaryTab) => void;
  children?: ReactNode;
}>) {
  const { colors } = useTheme();
  const t = useTranslate();
  const uiSound = useUiSound();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  return (
    <>
      <View style={styles.footer}>{children}</View>
      {open ? (
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          style={styles.dismissArea}
          onPress={() => setOpen(false)}
        />
      ) : null}
      <View pointerEvents="box-none" style={[styles.stack, height < 320 && styles.horizontalStack]}>
        {open
          ? PRIMARY_TABS.map((id) => {
              const Icon = destinationIcons[id];
              return (
                <CircleAction
                  key={id}
                  label={t(`nav.${id}`)}
                  muted={activeTab === "learn"}
                  selected={id === activeTab}
                  onPress={() => {
                    setOpen(false);
                    if (id === activeTab) return;
                    uiSound.play("select");
                    triggerClickFeedback(clickVibration);
                    onSelect(id);
                  }}
                >
                  <Icon color={id === activeTab ? colors.canvas : colors.text} size={21} />
                </CircleAction>
              );
            })
          : null}
        <CircleAction
          label={open ? "收起应用导航" : "打开应用导航"}
          muted={activeTab === "learn"}
          expanded={open}
          onPress={() => {
            Keyboard.dismiss();
            setOpen((current) => !current);
          }}
        >
          <Grid2X2Plus color={colors.text} size={21} />
        </CircleAction>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    minHeight: FOOTER_HEIGHT,
    justifyContent: "center",
    paddingLeft: 14,
    paddingRight: 70,
  },
  dismissArea: { ...StyleSheet.absoluteFill, bottom: FOOTER_HEIGHT, zIndex: 3 },
  stack: {
    position: "absolute",
    right: 14,
    bottom: 9,
    gap: 8,
    zIndex: 4,
  },
  horizontalStack: { flexDirection: "row" },
});
