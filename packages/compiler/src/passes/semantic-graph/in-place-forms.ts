import { IN_PLACE_SUBMIT_POLICY } from '@markless/serializer';
import type { SemanticGraphArtifact } from '../../artifacts.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { PostFormCandidate } from './types.ts';

type FormGraph = Pick<SemanticGraphArtifact, 'templateReads' | 'componentEdges' | 'components'> & {
	events: SemanticGraphArtifact['events'][number][];
};

type FormFacts = {
	readonly hostParents: ReadonlyMap<string, string>;
	readonly edgeHosts: ReadonlyMap<string, string>;
	readonly semantic: () => ModuleSemantics;
};

/**
 * A form that may post, inside a `@try` with a `@catch`, with no submit handler on it or around it: the runtime sends it
 * in place, and a failed send renders in that `@catch`. A form in another component of this file counts when every place
 * that component renders is such a spot; its failure goes to the `@catch` around the element, found where it renders.
 * Runs before the boundary gates are minted, since it makes one.
 */
export function collectInPlaceForms(
	graph: FormGraph,
	facts: FormFacts,
	forms: ReadonlyArray<PostFormCandidate>,
	nextEventId: () => number,
): void {
	if (forms.length === 0) return;
	const { hostParents } = facts;
	const around = (hostNodeId: string | undefined) => {
		const hosts = new Set<string>();
		for (let host = hostNodeId; host; host = hostParents.get(host)) hosts.add(host);
		return hosts;
	};
	const handledAround = (hostNodeId: string | undefined) => {
		const hosts = around(hostNodeId);
		return graph.events.some((event) => event.eventName === 'submit' && hosts.has(event.hostNodeId));
	};
	const inside = (hostNodeId: string, formId: string) => {
		for (let host: string | undefined = hostNodeId; host; host = hostParents.get(host))
			if (host === formId) return true;
		return false;
	};
	let caught: ReadonlySet<string> | undefined;
	for (const form of forms) {
		if (handledAround(form.hostNodeId)) continue;
		if (!form.catchBoundaryId) {
			caught ??= componentsRenderedOnlyInCatches(graph, facts, handledAround);
			if (!form.componentName || !caught.has(form.componentName)) continue;
		}
		// A field whose value or checked state is bound shows state, which a reset would leave out of step.
		const bound = graph.templateReads.some(
			(read) => read.target.kind === 'property' && inside(read.hostNodeId, form.hostNodeId),
		);
		graph.events.push({
			id: `event:${nextEventId()}`,
			hostNodeId: form.hostNodeId,
			eventName: 'submit',
			...(form.componentName ? { componentName: form.componentName } : {}),
			...(form.catchBoundaryId ? { handlerCatchBoundaryId: form.catchBoundaryId } : {}),
			handlerParameters: [],
			hasSyncPolicyCandidate: false,
			syncPolicy: IN_PLACE_SUBMIT_POLICY,
			inPlaceSubmit: bound ? 'keep' : 'reset',
		});
	}
}

// Components this file alone renders, only as tags, each inside a `@try` with a `@catch` and no submit handler around it.
function componentsRenderedOnlyInCatches(
	graph: FormGraph,
	facts: FormFacts,
	handledAround: (hostNodeId: string | undefined) => boolean,
): ReadonlySet<string> {
	const semantic = facts.semantic();
	const edgesOf = (name: string) =>
		graph.componentEdges.filter((edge) => !edge.importSource && edge.childComponentName === name);
	const tagOnly = new Set<string>();
	for (const component of graph.components) {
		if (component.exportName) continue;
		const binding = semantic.bindings.find(
			(candidate) => candidate.scope === semantic.rootScope && candidate.name === component.name,
		);
		if (!binding) continue;
		const parents = binding.references.map((reference) => semantic.parentOf(reference.node)?.type);
		const opened = parents.filter((type) => type === 'JSXOpeningElement').length;
		// Every opening tag must be a component edge: a tag outside any component body records none.
		if (
			opened > 0 &&
			opened === edgesOf(component.name).length &&
			parents.every((type) => type === 'JSXOpeningElement' || type === 'JSXClosingElement')
		)
			tagOnly.add(component.name);
	}
	const caught = new Set<string>();
	for (let grew = true; grew; ) {
		grew = false;
		for (const name of tagOnly) {
			if (caught.has(name)) continue;
			const edges = edgesOf(name);
			if (
				edges.length > 0 &&
				edges.every(
					(edge) =>
						(edge.catchBoundaryId || caught.has(edge.parentComponentName)) &&
						!handledAround(facts.edgeHosts.get(edge.id)),
				)
			) {
				caught.add(name);
				grew = true;
			}
		}
	}
	return caught;
}
