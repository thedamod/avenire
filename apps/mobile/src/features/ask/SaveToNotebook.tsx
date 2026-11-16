import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { FileId, Folder, FolderId } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { useApi } from "../../state/api";
import {
  Button,
  ErrorState,
  Icon,
  Input,
  Pressable,
  ScrollFade,
  Text,
  errorMessage,
} from "../../ui";
import { coverColors } from "../home/data";
import { FeatureOverlay } from "../home/FeatureOverlay";

export function SaveToNotebook({
  open,
  onClose,
  folders,
  guess,
  title,
  markdown,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  folders: readonly Folder[];
  guess: FolderId | null;
  title: string;
  markdown: string;
  onSaved: (fileId: FileId, folder: Folder) => void;
}) {
  const api = useApi();
  const [selected, setSelected] = useState<FolderId>();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<unknown>();
  const created = useRef<Folder | undefined>(undefined);
  useEffect(() => {
    if (open) {
      setSelected(guess ?? folders[0]?.id);
      setNaming(false);
      setName("");
      setError(undefined);
      created.current = undefined;
    }
  }, [open]);
  const ordered = guess
    ? [
        ...folders.filter((folder) => folder.id === guess),
        ...folders.filter((folder) => folder.id !== guess),
      ]
    : folders;
  const save = async () => {
    if (locked.current || (!naming && !selected) || (naming && !name.trim()))
      return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      let folder = folders.find((item) => item.id === selected);
      if (naming) {
        if (!created.current || created.current.name !== name.trim()) {
          created.current = await call(api, (client) =>
            client["library.createFolder"]({ name: name.trim() }),
          );
          invalidateLibrary(api, ["folders"]);
        }
        folder = created.current;
      }
      if (!folder) throw new Error("Choose a notebook first.");
      const destination = folder;
      const note = await call(api, (client) =>
        client["library.createNote"]({
          title:
            title.replace(/\s+/g, " ").trim().slice(0, 200) || "Ava's answer",
          markdown,
          folderIds: [destination.id],
          source: "chat",
        }),
      );
      invalidateLibrary(api, ["files", "folders", "notes"]);
      onSaved(note.id, folder);
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <FeatureOverlay
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      label="Save to notebook"
    >
      <View
        style={{
          paddingTop: 6,
          paddingBottom: 12,
          paddingHorizontal: 20,
          gap: 2,
        }}
      >
        <Text variant="heading">Save to notebook</Text>
        <Text variant="meta" style={{ fontSize: 13, lineHeight: 18 }}>
          Saved as a note with its citations.
        </Text>
      </View>
      <ScrollFade
        color="#131313"
        top={false}
        size={16}
        style={{ flex: 0, flexShrink: 1, maxHeight: 300 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
          {ordered.map((folder) => (
            <Pressable
              key={folder.id}
              accessibilityRole="radio"
              accessibilityLabel={`Save to ${folder.name}${folder.id === guess ? ", Ava's guess" : ""}`}
              accessibilityState={{
                checked: !naming && selected === folder.id,
              }}
              disabled={busy}
              onPress={() => {
                setSelected(folder.id);
                setNaming(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                height: 52,
                paddingHorizontal: 20,
                backgroundColor:
                  !naming && selected === folder.id ? "#1C1C1C" : "transparent",
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 13,
                  borderRadius: 1,
                  backgroundColor: coverColors[folder.color],
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 16,
                  lineHeight: 20,
                  color: "#EDEDED",
                  fontWeight: !naming && selected === folder.id ? "500" : "400",
                }}
              >
                {folder.name}
              </Text>
              {folder.id === guess ? (
                <Text variant="meta">Ava's guess</Text>
              ) : null}
              {!naming && selected === folder.id ? (
                <Icon name="check" color="#ABC4FF" strokeWidth={1.8} />
              ) : null}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new notebook for this answer"
            disabled={busy}
            onPress={() => setNaming(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              height: 52,
              paddingHorizontal: 20,
            }}
          >
            <Icon name="plus" size={14} />
            <Text style={{ fontSize: 16 }}>New notebook…</Text>
          </Pressable>
        </ScrollView>
      </ScrollFade>
      {naming ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Input
            autoFocus
            accessibilityLabel="New notebook name"
            placeholder="Notebook name"
            maxLength={120}
            value={name}
            onChangeText={setName}
            editable={!busy}
            onSubmitEditing={() => void save()}
          />
        </View>
      ) : null}
      {error ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <ErrorState message={errorMessage(error)} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Button
          accessibilityLabel={
            naming ? "Create notebook and save note" : "Save note"
          }
          onPress={() => void save()}
          busy={busy}
          disabled={naming ? !name.trim() : !selected}
          style={{ height: 44, borderRadius: 10 }}
        >
          <Text
            style={{
              fontSize: 15,
              lineHeight: 18,
              fontWeight: "500",
              color: "#0A0A0A",
            }}
          >
            Save note
          </Text>
        </Button>
      </View>
    </FeatureOverlay>
  );
}
