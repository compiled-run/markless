import type {
	SemanticGraphArtifact,
	SemanticGraphBinding,
	SemanticGraphDiagnostic,
	SemanticTemplateRead,
	SourceSpan,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	optionalMemberReadSource,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import { asyncKeyInputs, asyncReach } from '../paired-async-values.ts';
import { asyncInputBesideValueDiagnostic, managedAriaBusyDiagnostic } from './diagnostics.ts';
import type { AuthoredAriaBusy } from './types.ts';

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
	const { inputsOf, readAsyncValues, readNodes, hostsById, bindingsById, reach } =
		refreshContext(graph);
	for (const boundary of graph.asyncBoundaries) {
		const reads = boundaryReads(graph, boundary.id, readNodes, readAsyncValues);
		const values = [...new Set(reads.flatMap((read) => read.asyncValues))];
		if (values.length === 0) continue;
		for (const { read, hostNodeId, asyncValues } of reads) {
			if (!read || read.target.kind !== 'text' || asyncValues.length > 0) continue;
			if (CONTROL_TAGS.has(hostsById.get(hostNodeId)?.tagName ?? '')) continue;
			const shown = reach(readNodes(read)).plain;
			const value = values.find((id) => [...inputsOf(id)].some((input) => shown.has(input)));
			if (!value) continue;
			const input = [...inputsOf(value)].find((id) => shown.has(id))!;
			if (hostWrites(graph, hostNodeId).has(input)) continue;
			graph.diagnostics.push(
				asyncInputBesideValueDiagnostic({
					read: read.authoredSource ?? read.source,
					input: bindingsById.get(input)?.name ?? input,
					value: bindingsById.get(value)?.name ?? value,
					span: read.sourceSpan,
				}),
			);
		}
	}
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
			optionalMemberReadSource(read.source),
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
