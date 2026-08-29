import { useMemo, useState } from 'react';
import { buildSkillGraph, layoutSkillGraph, type GraphSkillSource, type LaidOutNode } from '../skill/graph';
import { capabilityLabel } from '../skill/capabilities';
import type { SkillSpec } from '../skill/spec';
import { CapabilityChipList } from './CapabilityChips';

type Props = {
  spec: SkillSpec;
  /** Whatever the registry resolved for the transitive dependency tree. */
  resolved: GraphSkillSource[];
  rootId?: string;
  loading?: boolean;
  onInspectSkill?: (skillId: string) => void;
};

const nodeTone = (node: LaidOutNode) => {
  if (node.missing) return { fill: 'fill-red-50', stroke: 'stroke-red-300', text: 'fill-red-700' };
  if (node.root) return { fill: 'fill-amber-50', stroke: 'stroke-amber-400', text: 'fill-amber-900' };
  if (node.type === 'meta') return { fill: 'fill-violet-50', stroke: 'stroke-violet-300', text: 'fill-violet-900' };
  return { fill: 'fill-white', stroke: 'stroke-stone-300', text: 'fill-stone-700' };
};

/**
 * The dependency architecture of a meta skill, drawn as a layered DAG.
 *
 * The flat id list stops being readable the moment a dependency has
 * dependencies of its own. This shows the whole install footprint, marks the
 * ids the registry could not resolve, marks cycles, and rolls the capability
 * contracts up — a meta skill can only run where every part of it can run.
 */
export default function ArchitectureGraph({ spec, resolved, rootId, loading, onInspectSkill }: Props) {
  const [focused, setFocused] = useState<string | null>(null);

  const graph = useMemo(
    () => buildSkillGraph(spec, resolved, rootId ? { rootId } : {}),
    [spec, resolved, rootId],
  );
  const layout = useMemo(() => layoutSkillGraph(graph), [graph]);
  const focusedNode = focused ? layout.nodes.find((node) => node.id === focused) ?? null : null;

  const dependencies = spec.dependencies ?? [];

  if (spec.type !== 'meta' && dependencies.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 p-6 text-center">
        <p className="text-sm font-medium text-stone-600">This is a basic skill</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-400">
          Architecture appears once the skill orchestrates others. Switch the type to
          <span className="font-medium text-stone-500"> meta</span> in settings and add dependencies to see
          the install footprint, unresolved ids, and the combined capability contract.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-600">Architecture</p>
          <h3 className="mt-1 font-display text-xl font-normal text-stone-900">Meta skill composition</h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
            {graph.installCount} skill{graph.installCount === 1 ? '' : 's'} installed alongside
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
            {graph.layers.length} level{graph.layers.length === 1 ? '' : 's'}
          </span>
          {loading && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">resolving…</span>}
        </div>
      </div>

      {graph.unresolved.length > 0 && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          <span className="font-semibold">{graph.unresolved.length} unresolved dependenc{graph.unresolved.length === 1 ? 'y' : 'ies'}:</span>{' '}
          {graph.unresolved.join(', ')}. Installing this skill would fail until each id exists in the registry.
        </div>
      )}

      {graph.cycles.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span className="font-semibold">Dependency cycle:</span>{' '}
          {graph.cycles.map((cycle) => cycle.join(' → ')).join(' · ')}. Resolution stops at the repeat.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-100 bg-stone-50/70 p-3">
        <svg
          role="img"
          aria-label={`Dependency graph for ${spec.name || 'this skill'}`}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto block"
        >
          <defs>
            <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" className="fill-stone-400" />
            </marker>
          </defs>

          {layout.edges.map((edge) => (
            <path
              key={`${edge.from}->${edge.to}`}
              d={edge.path}
              fill="none"
              markerEnd="url(#graph-arrow)"
              className={edge.cycle ? 'stroke-amber-500' : 'stroke-stone-300'}
              strokeWidth={1.5}
              strokeDasharray={edge.cycle ? '4 3' : undefined}
            />
          ))}

          {layout.nodes.map((node) => {
            const tone = nodeTone(node);
            const isFocused = focused === node.id;
            const requiredCount = node.capabilities.filter((c) => c.level === 'required').length;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className="cursor-pointer"
                onClick={() => setFocused(isFocused ? null : node.id)}
              >
                <rect
                  width={node.width}
                  height={node.height}
                  rx={12}
                  className={`${tone.fill} ${isFocused ? 'stroke-amber-500' : tone.stroke}`}
                  strokeWidth={isFocused ? 2 : 1.25}
                />
                <text x={12} y={22} className={`${tone.text} text-[12px] font-semibold`} style={{ fontSize: 12 }}>
                  {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                </text>
                <text x={12} y={40} className="fill-stone-400" style={{ fontSize: 10 }}>
                  {node.missing ? 'unresolved' : node.type === 'meta' ? `meta · ${node.dependencies.length} deps` : 'basic'}
                  {requiredCount > 0 ? ` · ${requiredCount} cap` : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {focusedNode && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-stone-800">{focusedNode.label}</p>
              <p className="text-xs text-stone-400">
                {focusedNode.root ? 'This skill' : focusedNode.id}
                {focusedNode.category ? ` · ${focusedNode.category}` : ''}
              </p>
            </div>
            {!focusedNode.root && !focusedNode.missing && onInspectSkill && (
              <button
                type="button"
                onClick={() => onInspectSkill(focusedNode.id)}
                className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
              >
                Open in registry
              </button>
            )}
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-stone-500">Declared capabilities</p>
            <CapabilityChipList
              capabilities={focusedNode.capabilities}
              emptyLabel="None declared — this skill runs on any model."
            />
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-stone-100 pt-4">
        <p className="mb-1.5 text-xs font-medium text-stone-500">
          Combined capability contract
          <span className="ml-1.5 font-normal text-stone-400">
            (this skill plus everything it installs)
          </span>
        </p>
        <CapabilityChipList
          capabilities={graph.capabilityRollup}
          emptyLabel="Nothing in this tree declares a capability requirement."
        />
        {graph.capabilityRollup.length > (spec.capabilities?.length ?? 0) && (
          <p className="mt-2 text-xs text-stone-400">
            Dependencies add{' '}
            {graph.capabilityRollup
              .filter((capability) => !(spec.capabilities ?? []).some((own) => own.id === capability.id))
              .map((capability) => capabilityLabel(capability.id))
              .join(', ')}
            . A runtime must satisfy all of it to invoke this skill end to end.
          </p>
        )}
      </div>
    </div>
  );
}
