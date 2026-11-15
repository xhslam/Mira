import { useLayoutEffect, useRef, useEffect } from "react";
import { BackHandler } from "react-native";

/** Keep registration order stable while reading the latest committed screen state. */
export function useAndroidBack(enabled: boolean, onBack: () => void): void {
  const action = useRef(onBack);
  useLayoutEffect(() => {
    action.current = onBack;
  }, [onBack]);
  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      action.current();
      return true;
    });
    return () => subscription.remove();
  }, [enabled]);
}
