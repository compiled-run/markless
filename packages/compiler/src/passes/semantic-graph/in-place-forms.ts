import { IN_PLACE_SUBMIT_POLICY } from '@markless/serializer';
import type { SemanticGraphArtifact } from '../../artifacts.ts';
import { formLeavesPageDiagnostic, type NativeFormReason } from './diagnostics.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { PostFormCandidate } from './types.ts';

type FormGraph = Pick<SemanticGraphArtifact, 'templateReads' | 'componentEdges' | 'components'> & {
	events: SemanticGraphArtifact['events'][number][];
	diagnostics: SemanticGraphArtifact['diagnostics'][number][];
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
	let placed: ComponentPlacement | undefined;
	for (const form of forms) {
		if (handledAround(form.hostNodeId)) continue;
		if (!form.catchBoundaryId) {
			placed ??= componentPlacement(graph, facts, handledAround);
			if (!form.componentName || !placed.caught.has(form.componentName)) {
				const reason = form.componentName ? placed.native.get(form.componentName) : undefined;
				if (reason && !form.leavesByDesign)
					graph.diagnostics.push(formLeavesPageDiagnostic(form.componentName!, reason, form.sourceSpan));
				continue;
			}
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

type ComponentPlacement = {
	/** Components this file alone renders, only as tags, each inside a `@try` with a `@catch` and no submit handler around it. */
	readonly caught: ReadonlySet<string>;
	/** Components that render inside a `@try` with a `@catch` here but are not caught, and why. */
	readonly native: ReadonlyMap<string, NativeFormReason>;
};

function componentPlacement(
	graph: FormGraph,
	facts: FormFacts,
	handledAround: (hostNodeId: string | undefined) => boolean,
): ComponentPlacement {
	const semantic = facts.semantic();
	const edgesOf = (name: string) =>
		graph.componentEdges.filter((edge) => !edge.importSource && edge.childComponentName === name);
	const usedOtherwise = new Map<string, NativeFormReason>();
	for (const component of graph.components) {
		if (component.exportName) {
			usedOtherwise.set(component.name, { kind: 'exported' });
			continue;
		}
		const binding = semantic.bindings.find(
			(candidate) => candidate.scope === semantic.rootScope && candidate.name === component.name,
		);
		if (!binding) continue;
		const parents = binding.references.map((reference) => semantic.parentOf(reference.node)?.type);
		const opened = parents.filter((type) => type === 'JSXOpeningElement').length;
		if (!parents.every((type) => type === 'JSXOpeningElement' || type === 'JSXClosingElement'))
			usedOtherwise.set(component.name, { kind: 'value' });
		// Every opening tag must be a component edge: a tag outside any component body records none.
		else if (opened !== edgesOf(component.name).length)
			usedOtherwise.set(component.name, { kind: 'outside' });
	}
	// A submit handler around a tag makes that form the handler's: neither sent in place nor warned about.
	const handled = new Set(
		graph.components
			.map((component) => component.name)
			.filter((name) => edgesOf(name).some((edge) => handledAround(facts.edgeHosts.get(edge.id)))),
	);
	const fixedPoint = (counts: (name: string) => boolean, enters: (edges: ReturnType<typeof edgesOf>, set: ReadonlySet<string>) => boolean) => {
		const set = new Set<string>();
		for (let grew = true; grew; ) {
			grew = false;
			for (const { name } of graph.components) {
				if (set.has(name) || !counts(name)) continue;
				if (enters(edgesOf(name), set)) {
					set.add(name);
					grew = true;
				}
			}
		}
		return set;
	};
	const inCatch = (edge: ReturnType<typeof edgesOf>[number], set: ReadonlySet<string>) =>
		Boolean(edge.catchBoundaryId) || set.has(edge.parentComponentName);
	const caught = fixedPoint(
		(name) => !usedOtherwise.has(name) && !handled.has(name),
		(edges, set) => edges.length > 0 && edges.every((edge) => inCatch(edge, set)),
	);
	const somewhereInCatch = fixedPoint(
		(name) => !handled.has(name),
		(edges, set) => edges.some((edge) => inCatch(edge, set)),
	);
	const native = new Map<string, NativeFormReason>();
	for (const name of somewhereInCatch) {
		if (caught.has(name)) continue;
		const outside = edgesOf(name).find((edge) => !inCatch(edge, caught));
		const reason =
			usedOtherwise.get(name) ??
			(outside ? { kind: 'outside' as const, parentComponentName: outside.parentComponentName } : undefined);
		if (reason) native.set(name, reason);
	}
	return { caught, native };
}
