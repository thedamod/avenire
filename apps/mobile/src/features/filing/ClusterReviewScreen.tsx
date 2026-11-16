import {
  FeatureHeader as GlassHeader,
  FeatureErrorState as ErrorState,
} from "../notebook/FeatureUi";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { Folder, LibraryFile } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import {
  Button,
  EmptyState,
  FileIcon,
  IconButton,
  Input,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { fileIconType, sourceHost } from "../sources/data";
import { useClusterReview } from "./data";

function ClusterGroup({
  folder,
  members,
  busy,
  onKeep,
  onSkip,
  onRemove,
  onOpen,
}: {
  folder: Folder;
  members: readonly LibraryFile[];
  busy: boolean;
  onKeep: (name: string) => Promise<unknown>;
  onSkip: () => void;
  onRemove: (file: LibraryFile) => void;
  onOpen: (file: LibraryFile) => void;
}) {
  const [name, setName] = useState(folder.name);
  const [renaming, setRenaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? members : members.slice(0, 3);
  return (
    <View style={{ paddingTop: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingBottom: 8 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, color: "#6E6E6E" }}>New notebook</Text>
        <Text
          style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "600", color: "#EDEDED" }}
        >
          {folder.name}
        </Text>
      </View>
      {renaming ? (
        <View style={{ paddingBottom: 12, gap: 8 }}>
          <Input
            accessibilityLabel={`Name for ${folder.name}`}
            maxLength={120}
            value={name}
            onChangeText={setName}
            autoFocus
            style={{ height: 44 }}
          />
          <Button
            accessibilityLabel="Keep cluster with this name"
            disabled={!name.trim() || busy}
            style={{ height: 44 }}
            onPress={() => {
              void onKeep(name.trim());
            }}
          >
            Save
          </Button>
        </View>
      ) : null}
      {shown.map((file) => (
        <View
          key={file.id}
          style={{
            borderTopWidth: 1,
            borderTopColor: "#222222",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ width: 16, flexShrink: 0 }}>
            <FileIcon
              type={fileIconType(file)}
              {...(file.sourceUrl ? { url: file.sourceUrl } : {})}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${file.title}`}
            onPress={() => onOpen(file)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 56,
              justifyContent: "center",
              gap: 1,
              paddingVertical: 10,
            }}
          >
            <Text numberOfLines={1} style={{ color: "#EDEDED", fontSize: 15, lineHeight: 20 }}>
              {file.title}
            </Text>
            <Text variant="meta">{sourceHost(file)}</Text>
          </Pressable>
          <IconButton
            icon="close"
            accessibilityLabel={`Remove ${file.title} from ${folder.name}`}
            disabled={busy}
            iconSize={13}
            size={44}
            onPress={() => onRemove(file)}
          />
        </View>
      ))}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: "#222222",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingTop: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded
              ? "Show fewer cluster sources"
              : `Show ${members.length - shown.length} more sources`
          }
          disabled={members.length <= 3}
          onPress={() => setExpanded(!expanded)}
          style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 13, lineHeight: 18, color: "#6E6E6E" }}>
            {members.length > shown.length
              ? `${members.length - shown.length} more`
              : expanded
                ? "Show less"
                : `${members.length} sources`}
          </Text>
        </Pressable>
        <Button
          accessibilityLabel={`Rename ${folder.name}`}
          disabled={busy}
          hitSlop={6}
          variant="ghost"
          onPress={() => setRenaming(!renaming)}
        >
          Rename
        </Button>
        <Button
          accessibilityLabel={`Skip ${folder.name}`}
          disabled={busy}
          hitSlop={6}
          variant="ghost"
          onPress={onSkip}
        >
          Skip
        </Button>
        <Button
          accessibilityLabel={`Accept ${folder.name}`}
          disabled={busy}
          hitSlop={6}
          variant="secondary"
          onPress={() => {
            void onKeep(folder.name);
          }}
        >
          Create
        </Button>
      </View>
    </View>
  );
}
export function ClusterReviewScreen({ navigation }: ScreenProps<"ClusterReview">) {
  const review = useClusterReview();
  const [scrolled, setScrolled] = useState(false);
  const total =
    review.clusters?.reduce((sum, folder) => sum + review.members(folder).length, 0) ?? 0;
  return (
    <Screen>
      <GlassHeader title="" onBack={() => navigation.goBack()} />
      <ScrollFade top={scrolled}>
        <ScrollView
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        >
          <Text
            style={{
              fontSize: 26,
              lineHeight: 32,
              fontWeight: "600",
              letterSpacing: -0.52,
              color: "#EDEDED",
            }}
          >
            Sort {total} unfiled sources
          </Text>
          <Text style={{ paddingTop: 6, fontSize: 14, lineHeight: 20, color: "#A3A3A3" }}>
            Ava grouped them overnight. Remove anything that doesn't belong. Nothing moves until
            you accept.
          </Text>
          {review.error ? (
            <View style={{ paddingTop: 20 }}>
              <ErrorState message={errorMessage(review.error)} onRetry={review.refetch} />
            </View>
          ) : null}
          {review.loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : review.clusters?.length ? (
            review.clusters.map((folder) => (
              <ClusterGroup
                key={folder.id}
                folder={folder}
                members={review.members(folder)}
                busy={review.busy}
                onKeep={(name) => review.keep(folder, name)}
                onSkip={() => {
                  void review.skip(folder);
                }}
                onRemove={(file) => {
                  void review.remove(folder, file);
                }}
                onOpen={(file) => navigation.navigate("Citation", { sourceId: file.id })}
              />
            ))
          ) : !review.error ? (
            <EmptyState title="Nothing left to review." />
          ) : null}
        </ScrollView>
      </ScrollFade>
      {review.clusters?.length && !review.loading ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 12,
            paddingTop: 12,
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: "#222222",
          }}
        >
          <Button
            accessibilityLabel="Skip all proposed notebooks"
            disabled={review.busy}
            variant="ghost"
            style={{ height: 44 }}
            onPress={() => {
              void review.resolveAll("skip");
            }}
          >
            Skip all
          </Button>
          <Button
            accessibilityLabel="Accept all proposed notebooks"
            busy={review.busy}
            style={{ height: 44 }}
            onPress={() => {
              void review.resolveAll("keep");
            }}
          >
            Accept all
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
