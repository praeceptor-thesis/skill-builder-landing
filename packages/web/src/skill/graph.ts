/**
 * The architecture graph for meta skills.
 *
 * A meta skill orchestrates other skills, and once dependencies nest more than
 * one level the flat id list stops being readable. This turns the root spec
 * plus whatever the registry could resolve into a layered DAG, flags the two
 * failure modes an author actually hits (a dependency that does not resolve,
 * and a cycle), and rolls every node's capability contract up to the root — a
 * meta skill can only run where all of its parts can run.
 */

import { normalizeCapabilities, type SkillCapability } from './capabilities';
import type { SkillSpec, SkillType } from './spec';

export type GraphNode = {
  id: string;
  label: string;
  type: SkillType;
  /** 0 for the root, 1 for its direct dependencies, and so on. */
  depth: number;
  root: boolean;
  /** The registry had no such skill — installing this meta skill would fail. */
  missing: boolean;
  category?: string;
  capabilities: SkillCapability[];
  dependencies: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  /** Part of a dependency cycle: drawn as a warning, never followed. */
  cycle: boolean;
};

export type SkillGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Nodes bucketed by depth, ready to lay out as rows. */
  layers: GraphNode[][];
  cycles: string[][];
  unresolved: string[];
  /** Union of every node's declared capabilities; `required` wins over `preferred`. */
  capabilityRollup: SkillCapability[];
  /** Total skills installed alongside the root. */
  installCount: number;
};

/** The shape the graph needs from a resolved dependency; a Skill satisfies it. */
export type GraphSkillSource = {
  id: string;
  name?: string;
  category?: string;
  type?: string;
  dependencies?: string[];
  spec?: { capabilities?: unknown; dependencies?: string[]; type?: string } | null;
  missing?: boolean;
};

const ROOT_ID = '__root__';

const sourceDependencies = (source: GraphSkillSource): string[] => {
  const deps = source.dependencies?.length ? source.dependencies : source.spec?.dependencies ?? [];
  return deps.filter((dep): dep is string => typeof dep === 'string' && dep.trim().length > 0);
};

const sourceType = (source: GraphSkillSource, dependencies: string[]): SkillType => {
  if (dependencies.length > 0) return 'meta';
  const declared = source.type ?? source.spec?.type;
  return declared === 'meta' ? 'meta' : 'basic';
};

/**
 * Build the graph. `resolved` holds whatever the registry returned for the
 * root's transitive dependencies; ids missing from it become `missing` nodes
 * rather than disappearing, because a silently dropped dependency is exactly
 * the bug this view exists to surface.
 */
