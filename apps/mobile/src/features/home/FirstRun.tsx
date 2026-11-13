import { View } from "react-native";
import { Button, Icon, Pressable, Text } from "../../ui";

const steps = [
  {
    title: "Capture on your computer",
    copy: "Press ⌥C in Avenire for Mac or Windows. PDFs, lecture videos and pages land in Sources here.",
  },
  {
    title: "Make a notebook per course",
    copy: "Or leave things unfiled. Ava can sort them tonight.",
  },
  {
    title: "Ask about any of it",
    copy: "Answers cite the exact page or minute.",
  },
] as const;
export function FirstRun({
  onNew,
  onDownload,
  onAsk,
}: {
  onNew: () => void;
  onDownload: () => void;
  onAsk: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
      <View
        style={{ borderWidth: 1, borderColor: "#222222", borderRadius: 10 }}
      >
        {steps.map((step, index) => (
          <View
            key={step.title}
            style={{
              flexDirection: "row",
              padding: 16,
              gap: 14,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: "#222222",
            }}
          >
            <Text
              variant="mono"
              color="fg-3"
              style={{ width: 18, paddingTop: 2 }}
            >{`0${index + 1}`}</Text>
            <View style={{ flex: 1, gap: 8 }}>
              {index === 0 ? (
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {["⌥", "C"].map((key) => (
                    <View
                      key={key}
                      style={{
                        height: 24,
                        minWidth: 24,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderBottomWidth: 2,
                        borderColor: "#3A3A3A",
                        backgroundColor: "#1C1C1C",
                        paddingHorizontal: 7,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        variant="mono"
                        color="fg"
                        style={{ fontSize: 11.5 }}
                      >
                        {key}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : index === 1 ? (
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {["#2B9BD8", "#EF4579", "#D9A50D"].map((color) => (
                    <View
                      key={color}
                      style={{
                        width: 10,
                        height: 14,
                        borderRadius: 1,
                        backgroundColor: color,
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ask Ava"
                  hitSlop={10}
                  onPress={onAsk}
                  style={{
                    alignSelf: "flex-start",
                    height: 24,
                    paddingHorizontal: 10,
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: "#1A2236",
                  }}
                >
                  <Text variant="meta" color="accent-text" weight="500">
                    Ask Ava
                  </Text>
                </Pressable>
              )}
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "600",
                  color: "#EDEDED",
                }}
              >
                {step.title}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 19 }}>{step.copy}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ paddingTop: 12, gap: 6 }}>
        <Button
          accessibilityLabel="New notebook"
          variant="secondary"
          icon="plus"
          onPress={onNew}
          style={{ height: 44, borderRadius: 10 }}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#EDEDED" }}>
            New notebook
          </Text>
        </Button>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Get Avenire for your computer"
          onPress={onDownload}
          style={{
            flexDirection: "row",
            gap: 6,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="laptop" size={14} />
          <Text style={{ fontSize: 14, fontWeight: "500" }}>
            Get Avenire for your computer
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
