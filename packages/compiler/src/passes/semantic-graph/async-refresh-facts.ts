import type {
	SemanticGraphArtifact,
	SemanticGraphBinding,
	SemanticGraphDiagnostic,
	SemanticTemplateRead,
	SourceSpan,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	templateReadPath,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import { asyncKeyInputs, asyncReach } from '../paired-async-values.ts';
import { TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX } from '../public-render/boundary-runner.ts';
import { asyncInputBesideValueDiagnostic, managedAriaBusyDiagnostic } from './diagnostics.ts';
import type { AuthoredAriaBusy, MutableSemanticGraphArtifact } from './types.ts';

type RefreshGraph = Pick<
	SemanticGraphArtifact,
	| 'graphBindings'
	| 'aliases'
	| 'templateReads'
	| 'keyedRepeats'
	| 'hostNodes'
	| 'asyncBoundaries'
	| 'events'
	| 'stateWrites'
>;

export type AsyncRefreshBoundary = {
	readonly boundaryId: string;
	readonly keywordSpan?: SourceSpan;
	/** The async values the block's content reads, directly or through sync computeds. */
	readonly values: ReadonlyArray<SemanticGraphBinding>;
	/** The state and props those values are fetched with. */
	readonly inputs: ReadonlyArray<SemanticGraphBinding>;
	/** The elements a refresh marks busy, in document order, with the async values each reads. */
	readonly busy: ReadonlyArray<{
		readonly tagName: string;
		readonly values: ReadonlyArray<string>;
	}>;
};

/** What a refresh does in each @try block: the values it waits on, their inputs, and the elements it marks busy. */
export function asyncRefreshFacts(graph: RefreshGraph): ReadonlyArray<AsyncRefreshBoundary> {
	const { readNodes, readAsyncValues, hostsById, bindingsById } = refreshContext(graph);
	const namedInputs = asyncRefreshInputs(graph);
	const order = new Map(graph.hostNodes.map((host, index) => [host.id, index]));
	return graph.asyncBoundaries.map((boundary) => {
		const values = new Set<string>();
		const busyHosts = new Map<string, Set<string>>();
		for (const { hostNodeId, asyncValues } of boundaryReads(
			graph,
			boundary.id,
			readNodes,
			readAsyncValues,
		)) {
			for (const value of asyncValues) {
				values.add(value);
				busyHosts.set(hostNodeId, (busyHosts.get(hostNodeId) ?? new Set()).add(value));
			}
		}
		return {
			boundaryId: boundary.id,
			...(boundary.keywordSpan ? { keywordSpan: boundary.keywordSpan } : {}),
			values: [...values].flatMap((id) => bindingsById.get(id) ?? []),
			inputs: [...new Set([...values].flatMap(namedInputs))],
			busy: [...busyHosts]
				.sort(([left], [right]) => (order.get(left) ?? 0) - (order.get(right) ?? 0))
				.flatMap(([id, read]) => {
					const tagName = hostsById.get(id)?.tagName;
					return tagName ? [{ tagName, values: [...read] }] : [];
				}),
		};
	});
}

/** The state and props an async value is fetched with, through sync computeds and upstream async values. */
export function asyncRefreshInputs(
	graph: Pick<SemanticGraphArtifact, 'graphBindings'>,
): (graphNodeId: string) => ReadonlyArray<SemanticGraphBinding> {
	const bindingsById = new Map(graph.graphBindings.map((binding) => [binding.id, binding]));
	const inputsOf = asyncKeyInputs(
		new Map(
			graph.graphBindings.flatMap((binding) =>
				binding.kind === 'computed' ? [[binding.id, binding] as const] : [],
			),
		),
	);
	return (graphNodeId) =>
		[...inputsOf(graphNodeId)].flatMap((id) => {
			const binding = bindingsById.get(id);
			return binding && (binding.kind === 'state' || binding.kind === 'prop')
				? [binding]
				: [];
		});
}

// Text inside a @try that shows one of its async value's inputs without the value switches before the new data lands.
export function collectAsyncInputBesideValueDiagnostics(
	graph: RefreshGraph &
		Pick<SemanticGraphArtifact, 'filename'> & { diagnostics: SemanticGraphDiagnostic[] },
): void {
	const { readAsyncValues, readNodes, hostsById, bindingsById } = refreshContext(graph);
	const { shownInputs, fetchInputs } = inputEdges(graph, bindingsById);
	for (const boundary of graph.asyncBoundaries) {
		const reads = boundaryReads(graph, boundary.id, readNodes, readAsyncValues);
		const values = [...new Set(reads.flatMap((read) => read.asyncValues))];
		if (values.length === 0) continue;
		for (const { read, hostNodeId, asyncValues } of reads) {
			if (!read || read.target.kind !== 'text' || asyncValues.length > 0) continue;
			if (CONTROL_TAGS.has(hostsById.get(hostNodeId)?.tagName ?? '')) continue;
			const shown = shownInputs(read);
			const value = values.find((id) => [...fetchInputs(id).keys()].some((key) => shown.has(key)));
			if (!value) continue;
			const input = [...fetchInputs(value).values()].find((edge) => shown.has(edge.key))!;
			if (hostWrites(graph, hostNodeId).has(input.graphNodeId)) continue;
			graph.diagnostics.push(
				asyncInputBesideValueDiagnostic({
					read: read.authoredSource ?? read.source,
					input: input.name,
					value: bindingsById.get(value)?.name ?? value,
					span: read.sourceSpan,
				}),
			);
		}
	}
}

type InputEdge = { readonly key: string; readonly graphNodeId: string; readonly name: string };

// Inputs keyed per prop, not per props object: `{a}` beside a value fetched with `b` reads no input of it.
function inputEdges(
	graph: RefreshGraph,
	bindingsById: ReadonlyMap<string, SemanticGraphBinding>,
) {
	const edgeOf = (graphNodeId: string, path: ReadonlyArray<string>): InputEdge | null => {
		const binding = bindingsById.get(graphNodeId);
		if (binding?.kind !== 'state' && binding?.kind !== 'prop') return null;
		const prop = graphNodeId === 'prop:props' ? path[0] : undefined;
		if (graphNodeId === 'prop:props' && prop === undefined) return null;
		return prop === undefined
			? { key: graphNodeId, graphNodeId, name: binding.name }
			: { key: `${graphNodeId}.${prop}`, graphNodeId, name: prop };
	};
	const collect = (
		graphNodeId: string,
		into: Map<string, InputEdge>,
		seen: Set<string>,
		throughAsync: boolean,
	): void => {
		if (seen.has(graphNodeId)) return;
		seen.add(graphNodeId);
		const binding = bindingsById.get(graphNodeId);
		if (binding?.kind !== 'computed') return;
		for (const dependency of binding.dependencies ?? []) {
			if (dependency.armGuard) continue;
			const edge = edgeOf(dependency.graphNodeId, dependency.path);
			if (edge) into.set(edge.key, edge);
			const upstream = bindingsById.get(dependency.graphNodeId);
			if (upstream?.kind === 'computed' && (throughAsync || upstream.async !== true))
				collect(dependency.graphNodeId, into, seen, throughAsync);
		}
	};
	const fetched = new Map<string, ReadonlyMap<string, InputEdge>>();
	const fetchInputs = (graphNodeId: string): ReadonlyMap<string, InputEdge> => {
		let inputs = fetched.get(graphNodeId);
		if (!inputs) {
			const into = new Map<string, InputEdge>();
			collect(graphNodeId, into, new Set(), true);
			fetched.set(graphNodeId, (inputs = into));
		}
		return inputs;
	};
	const shownInputs = (read: SemanticTemplateRead): ReadonlySet<string> => {
		const into = new Map<string, InputEdge>();
		if (read.computedGraphNodeId) collect(read.computedGraphNodeId, into, new Set(), false);
		else {
			const resolved = resolveGraphPath(
				templateReadPath(read),
				graphBindingMap(graph, null, read.componentName),
				semanticAliasMap(graph as SemanticGraphArtifact, null, read.componentName),
			);
			const edge = resolved ? edgeOf(resolved.binding.id, resolved.path) : null;
			if (edge) into.set(edge.key, edge);
			else if (resolved) collect(resolved.binding.id, into, new Set(), false);
		}
		return new Set(into.keys());
	};
	return { shownInputs, fetchInputs };
}

/**
 * Text that joins state with an async value, inside a control (the nearest enclosing
 * control element), reads the state that control's own handlers write as written.
 * The rest of the text stays matched to what the async value was fetched with.
 */
export function markControlWrittenInputs(
	graph: Omit<RefreshGraph, 'graphBindings'> &
		Pick<MutableSemanticGraphArtifact, 'graphBindings'>,
	hostParents: ReadonlyMap<string, string>,
): void {
	const { reach, hostsById } = refreshContext(graph);
	const control = (hostNodeId: string) => {
		let host: string | undefined = hostNodeId;
		while (host && !CONTROL_TAGS.has(hostsById.get(host)?.tagName ?? ''))
			host = hostParents.get(host);
		return host;
	};
	const marked = new Map<string, ReadonlySet<string>>();
	for (const read of graph.templateReads) {
		const id = read.computedGraphNodeId;
		if (read.target.kind !== 'text' || !id?.startsWith(TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX))
			continue;
		const host = control(read.hostNodeId);
		if (!host || reach([id]).asyncValues.size === 0) continue;
		const written = hostWrites(graph, host);
		if (written.size > 0) marked.set(id, written);
	}
	if (marked.size === 0) return;
	graph.graphBindings = graph.graphBindings.map((binding) => {
		const written = marked.get(binding.id);
		if (
			!written ||
			!binding.dependencies?.some((dependency) => written.has(dependency.graphNodeId))
		)
			return binding;
		return {
			...binding,
			dependencies: binding.dependencies.map((dependency) =>
				written.has(dependency.graphNodeId)
					? { ...dependency, writtenByControl: true as const }
					: dependency,
			),
		};
	});
}

// The runtime owns aria-busy on every element a refresh marks, so an authored one there is overwritten.
export function collectManagedAriaBusyDiagnostics(
	graph: RefreshGraph & { diagnostics: SemanticGraphDiagnostic[] },
	authored: ReadonlyArray<AuthoredAriaBusy>,
): void {
	if (authored.length === 0) return;
	const { readNodes, readAsyncValues } = refreshContext(graph);
	const marked = new Set(
		graph.asyncBoundaries.flatMap((boundary) =>
			boundaryReads(graph, boundary.id, readNodes, readAsyncValues).flatMap((read) =>
				read.asyncValues.length > 0 ? [read.hostNodeId] : [],
			),
		),
	);
	for (const { hostNodeId, sourceSpan } of authored)
		if (marked.has(hostNodeId)) graph.diagnostics.push(managedAriaBusyDiagnostic(sourceSpan));
}

// Text in these elements names the control's own choice, which the user just made.
const CONTROL_TAGS = new Set(['button', 'select', 'option', 'textarea', 'label']);

function refreshContext(graph: RefreshGraph) {
	const bindingsById = new Map(graph.graphBindings.map((binding) => [binding.id, binding]));
	const computed = new Map(
		graph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' ? [[binding.id, binding] as const] : [],
		),
	);
	const { reach } = asyncReach(computed);
	const inputsOf = asyncKeyInputs(computed);
	const hostsById = new Map(graph.hostNodes.map((host) => [host.id, host]));
	const readNodes = (read: SemanticTemplateRead): ReadonlyArray<string> => {
		if (read.computedGraphNodeId) return [read.computedGraphNodeId];
		const gates = (read.asyncGateReads ?? []).map((gate) => gate.graphNodeId);
		const resolved = resolveGraphPath(
			templateReadPath(read),
			graphBindingMap(graph, null, read.componentName),
			semanticAliasMap(graph as SemanticGraphArtifact, null, read.componentName),
		);
		return resolved ? [...gates, resolved.binding.id] : gates;
	};
	const readAsyncValues = (nodes: ReadonlyArray<string>) => [...reach(nodes).asyncValues];
	return { bindingsById, reach, inputsOf, hostsById, readNodes, readAsyncValues };
}

