import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "./navigation";

export const citationPage = (value: string): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 1;
};
export const citationTime = (value: string): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
export const fileIds = (value: string) =>
  value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

export const screenPaths = {
  Home: "",
  Ask: "ask",
  Notebook: "notebook/:folderId",
  Note: "note/:fileId",
  Chat: "chat/:threadId",
  Output: "chat/:threadId/output/:output",
  Citation: { path: "source/:sourceId", parse: { page: citationPage, time: citationTime } },
  Tasks: "tasks",
  TaskDetail: "tasks/:taskId",
  ScheduleTask: "schedule",
  NewNotebook: "new-notebook",
  SourcesSelect: { path: "select-sources", parse: { selectedIds: fileIds } },
  Move: { path: "move", parse: { fileIds } },
  ClusterReview: "clusters",
  Settings: "settings",
  Trash: "trash",
  Onboarding: "onboarding",
} satisfies NonNullable<LinkingOptions<RootStackParamList>["config"]>["screens"];
