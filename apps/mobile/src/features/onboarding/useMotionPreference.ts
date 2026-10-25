import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

/** Reanimated supplies the startup value; native events cover changes while setup is open. */
export function useMotionPreference() {
  const startupValue = useReducedMotion();
  const [reduced, setReduced] = useState(startupValue);
  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}
