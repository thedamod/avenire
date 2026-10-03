import type { PropsWithChildren } from "react";
import { View } from "react-native";

export function Card({ children }: PropsWithChildren) {
  return <View className="rounded-2xl border border-border bg-card p-4">{children}</View>;
}
