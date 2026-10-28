import { useMemo, useRef, useState } from "react";
import type {
  CloudRun,
  FileId,
  Folder,
  FolderColor,
  FolderCover,
  IngestionJob,
  LibraryFile,
  RuthThread,
} from "@avenire/contracts";
import {
  call,
  invalidateLibrary,
  updateLatestJob,
} from "@avenire/client-runtime/rpc";
import { useQuery, useStream } from "../../lib/useRpc";
import { useApi } from "../../state/api";
import type { CoverDrawing } from "../../ui";

export const coverColors: Record<FolderColor, string> = {
  blue: "#2B9BD8",
  pink: "#EF4579",
  green: "#18803A",
  yellow: "#D9A50D",
  purple: "#B48BF2",
  orange: "#E8842C",
  teal: "#2BB5A5",
  gray: "#A3A3A3",
};
export const coverDrawings: Record<FolderCover, CoverDrawing> = {
  cradle: "thermo",
  globe: "ethics",
  compass: "options",
  flask: "ochem",
  book: "research",
  atom: "stat",
  chart: "options",
  leaf: "research",
  none: "research",
};

export function useHomeLibrary() {
  const folders = useQuery(
    (client) => client["library.listFolders"](),
    "library-folders",
  );
  const files = useQuery(
    (client) => client["library.listFiles"]({}),
    "library-files",
  );
  const activeFolders = useMemo(
    () =>
      folders.data
        ?.filter((folder) => folder.archivedAt === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [folders.data],
  );
  const activeFiles = useMemo(
    () =>
      files.data
        ?.filter((file) => file.placement !== "archived")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [files.data],
  );
  const folderById = useMemo(
    () => new Map(activeFolders?.map((folder) => [folder.id, folder])),
    [activeFolders],
  );
  const notes = useMemo(
    () =>
      activeFiles
        ?.filter((file) => file.kind === "note")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [activeFiles],
  );
  const sources = useMemo(
    () => activeFiles?.filter((file) => file.kind !== "note"),
    [activeFiles],
  );
  return {
    folders: activeFolders,
    files: activeFiles,
    notes,
    sources,
    folderById,
    error: folders.error ?? files.error,
    loaded: activeFolders !== undefined && activeFiles !== undefined,
    refetch: () => {
      void folders.refetch();
      void files.refetch();
    },
  };
}

export type HomeActivity =
  | { kind: "chat"; at: string; thread: RuthThread; folder: Folder | undefined }
  | { kind: "run"; at: string; run: CloudRun; folder: Folder | undefined };

export function useHomeActivity(folders: readonly Folder[] | undefined) {
  const threads = useQuery(
    (client) => client["ruth.listThreads"](),
    "library-threads",
  );
  const runs = useQuery(
    (client) => client["cloud.listRuns"]({ limit: 50 }),
    "home-cloud-runs",
  );
  const tasks = useQuery(
    (client) => client["cloud.listTasks"](),
    "activity-cloud-tasks",
  );
  const items = useMemo<HomeActivity[] | undefined>(() => {
    if (threads.data === undefined && runs.data === undefined) return undefined;
    const folderById = new Map(folders?.map((folder) => [folder.id, folder]));
    const taskFolders = new Map(
      tasks.data?.map((task) => [
        task.id,
        task.preHydration.flatMap(
          ({ selector }) =>
            selector.explicit?.folderIds ?? selector.filters?.folderIds ?? [],
        )[0],
      ]),
    );
    return [
      ...(threads.data ?? [])
        .filter((thread) => thread.kind === "chat")
        .map((thread): HomeActivity => ({
          kind: "chat",
          at: thread.lastMessageAt ?? thread.updatedAt,
          thread,
          folder: thread.folderId ? folderById.get(thread.folderId) : undefined,
        })),
      ...(runs.data ?? []).map((run): HomeActivity => ({
        kind: "run",
        at: run.finishedAt ?? run.startedAt ?? run.scheduledFor,
        run,
        folder: folderById.get(run.folderId ?? taskFolders.get(run.taskId)!),
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }, [threads.data, runs.data, tasks.data, folders]);
  return {
    items,
    runs: runs.data,
    cloudThread: threads.data?.find((thread) => thread.kind === "ruth-cloud"),
    error: threads.error ?? runs.error ?? tasks.error,
    refetch: () => {
      void threads.refetch();
      void runs.refetch();
      void tasks.refetch();
    },
  };
}

export function recentToastRun(
  runs: readonly CloudRun[] | undefined,
  now: number,
) {
  return runs
    ?.filter(
      (run) =>
        run.finishedAt &&
        now - Date.parse(run.finishedAt) < 86_400_000 &&
        now >= Date.parse(run.finishedAt) &&
        ((run.status === "succeeded" && run.assets.length > 0) ||
          run.status === "failed"),
    )
    .sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!))[0];
}

export type SourceState =
  | { kind: "processing"; label: string }
  | {
      kind: "password" | "paywall" | "login" | "paused" | "failed";
      reason: string;
    };
const working = new Set([
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "graphing",
  "foldering",
]);
const stageLabels: Record<string, string> = {
  queued: "Waiting to read",
  extracting: "Reading",
  chunking: "Reading",
  embedding: "Indexing",
  graphing: "Linking ideas",
  foldering: "Finding a notebook",
};
function siteOf(file: Pick<LibraryFile, "origin" | "sourceUrl">): string | null {
  const url = file.origin?._tag === "Web" ? file.origin.url : file.sourceUrl;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.hostname.replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
}

/** Paywall and login states come from `file.access`, never from error text (as on web). */
export function sourceState(
  job: IngestionJob | undefined,
  file: Pick<LibraryFile, "access" | "origin" | "sourceUrl">,
): SourceState | null {
  const busy = !!job && working.has(job.status);
  // A re-capture after logging in is read again; until then the stub keeps its access state.
  if (!busy && job?.status !== "paused") {
    if (file.access === "paywalled")
      return {
        kind: "paywall",
        reason: "Behind a paywall. Saved the title and abstract only.",
      };
    if (file.access === "login-required")
      return {
        kind: "login",
        reason: `Needs your ${siteOf(file) ?? "site"} login. Capture it again on your computer with logged-in capture on.`,
      };
  }
  if (!job) return null;
  if (busy) return { kind: "processing", label: stageLabels[job.status] ?? "Reading" };
  if (job.status === "paused")
    return {
      kind: "paused",
      reason: "Paused. Ruth won't read it until you resume.",
    };
  const detail = [
    job.error ?? "",
    ...(job.coverage?.parts.map((part) => part.detail ?? "") ?? []),
  ].join(" ");
  if (job.status === "indexed") return null;
  if (/password|encrypt/i.test(detail))
    return {
      kind: "password",
      reason: "Couldn't open it. The file is password-protected.",
    };
  return job.status === "failed"
    ? {
        kind: "failed",
        reason: `Couldn't read it. ${job.error ?? "Something went wrong."}`,
      }
    : null;
}

export function useSourceJobs(files: readonly LibraryFile[] | undefined) {
  const api = useApi();
  const [jobs, setJobs] = useState<ReadonlyMap<FileId, IngestionJob>>(
    () => new Map(),
  );
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const visible = useRef(files);
  visible.current = files;
  const requested = useRef(new Set<string>());
  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      setError(undefined);
      if (
        visible.current &&
        !visible.current.some((file) => file.id === job.fileId) &&
        !requested.current.has(job.fileId)
      ) {
        requested.current.add(job.fileId);
        invalidateLibrary(api, ["files", "folders"]);
      }
      setJobs((before) => updateLatestJob(before, job));
      // Indexing can change filing and counts; duplicate terminal events need no refresh.
      if (!working.has(job.status) && !requested.current.has(job.id)) {
        requested.current.add(job.id);
        invalidateLibrary(api, ["files", "folders"]);
      }
    },
    `home-ingestion-${attempt}`,
    setError,
  );
  return {
    jobs,
    error,
    reconnect: () => setAttempt((value) => value + 1),
    retry: async (fileId: FileId) => {
      const job = await call(api, (client) =>
        client["library.setIngestionPaused"]({ fileId, paused: false }),
      );
      setJobs((before) => updateLatestJob(before, job));
    },
  };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  const hours = Math.floor((now - Date.parse(iso)) / 3_600_000);
  if (days >= 2) return `${days}d ago`;
  if (days === 1) return "Yesterday";
  return hours >= 1 ? `${hours}h ago` : "Just now";
}
export function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(total % 60).padStart(2, "0")}`;
}
