import {
  FeatureSheetHeader as SheetHeader,
  FeatureErrorState as ErrorState,
} from "../notebook/FeatureUi";
import { useLayoutEffect, useState } from "react";
import { FlatList, View } from "react-native";
import type { FolderId } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import {
  Divider,
  EmptyState,
  Icon,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { coverColors } from "../notebook/CoverPicker";
import { FeatureOverlay } from "../notebook/FeatureOverlay";
import { NewNotebookForm } from "../notebook/NewNotebookSheet";
import { plural } from "../notebook/data";
import { useNotebooks, useSourceActions } from "../sources/data";

export function MoveSheet({ route, navigation }: ScreenProps<"Move">) {
  useLayoutEffect(() => {
    navigation.setOptions({ sheetAllowedDetents: [0.45, 0.92], sheetInitialDetentIndex: 0 });
  }, [navigation]);
  const fileIds = [...new Set(route.params?.fileIds ?? [])];
  const notebooks = useNotebooks();
  const actions = useSourceActions();
  const [creating, setCreating] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  async function move(folderId: FolderId) {
    if (!fileIds.length) return;
    if (await actions.move(fileIds, folderId)) navigation.goBack();
  }
  return (
    <Screen edges={["left", "right", "bottom"]} style={{ backgroundColor: "#131313" }}>
      <SheetHeader
        title={`Move ${plural(fileIds.length, "source")} to`}
        onClose={() => navigation.goBack()}
      />
      {actions.error ? (
        <View style={{ padding: 20 }}>
          <ErrorState message={errorMessage(actions.error)} />
        </View>
      ) : null}
      {notebooks.error ? (
        <View style={{ padding: 20 }}>
          <ErrorState
            message={errorMessage(notebooks.error)}
            onRetry={() => void notebooks.refetch()}
          />
        </View>
      ) : null}
      <ScrollFade top={scrolled} color="#131313">
        {!fileIds.length ? <EmptyState title="No sources selected" description="Select sources from your library to move them." /> : null}
        <FlatList
          data={notebooks.folders}
          keyExtractor={(folder) => folder.id}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move to ${item.name}`}
              disabled={actions.busy || !fileIds.length}
              onPress={() => void move(item.id)}
              style={{
                minHeight: 52,
                paddingHorizontal: 20,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 13,
                  borderTopLeftRadius: 1,
                  borderBottomLeftRadius: 1,
                  borderTopRightRadius: 2,
                  borderBottomRightRadius: 2,
                  backgroundColor: coverColors[item.color],
                }}
              />
              <Text
                style={{
                  flex: 1,
                  color: "#EDEDED",
                  fontSize: 16,
                  lineHeight: 20,
                  fontWeight: "500",
                }}
              >
                {item.name}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            notebooks.loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : !notebooks.error ? (
              <EmptyState
                title="No notebooks yet"
                description="Create a notebook for these sources."
              />
            ) : null
          }
          ListFooterComponent={
            <>
              <Divider inset={0} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a new notebook and move sources there"
                disabled={actions.busy || !fileIds.length}
                onPress={() => setCreating(true)}
                style={{
                  minHeight: 52,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Icon name="plus" size={14} />
                <Text style={{ fontSize: 16, lineHeight: 20 }}>New notebook…</Text>
              </Pressable>
            </>
          }
        />
      </ScrollFade>
      <FeatureOverlay visible={creating} title="New notebook" onClose={() => setCreating(false)}>
        <View style={{ height: 640 }}>
          <NewNotebookForm
            onCreated={(folder) => {
              setCreating(false);
              void move(folder.id);
            }}
          />
        </View>
      </FeatureOverlay>
    </Screen>
  );
}
