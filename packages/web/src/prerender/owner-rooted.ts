import type { RuntimeGraph } from '@markless/runtime';
import { marklessReboundSymbolId } from '../fns/bound-symbol.ts';
import {
	marklessInstanceScopedGraph,
	marklessInstanceSegments,
	type MarklessScopedGraph,
} from '../fns/instance-scope.ts';
import type { PrerenderBoundComposer, PrerenderBoundModule, PrerenderRead } from './evaluator.ts';
import type { BranchOwnerPlacement } from './owner-placement.ts';

type BoundSymbols = Readonly<Record<string, string>>;

export type OwnerRootedRender = {
	readonly composer: PrerenderBoundComposer;
	readonly boundSymbols: BoundSymbols;
	// What one of the owner's edges binds, carried on through the edges above the owner, as a whole render's composition would.
	readonly placedAbove: (boundSymbols: BoundSymbols | undefined) => BoundSymbols | undefined;
};

// A render rooted at an owner its file placed stands in for each component above it, read where it stands, so bound ids rebind through their edges as in a whole render.
export function ownerRootedRender(
	surface: {
		readonly components: Readonly<
			Record<string, { readonly edges?: ReadonlyArray<{ readonly id: string; readonly boundSymbols?: BoundSymbols }> }>
		>;
	},
	owner: BranchOwnerPlacement,
	module: PrerenderBoundModule,
	graph: RuntimeGraph,
): OwnerRootedRender | undefined {
	const edges = new Map<string, BoundSymbols>();
	for (const component of Object.values(surface.components))
		for (const edge of component.edges ?? []) edges.set(edge.id, edge.boundSymbols ?? {});
	const page = (graph as MarklessScopedGraph).marklessPageGraph ?? graph;
	const segments = marklessInstanceSegments(owner.ownerPath);
	let composer: PrerenderBoundComposer | undefined;
	let boundSymbols: BoundSymbols | undefined;
	const above: BoundSymbols[] = [];
	let at = 0;
	let path = '';
	for (const step of owner.chain ?? []) {
		const scoped = marklessInstanceScopedGraph(page, owner.moduleRootPath + path);
		const read: PrerenderRead = (graphNodeId, readPath) => scoped.read(graphNodeId, readPath);
		module.instanceReads.set(path, read);
		composer = { symbolPrefix: '', read, module, ...(composer && boundSymbols && { bound: { boundSymbols, composer } }) };
		boundSymbols = edges.get(step.edgeId) ?? {};
		above.unshift(boundSymbols);
		const next = at + (step.rows ?? 0) + marklessInstanceSegments(step.prefix).length;
		path += segments.slice(at, next).join('');
		at = next;
	}
	return (
		composer &&
		boundSymbols && {
			composer,
			boundSymbols,
			placedAbove: (edgeSymbols) =>
				edgeSymbols &&
				Object.fromEntries(
					Object.entries(edgeSymbols).map(([symbolId, bound]) => [
						symbolId,
						above.reduce((id, edge) => marklessReboundSymbolId(edge, id) ?? id, bound),
					]),
				),
		}
	);
}
