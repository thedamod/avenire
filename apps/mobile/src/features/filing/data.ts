import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { call } from "@avenire/client-runtime/rpc";
import type { Folder, LibraryFile } from "@avenire/contracts";
import { useApi } from "../../state/api";
import { authClient } from "../../state/auth";
import { useLibraryFiles, useNotebooks, useSourceActions } from "../sources/data";

export function useClusterReview() {
  const api = useApi();
  const session = authClient.useSession();
  const owner = session.data?.user.id;
  const key = `avenire.reviewed-clusters.${owner ?? "signed-out"}`;
  const notebooks = useNotebooks();
  const library = useLibraryFiles();
  const actions = useSourceActions();
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  const reviewedRef = useRef<ReadonlySet<string>>(new Set());
  const [readyKey, setReadyKey] = useState<string>();
  const [storageError, setStorageError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    reviewedRef.current = new Set();
    setReviewed(new Set());
    setStorageError(undefined);
    const read =
      Platform.OS === "web"
        ? Promise.resolve().then(() => globalThis.localStorage?.getItem(key) ?? null)
        : SecureStore.getItemAsync(key);
    void read
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (active) {
          const next = new Set(
            Array.isArray(parsed)
              ? parsed.filter((id): id is string => typeof id === "string")
              : [],
          );
          reviewedRef.current = next;
          setReviewed(next);
        }
      })
      .catch((cause: unknown) => {
        if (active) setStorageError(cause);
      })
      .finally(() => {
        if (active) setReadyKey(key);
      });
    return () => {
      active = false;
    };
  }, [key]);
  const remember = useCallback(
    async (folder: Folder) => {
      const next = new Set(reviewedRef.current).add(folder.id);
      const json = JSON.stringify([...next]);
      if (Platform.OS === "web") globalThis.localStorage?.setItem(key, json);
      else await SecureStore.setItemAsync(key, json);
      reviewedRef.current = next;
      setReviewed(next);
    },
    [key],
  );
  function members(folder: Folder) {
    return (
      library.files?.filter((file) => file.kind !== "note" && file.folderIds.includes(folder.id)) ??
      []
    );
  }
  async function keep(folder: Folder, name = folder.name) {
    return actions.run(async () => {
      await call(api, (client) => client["library.updateFolder"]({ folderId: folder.id, name }));
      await remember(folder);
      return true;
    });
  }
  async function skip(folder: Folder) {
    if (!library.files) return undefined;
    return actions.run(async () => {
      // Detach every file before trashing the proposed folder: do not trash originals.
      const attached = library.files?.filter((file) => file.folderIds.includes(folder.id)) ?? [];
      await Promise.all(
        attached.map((file) =>
          call(api, (client) =>
            client["library.placeFile"]({
              fileId: file.id,
              folderIds: file.folderIds.filter((id) => id !== folder.id),
            }),
          ),
        ),
      );
      await call(api, (client) => client["library.trashFolder"]({ folderId: folder.id }));
      await remember(folder);
      return true;
    });
  }
  function remove(folder: Folder, file: LibraryFile) {
    return actions.run(async () => {
      await call(api, (client) =>
        client["library.placeFile"]({
          fileId: file.id,
          folderIds: file.folderIds.filter((id) => id !== folder.id),
        }),
      );
      return true;
    });
  }
  const clusters =
    library.files && readyKey === key
      ? notebooks.folders?.filter((folder) => folder.suggested && !reviewed.has(folder.id))
      : undefined;
  async function resolveAll(mode: "keep" | "skip") {
    // Run serially because each mutation updates the same persisted reviewed set.
    for (const folder of clusters ?? []) {
      const ok = mode === "keep" ? await keep(folder) : await skip(folder);
      if (!ok) return;
    }
  }
  return {
    clusters,
    members,
    keep,
    skip,
    remove,
    resolveAll,
    busy: actions.busy,
    loading: notebooks.loading || library.loading || readyKey !== key,
    error: notebooks.error ?? library.error ?? actions.error ?? storageError,
    refetch: () => {
      void notebooks.refetch();
      void library.refetch();
    },
  };
}
