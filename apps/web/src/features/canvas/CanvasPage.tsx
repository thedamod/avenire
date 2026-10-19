"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Handle,
  Position,
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodesChange,
  applyNodeChanges,
} from "@xyflow/react";
import * as Schema from "effect/Schema";
import { FileText, Image, Link2, Pencil, Video, Music2 } from "lucide-react";
import type { CanvasNode, Folder, LibraryFile } from "@avenire/contracts";
import { CanvasNodeId } from "@avenire/contracts";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { useApi, useQuery, errorMessage } from "~/lib/rpc";
import { call } from "@avenire/client-runtime/rpc";
import { FileDetail } from "~/features/library/FileDetail";

type CanvasNodeData = {
  readonly ref: CanvasNode["ref"];
  readonly file?: LibraryFile;
  readonly folder?: Folder;
  readonly onOpenFile: (file: LibraryFile) => void;
  readonly onRename: (folder: Folder, name: string) => void;
};
type FlowNode = Node<CanvasNodeData>;

function iconFor(kind: LibraryFile["kind"]) {
  if (kind === "video" || kind === "audio") return kind === "video" ? Video : Music2;
  if (kind === "image") return Image;
  if (kind === "web-page") return Link2;
  return FileText;
}

function FolderCard({ data }: NodeProps<FlowNode>) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.folder?.name ?? "Cluster");
  const folder = data.folder;
  if (!folder) return null;
  return (
    <div className="h-full w-full border border-border bg-card/80 p-3">
      <Handle type="target" position={Position.Left} />
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            data.onRename(folder, name);
            setEditing(false);
          }}
        >
          <Input
            aria-label="Cluster name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-medium">{folder.name}</span>
          {folder.suggested ? (
            <span className="text-xs text-muted-foreground">Suggested</span>
          ) : null}
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label={`Rename ${folder.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </button>
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{folder.fileCount} files</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function FileCard({ data }: NodeProps<FlowNode>) {
  const file = data.file;
  if (!file) return null;
  const Icon = iconFor(file.kind);
  return (
    <button
      className="flex h-full w-full items-center gap-2 border border-border bg-background px-3 text-left text-sm hover:bg-muted"
      onDoubleClick={() => data.onOpenFile(file)}
      title="Double-click to open"
    >
      <Handle type="target" position={Position.Left} />
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="line-clamp-2">{file.title}</span>
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

const nodeTypes: NodeTypes = { folder: FolderCard, file: FileCard };

export function CanvasPage() {
  const api = useApi();
  const {
    data: saved,
    loading: savedLoading,
    error: savedError,
    refetch,
  } = useQuery((client) => client["library.getCanvas"](), "canvas-nodes");
  const { data: folders } = useQuery((client) => client["library.listFolders"](), "canvas-folders");
  const { data: files } = useQuery(
    (client) => client["library.listFiles"]({ placement: "filed" }),
    "canvas-files",
  );
  const [selectedFile, setSelectedFile] = useState<LibraryFile>();
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [error, setError] = useState<string>();
  const rename = useCallback(
    (folder: Folder, name: string) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      void call(api, (client) =>
        client["library.renameFolder"]({ folderId: folder.id, name: cleanName }),
      )
        .then(() => refetch())
        .catch((cause: unknown) => setError(errorMessage(cause)));
    },
    [api, refetch],
  );

  useEffect(() => {
    if (!saved || !folders || !files) return;
    const canvasByRef = new Map<string, CanvasNode[]>();
    for (const node of saved) {
      const key =
        node.ref._tag === "file"
          ? `file:${node.ref.fileId}`
          : node.ref._tag === "folder"
            ? `folder:${node.ref.folderId}`
            : `sketch:${node.id}`;
      const matching = canvasByRef.get(key) ?? [];
      matching.push(node);
      canvasByRef.set(key, matching);
    }
    const next: FlowNode[] = [];
    folders.forEach((folder, index) => {
      const stored = canvasByRef.get(`folder:${folder.id}`)?.[0];
      next.push({
        id: stored?.id ?? Schema.decodeUnknownSync(CanvasNodeId)(`auto-folder-${folder.id}`),
        type: "folder",
        position: {
          x: stored?.x ?? 80 + (index % 3) * 440,
          y: stored?.y ?? 80 + Math.floor(index / 3) * 340,
        },
        style: { width: stored?.width ?? 360, height: stored?.height ?? 280 },
        data: {
          ref: { _tag: "folder", folderId: folder.id },
          folder,
          onOpenFile: setSelectedFile,
          onRename: rename,
        },
        zIndex: 0,
      });
    });
    const copies = new Map<string, string[]>();
    const canvasFiles = files.filter((file) => file.placement === "filed");
    canvasFiles.forEach((file, index) => {
      const memberships = file.folderIds.length > 0 ? file.folderIds : [undefined];
      memberships.forEach((folderId, copyIndex) => {
        const key = `file:${file.id}${folderId ? `:${folderId}` : ""}`;
        const stored = canvasByRef.get(`file:${file.id}`)?.[copyIndex];
        const id =
          stored?.id ??
          Schema.decodeUnknownSync(CanvasNodeId)(`auto-file-${file.id}-${folderId ?? "loose"}`);
        const folderIndex = folderId
          ? Math.max(
              0,
              folders.findIndex((folder) => folder.id === folderId),
            )
          : folders.length;
        const x = stored?.x ?? 104 + (folderIndex % 3) * 440 + (index % 2) * 170;
        const y = stored?.y ?? 138 + Math.floor(folderIndex / 3) * 340 + (index % 6) * 48;
        next.push({
          id,
          type: "file",
          position: { x, y },
          style: { width: 220, height: 62 },
          data: {
            ref: { _tag: "file", fileId: file.id },
            file,
            onOpenFile: setSelectedFile,
            onRename: rename,
          },
        });
        const ids = copies.get(file.id) ?? [];
        ids.push(id);
        copies.set(file.id, ids);
        void key;
      });
    });
    setNodes(next);
  }, [saved, folders, files, rename]);

  const onNodesChange: OnNodesChange<FlowNode> = useCallback(
    (changes) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  const edges = useMemo<Edge[]>(() => {
    const memberships = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.data.file) {
        const existing = memberships.get(node.data.file.id) ?? [];
        existing.push(node.id);
        memberships.set(node.data.file.id, existing);
      }
    }
    const links: Edge[] = [];
    for (const [fileId, ids] of memberships) {
      for (let index = 1; index < ids.length; index += 1) {
        const source = ids[0];
        const target = ids[index];
        if (source && target)
          links.push({
            id: `symlink-${fileId}-${index}`,
            source,
            target,
            style: { strokeDasharray: "5 5" },
            animated: false,
          });
      }
    }
    return links;
  }, [nodes]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const timer = window.setTimeout(() => {
      const persisted: CanvasNode[] = nodes.map((node) => ({
        id: Schema.decodeUnknownSync(CanvasNodeId)(node.id),
        ref: node.data.ref,
        x: node.position.x,
        y: node.position.y,
        width: typeof node.style?.width === "number" ? node.style.width : 220,
        height: typeof node.style?.height === "number" ? node.style.height : 62,
      }));
      void call(api, (client) => client["library.saveCanvas"]({ nodes: persisted })).catch(
        (cause: unknown) => setError(errorMessage(cause)),
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [api, nodes]);

  return (
    <section className="flex h-full min-h-[32rem] flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <h1 className="text-lg font-semibold">Canvas</h1>
        {error || savedError ? (
          <p role="alert" className="text-sm text-destructive">
            {error ?? errorMessage(savedError)}
          </p>
        ) : null}
      </header>
      {savedLoading || !folders || !files ? (
        <p className="p-5 text-sm text-muted-foreground">Loading your library…</p>
      ) : (
        <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
          >
            <Background color="var(--canvas-grid)" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {selectedFile ? (
            <FileDetail file={selectedFile} onClose={() => setSelectedFile(undefined)} />
          ) : null}
        </div>
      )}
    </section>
  );
}
