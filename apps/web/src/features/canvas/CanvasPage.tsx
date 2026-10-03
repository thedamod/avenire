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
import type { CanvasNode, Cluster, Item } from "@avenire/contracts";
import { CanvasNodeId } from "@avenire/contracts";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { useApi, useQuery, errorMessage } from "~/lib/rpc";
import { call } from "@avenire/client-runtime/rpc";
import { ItemDetail } from "~/features/library/ItemDetail";

type CanvasNodeData = {
  readonly ref: CanvasNode["ref"];
  readonly item?: Item;
  readonly cluster?: Cluster;
  readonly onOpenItem: (item: Item) => void;
  readonly onRename: (cluster: Cluster, name: string) => void;
};
type FlowNode = Node<CanvasNodeData>;

function iconFor(kind: Item["kind"]) {
  if (kind === "video" || kind === "audio") return kind === "video" ? Video : Music2;
  if (kind === "image") return Image;
  if (kind === "web-page") return Link2;
  return FileText;
}

function ClusterCard({ data }: NodeProps<FlowNode>) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.cluster?.name ?? "Cluster");
  const cluster = data.cluster;
  if (!cluster) return null;
  return (
    <div className="h-full w-full border border-border bg-card/80 p-3">
      <Handle type="target" position={Position.Left} />
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            data.onRename(cluster, name);
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
          <span className="font-medium">{cluster.name}</span>
          {cluster.suggested ? (
            <span className="text-xs text-muted-foreground">Suggested</span>
          ) : null}
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label={`Rename ${cluster.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </button>
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{cluster.itemCount} items</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ItemCard({ data }: NodeProps<FlowNode>) {
  const item = data.item;
  if (!item) return null;
  const Icon = iconFor(item.kind);
  return (
    <button
      className="flex h-full w-full items-center gap-2 border border-border bg-background px-3 text-left text-sm hover:bg-muted"
      onDoubleClick={() => data.onOpenItem(item)}
      title="Double-click to open"
    >
      <Handle type="target" position={Position.Left} />
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="line-clamp-2">{item.title}</span>
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

const nodeTypes: NodeTypes = { cluster: ClusterCard, item: ItemCard };

export function CanvasPage() {
  const api = useApi();
  const {
    data: saved,
    loading: savedLoading,
    error: savedError,
    refetch,
  } = useQuery((client) => client["library.getCanvas"](), "canvas-nodes");
  const { data: clusters } = useQuery(
    (client) => client["library.listClusters"](),
    "canvas-clusters",
  );
  const { data: items } = useQuery(
    (client) => client["library.listItems"]({ placement: "filed" }),
    "canvas-items",
  );
  const [selectedItem, setSelectedItem] = useState<Item>();
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [error, setError] = useState<string>();
  const clusterById = useMemo(
    () => new Map((clusters ?? []).map((cluster) => [cluster.id, cluster])),
    [clusters],
  );
  const itemById = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);

  const rename = useCallback(
    (cluster: Cluster, name: string) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      void call(api, (client) =>
        client["library.renameCluster"]({ clusterId: cluster.id, name: cleanName }),
      )
        .then(() => refetch())
        .catch((cause: unknown) => setError(errorMessage(cause)));
    },
    [api, refetch],
  );

  useEffect(() => {
    if (!saved || !clusters || !items) return;
    const canvasByRef = new Map<string, CanvasNode[]>();
    for (const node of saved) {
      const key =
        node.ref._tag === "item"
          ? `item:${node.ref.itemId}`
          : node.ref._tag === "cluster"
            ? `cluster:${node.ref.clusterId}`
            : `sketch:${node.id}`;
      const matching = canvasByRef.get(key) ?? [];
      matching.push(node);
      canvasByRef.set(key, matching);
    }
    const next: FlowNode[] = [];
    clusters.forEach((cluster, index) => {
      const stored = canvasByRef.get(`cluster:${cluster.id}`)?.[0];
      next.push({
        id: stored?.id ?? Schema.decodeUnknownSync(CanvasNodeId)(`auto-cluster-${cluster.id}`),
        type: "cluster",
        position: {
          x: stored?.x ?? 80 + (index % 3) * 440,
          y: stored?.y ?? 80 + Math.floor(index / 3) * 340,
        },
        style: { width: stored?.width ?? 360, height: stored?.height ?? 280 },
        data: {
          ref: { _tag: "cluster", clusterId: cluster.id },
          cluster,
          onOpenItem: setSelectedItem,
          onRename: rename,
        },
        zIndex: 0,
      });
    });
    const copies = new Map<string, string[]>();
    const canvasItems = items.filter((item) => item.placement === "filed");
    canvasItems.forEach((item, index) => {
      const memberships = item.clusterIds.length > 0 ? item.clusterIds : [undefined];
      memberships.forEach((clusterId, copyIndex) => {
        const key = `item:${item.id}${clusterId ? `:${clusterId}` : ""}`;
        const stored = canvasByRef.get(`item:${item.id}`)?.[copyIndex];
        const id =
          stored?.id ??
          Schema.decodeUnknownSync(CanvasNodeId)(`auto-item-${item.id}-${clusterId ?? "loose"}`);
        const clusterIndex = clusterId
          ? Math.max(
              0,
              clusters.findIndex((cluster) => cluster.id === clusterId),
            )
          : clusters.length;
        const x = stored?.x ?? 104 + (clusterIndex % 3) * 440 + (index % 2) * 170;
        const y = stored?.y ?? 138 + Math.floor(clusterIndex / 3) * 340 + (index % 6) * 48;
        next.push({
          id,
          type: "item",
          position: { x, y },
          style: { width: 220, height: 62 },
          data: {
            ref: { _tag: "item", itemId: item.id },
            item,
            onOpenItem: setSelectedItem,
            onRename: rename,
          },
        });
        const ids = copies.get(item.id) ?? [];
        ids.push(id);
        copies.set(item.id, ids);
        void key;
      });
    });
    setNodes(next);
  }, [saved, clusters, items, rename]);

  const onNodesChange: OnNodesChange<FlowNode> = useCallback(
    (changes) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  const edges = useMemo<Edge[]>(() => {
    const memberships = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.data.item) {
        const existing = memberships.get(node.data.item.id) ?? [];
        existing.push(node.id);
        memberships.set(node.data.item.id, existing);
      }
    }
    const links: Edge[] = [];
    for (const [itemId, ids] of memberships) {
      for (let index = 1; index < ids.length; index += 1) {
        const source = ids[0];
        const target = ids[index];
        if (source && target)
          links.push({
            id: `symlink-${itemId}-${index}`,
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
      {savedLoading || !clusters || !items ? (
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
          {selectedItem ? (
            <ItemDetail item={selectedItem} onClose={() => setSelectedItem(undefined)} />
          ) : null}
        </div>
      )}
    </section>
  );
}
