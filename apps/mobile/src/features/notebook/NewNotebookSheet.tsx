import { FeatureSheetHeader as SheetHeader, FeatureErrorState as ErrorState } from "./FeatureUi";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import type { Folder, FolderColor, FolderCover } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import { Button, Input, Screen, ScrollFade, Text, errorMessage } from "../../ui";
import { CoverPicker, NotebookPreview } from "./CoverPicker";
import { useNotebookActions } from "./data";

export function NewNotebookSheet({ navigation }: ScreenProps<"NewNotebook">) {
  return (
    <Screen edges={["left", "right", "bottom"]} style={{ backgroundColor: "#131313" }}>
      <SheetHeader title="New notebook" onClose={() => navigation.goBack()} />
      <NewNotebookForm
        onCreated={(folder) => navigation.replace("Notebook", { folderId: folder.id })}
      />
    </Screen>
  );
}

export function NewNotebookForm({ onCreated }: { onCreated: (folder: Folder) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<FolderColor>("purple");
  const [cover, setCover] = useState<FolderCover>("cradle");
  const actions = useNotebookActions();
  async function create() {
    if (!name.trim()) return;
    const folder = await actions.create({ name: name.trim(), color, cover });
    if (folder) onCreated(folder);
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollFade top={false} color="#131313">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, flexGrow: 1, paddingBottom: 20 }}
        >
          <View style={{ alignItems: "center", paddingTop: 18, paddingBottom: 22 }}>
            <NotebookPreview
              name={name.trim() || "Untitled notebook"}
              color={color}
              cover={cover}
            />
          </View>
          <Input
            label="Name"
            accessibilityLabel="Notebook name"
            placeholder="e.g. Statistical Mechanics"
            maxLength={120}
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={() => void create()}
            style={{ height: 44, borderRadius: 10, fontSize: 16 }}
          />
          <View style={{ paddingTop: 20 }}>
            <CoverPicker color={color} cover={cover} onColor={setColor} onCover={setCover} />
          </View>
          {actions.error ? (
            <View style={{ paddingTop: 16 }}>
              <ErrorState message={errorMessage(actions.error)} />
            </View>
          ) : null}
          <View style={{ flex: 1, minHeight: 32 }} />
          <Text variant="meta" style={{ textAlign: "center", paddingBottom: 12 }}>
            Ruth can file new captures here automatically.
          </Text>
          <Button
            accessibilityLabel="Create notebook"
            busy={actions.busy}
            disabled={!name.trim()}
            onPress={() => void create()}
            style={{ height: 44, borderRadius: 10 }}
          >
            <Text style={{ color: "#0A0A0A", fontSize: 15, fontWeight: "500" }}>
              Create notebook
            </Text>
          </Button>
        </ScrollView>
      </ScrollFade>
    </KeyboardAvoidingView>
  );
}
