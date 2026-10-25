import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { FileId, FolderId, CloudTaskId, ThreadId } from "@avenire/contracts";

export type RootStackParamList = {
  Home: undefined;
  Ask: { q?: string } | undefined;
  Notebook: { folderId: FolderId };
  Note: { fileId: FileId };
  NewNotebook: undefined;
  Chat: { threadId: ThreadId; q?: string };
  Output: { threadId: ThreadId; output: "summary" | "quiz" | "revision" | "widget"; id?: string };
  Citation: {
    sourceId: FileId;
    page?: number;
    time?: number;
    region?: { x: number; y: number; width: number; height: number };
  };
  Tasks: undefined;
  TaskDetail: { taskId: CloudTaskId };
  ScheduleTask: undefined;
  SourcesSelect: { selectedIds?: FileId[] } | undefined;
  Move: { fileIds: FileId[] };
  ClusterReview: undefined;
  Settings: undefined;
  Trash: undefined;
  Onboarding: undefined;
  UiGallery: undefined;
};
export type RootNavigation = NavigationProp<RootStackParamList>;
export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