export function buildSkillGraph(
  spec: SkillSpec,
  resolved: GraphSkillSource[] = [],
  options: { rootId?: string } = {},
): SkillGraph {
  const rootId = options.rootId ?? ROOT_ID;
  const byId = new Map<string, GraphSkillSource>();
  for (const source of resolved) {
    if (source?.id) byId.set(source.id, source);
  }

  const rootDependencies = (spec.dependencies ?? []).filter(Boolean);
  const nodes = new Map<string, GraphNode>([
    [rootId, {
      id: rootId,
      label: spec.name || 'Untitled skill',
      type: spec.type === 'meta' || rootDependencies.length > 0 ? 'meta' : 'basic',
      depth: 0,
      root: true,
      missing: false,
      category: spec.category,
      capabilities: normalizeCapabilities(spec.capabilities),
      dependencies: rootDependencies,
    }],
  ]);

  const edges: GraphEdge[] = [];
  const unresolved: string[] = [];
  const seenEdges = new Set<string>();

  // Breadth-first so `depth` is the shortest path from the root, which is what
  // makes the layered layout stable when a skill is reachable two ways.
  const queue: Array<{ id: string; depth: number; parent: string }> = rootDependencies.map((id) => ({
    id, depth: 1, parent: rootId,
  }));

  while (queue.length > 0) {
    const { id, depth, parent } = queue.shift()!;
    const edgeKey = `${parent}->${id}`;
    if (!seenEdges.has(edgeKey)) {
      seenEdges.add(edgeKey);
      edges.push({ from: parent, to: id, cycle: false });
    }

    const existing = nodes.get(id);
    if (existing) {
      // Keep the shallowest depth so a shared dependency renders once, high up.
      existing.depth = Math.min(existing.depth, depth);
      continue;
    }

    const source = byId.get(id);
    const missing = !source || source.missing === true;
    const dependencies = source ? sourceDependencies(source) : [];

    if (missing) unresolved.push(id);

    nodes.set(id, {
      id,
      label: source?.name || id,
      type: sourceType(source ?? { id }, dependencies),
      depth,
      root: false,
      missing,
      category: source?.category,
      capabilities: normalizeCapabilities(source?.spec?.capabilities),
      dependencies,
    });

    for (const child of dependencies) {
      queue.push({ id: child, depth: depth + 1, parent: id });
    }
  }

  const cycles = findCycles(nodes, edges);
  const cycleEdges = new Set<string>();
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i += 1) {
      cycleEdges.add(`${cycle[i]}->${cycle[(i + 1) % cycle.length]}`);
    }
  }
  for (const edge of edges) {
    if (cycleEdges.has(`${edge.from}->${edge.to}`)) edge.cycle = true;
  }

  const nodeList = [...nodes.values()].sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label));
  const maxDepth = nodeList.reduce((max, node) => Math.max(max, node.depth), 0);
  const layers: GraphNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const node of nodeList) layers[node.depth].push(node);

  return {
    nodes: nodeList,
    edges,
    layers,
    cycles,
    unresolved,
    capabilityRollup: normalizeCapabilities(nodeList.flatMap((node) => node.capabilities)),
    installCount: nodeList.length - 1,
  };
}

/** Iterative DFS cycle detection; returns each cycle as its node id ring. */
function findCycles(nodes: Map<string, GraphNode>, edges: GraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge.to);
  }

  const cycles: string[][] = [];
  const seenCycle = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string) => {
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(id);
      if (start >= 0) {
        const ring = stack.slice(start);
        const key = [...ring].sort().join('|');
        if (!seenCycle.has(key)) {
          seenCycle.add(key);
          cycles.push(ring);
        }
      }
      return;
    }

    state.set(id, 'visiting');
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of nodes.keys()) visit(id);
  return cycles;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type LaidOutNode = GraphNode & { x: number; y: number; width: number; height: number };

export type GraphLayout = {
  nodes: LaidOutNode[];
  edges: Array<GraphEdge & { path: string }>;
  width: number;
  height: number;
};

const NODE_WIDTH = 172;
const NODE_HEIGHT = 58;
const COLUMN_GAP = 24;
const ROW_GAP = 62;
const PADDING = 16;

/** Centre each layer horizontally and route edges as vertical bezier curves. */
export function layoutSkillGraph(graph: SkillGraph): GraphLayout {
  const widest = graph.layers.reduce((max, layer) => Math.max(max, layer.length), 1);
  const width = PADDING * 2 + widest * NODE_WIDTH + (widest - 1) * COLUMN_GAP;
  const height = PADDING * 2 + graph.layers.length * NODE_HEIGHT + Math.max(0, graph.layers.length - 1) * ROW_GAP;

  const positioned = new Map<string, LaidOutNode>();
  graph.layers.forEach((layer, depth) => {
    const layerWidth = layer.length * NODE_WIDTH + (layer.length - 1) * COLUMN_GAP;
    const startX = (width - layerWidth) / 2;
    layer.forEach((node, index) => {
      positioned.set(node.id, {
        ...node,
        x: startX + index * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + depth * (NODE_HEIGHT + ROW_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  });

  const edges = graph.edges.flatMap((edge) => {
    const from = positioned.get(edge.from);
    const to = positioned.get(edge.to);
    if (!from || !to) return [];

    const startX = from.x + from.width / 2;
    const startY = from.y + from.height;
    const endX = to.x + to.width / 2;
    const endY = to.y;
    const midY = (startY + endY) / 2;

    return [{
      ...edge,
      path: `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`,
    }];
  });

  return { nodes: [...positioned.values()], edges, width, height };
}
