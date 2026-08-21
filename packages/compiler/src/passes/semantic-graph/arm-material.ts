import type {
	ModuleGraphInterfaceArmMaterial,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
} from '../../artifacts.ts';

/**
 * The compiled markup of one component, published on the module-graph interface
 * when an importing module can rebuild the component from it without running it.
 *
 * A component qualifies when its body is markup and prop reads: no state or
 * computed of its own, no shared instance it reads or writes, and no element in
 * its markup that this module wired to a handler, a behavior, an overlay, or an
 * element handle. Those are the things that only exist while the component runs,
 * and a caller that rebuilds an `@if` arm never runs it. Everything else about
 * the placement - the props passed, the arm's own shape - is the caller's to
 * judge, so this stays a fact about the component alone.
 */
export function armMaterialField(
	graph: Pick<
		SemanticGraphArtifact,
		| 'graphBindings'
		| 'sharedInstances'
		| 'events'
		| 'behaviors'
		| 'overlays'
		| 'elementHandleBindings'
	>,
	componentName: string,
	chunks: ReadonlyArray<SemanticMarkupChunk>,
): { readonly armMaterial?: ModuleGraphInterfaceArmMaterial } {
	if (chunks.length === 0) return {};
	if (graph.graphBindings.some((binding) => owns(binding, componentName))) return {};
	if (graph.sharedInstances.some((instance) => instance.componentName === componentName)) return {};
	const hostNodeIds = new Set(chunks.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)));
	const wired = [
		...graph.events,
		...graph.behaviors,
		...graph.overlays,
		...graph.elementHandleBindings,
	].some((record) => hostNodeIds.has(record.hostNodeId));
	return wired ? {} : { armMaterial: { chunks } };
}

function owns(
	binding: SemanticGraphArtifact['graphBindings'][number],
	componentName: string,
): boolean {
	return binding.componentName === componentName && binding.kind !== 'prop';
}