type BoundaryRead = {
	readonly read?: SemanticTemplateRead;
	readonly hostNodeId: string;
	readonly asyncValues: ReadonlyArray<string>;
};

// The @try arm's own reads: element bindings and keyed lists, never the @pending or @catch arm or a nested block.
function boundaryReads(
	graph: RefreshGraph,
	boundaryId: string,
	readNodes: (read: SemanticTemplateRead) => ReadonlyArray<string>,
	readAsyncValues: (nodes: ReadonlyArray<string>) => ReadonlyArray<string>,
): ReadonlyArray<BoundaryRead> {
	const inTryArm = (hostNodeId: string) => {
		const host = graph.hostNodes.find((candidate) => candidate.id === hostNodeId);
		return host?.asyncBoundaryId === boundaryId && host.asyncBoundaryArm === 0;
	};
	const reads: BoundaryRead[] = [];
	for (const read of graph.templateReads)
		if (read.asyncBoundaryId === boundaryId && inTryArm(read.hostNodeId))
			reads.push({
				read,
				hostNodeId: read.hostNodeId,
				asyncValues: readAsyncValues(readNodes(read)),
			});
	for (const repeat of graph.keyedRepeats) {
		if (repeat.asyncBoundaryId !== boundaryId || !inTryArm(repeat.parentHostNodeId)) continue;
		const componentName = graph.asyncBoundaries.find(
			(boundary) => boundary.id === boundaryId,
		)?.componentName;
		const collection =
			repeat.collectionGraphNodeId ??
			resolveGraphPath(
				repeat.collectionSource,
				graphBindingMap(graph, null, componentName),
				semanticAliasMap(graph as SemanticGraphArtifact, null, componentName),
			)?.binding.id;
		if (collection)
			reads.push({
				hostNodeId: repeat.parentHostNodeId,
				asyncValues: readAsyncValues([collection]),
			});
	}
	return reads;
}

// The graph nodes the element's own event handlers write.
function hostWrites(graph: RefreshGraph, hostNodeId: string): ReadonlySet<string> {
	const written = new Set<string>();
	for (const event of graph.events) {
		const span = event.handlerSpan;
		if (event.hostNodeId !== hostNodeId || !span) continue;
		for (const write of graph.stateWrites) {
			const at = write.targetSpan?.start;
			if (at === undefined || at < span.start || at > span.end) continue;
			const [root] = splitStaticGraphPath(write.target);
			const binding = root
				? graphBindingMap(graph, null, write.componentName).get(root)
				: undefined;
			if (binding) written.add(binding.id);
		}
	}
	return written;
}
