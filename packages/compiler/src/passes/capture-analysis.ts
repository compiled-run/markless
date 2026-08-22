import type {
	CaptureAnalysisArtifact,
	CaptureAnalysisDiagnostic,
	CaptureAnalysisInput,
	CaptureSlot,
	CaptureSlotRoute,
	LoweredStateRead,
	PlannedSymbol,
	SemanticComponentEdge,
	SemanticLocalBinding,
	SemanticStateRead,
	SemanticTemplateRead,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../artifact-helpers/graph-paths.ts';
import { protocolInstanceQualifies } from '@markless/serializer';
import { childNodes, type AnyNode } from '../ast/nodes.ts';
import { parseJavaScriptModule } from '../js-ast.ts';
import {
	createSymbolSourceSemanticsReader,
	type SymbolSourceSemanticsReader,
} from './capture-semantics.ts';
import { sharedCallbackSlotGraphNodeId } from './semantic-graph/collect-shared.ts';

// Capture analysis owns these diagnostic contract values. Tests and any other
// reader import them from here rather than restating the strings, so the
// contract has one source of truth.
export const CAPTURE_ANALYSIS_PASS_ID = 'capture-analysis' as const;
export const CAPTURE_ANALYSIS_PHASE = 'capture-analysis' as const;
export const CAPTURE_OPAQUE_PROP_CODE = 'MARKLESS_CAPTURE_OPAQUE_PROP' as const;
export const CAPTURE_UNSUPPORTED_VALUE_CODE = 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE' as const;
export const BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED_CODE =
	'MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED' as const;
export const EVENT_HANDLER_EMIT_UNSUPPORTED_CODE =
	'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED' as const;

export function analyzeCaptures(input: CaptureAnalysisInput): CaptureAnalysisArtifact {
	const semantics = createSymbolSourceSemanticsReader();
	const localSymbols = input.symbolResolver.symbols.map((symbol) => {
		const captureSlots = symbolCaptureSlots(symbol, input, semantics);
		const firstOwner = captureSlots[0]?.owner;
		return {
			symbolId: symbol.id,
			kind: symbol.kind,
			source: symbolSource(symbol),
			...(firstOwner?.componentId || firstOwner?.componentName
				? {
						owner: {
							...(firstOwner.componentId
								? { componentId: firstOwner.componentId }
								: {}),
							...(firstOwner.componentName
								? { componentName: firstOwner.componentName }
								: {}),
						},
					}
				: {}),
			...(symbolTouchesPageSpaceGraph(symbol, captureSlots)
				? { touchesPageSpaceGraph: true as const }
				: {}),
			captureSlots,
		};
	});
	const extractedSymbols = [...localSymbols, ...importedCaptureSymbols(input)];
	const diagnostics = [
		...extractedSymbols.flatMap((symbol) => opaqueSlotDiagnostics(symbol)),
		...extractedSymbols.flatMap((symbol) => {
			const { freeNames, analysisFailed } = semantics.read(symbol.source);
			// A source the analyzer could not read proves nothing about what it
			// closes over, so it cannot clear anything. The refusal does not depend
			// on the component having local bindings to name: with none, the
			// unknown captures are exactly as unknown, and reporting per binding
			// would stay silent in every component without one. One diagnostic per
			// failed symbol, using the existing unsupported-capture code because the
			// author's problem is the same one. `freeNames` is empty on failure, so
			// returning here also cannot drop a name-based diagnostic.
			if (analysisFailed) return [unsupportedCaptureDiagnostic(symbol, undefined)];

			return input.semanticGraph.localBindings.flatMap((binding) =>
				freeNames.has(binding.name) ? [unsupportedCaptureDiagnostic(symbol, binding)] : [],
			);
		}),
	];

	return {
		passId: 'capture-analysis',
		extractedSymbols,
		diagnostics,
	};
}

/**
 * Whether this symbol's own graph traffic reaches a page-space id. A shared()
 * graph or a storage slot names one definition for every instance of a
 * component, so a composing module cannot scope it by prefixing an instance
 * path; the runtime rule decides. Reads and writes are the symbol's direct
 * traffic, capture slots its routed traffic — both can name such an id.
 */
function symbolTouchesPageSpaceGraph(
	symbol: PlannedSymbol,
	captureSlots: ReadonlyArray<CaptureSlot>,
): boolean {
	const pageSpace = (graphNodeId: string | undefined) =>
		graphNodeId !== undefined && protocolInstanceQualifies(graphNodeId) === false;
	const traffic = [
		...('reads' in symbol ? (symbol.reads ?? []) : []),
		...('writes' in symbol ? (symbol.writes ?? []) : []),
	];
	return (
		traffic.some((entry) => pageSpace(entry.graphNodeId)) ||
		captureSlots.some((slot) =>
			slot.routes.some(
				(route) =>
					route.kind === 'widget-callback-route' ||
					(route.kind === 'graph-reference' && pageSpace(route.graphNodeId)),
			),
		)
	);
}

function importedCaptureSymbols(
	input: CaptureAnalysisInput,
): CaptureAnalysisArtifact['extractedSymbols'] {
	return (input.symbols ?? []).flatMap((symbol) => {
		if (!symbol.captureSymbol || !symbol.componentEdgeId) return [];
		const edge = input.semanticGraph.componentEdges.find(
			(candidate) => candidate.id === symbol.componentEdgeId,
		);
		if (!edge) return [];
		const captureSymbol = symbol.captureSymbol;
		// Absent callback props fold to undefined only at optional/guarded call sites.
		const absentPropIsUndefined = (slot: CaptureSlot) =>
			captureSymbol.kind !== 'event-handler' && captureSymbol.kind !== 'callback-prop'
				? true
				: referenceInvocationIsAbsentSafe(captureSymbol.source, slot.source);
		// A widget-callback claim binds one thing: the slot the enclosing root
		// answers. The child's own graph reads keep resolving in the child's
		// module, so rebinding them here would take the part's records with them.
		if (symbol.claimKind === 'widget-callback') {
			return [
				{
					...captureSymbol,
					loaderSymbolId: symbol.id,
					captureSlots: captureSymbol.captureSlots.flatMap((slot) =>
						slot.routes.some((route) => route.kind === 'widget-callback-route')
							? [
									{
										...slot,
										routes: slot.routes.map((route) =>
											route.kind === 'widget-callback-route'
												? resolveWidgetCallbackRoute(route, edge, input)
												: route,
										),
									},
								]
							: [],
					),
				},
			];
		}
		return [
			{
				...symbol.captureSymbol,
				loaderSymbolId: symbol.id,
				captureSlots: symbol.captureSymbol.captureSlots
					.map((slot) => ({
						...slot,
						routes: slot.routes.some((route) => route.kind === 'widget-callback-route')
							? slot.routes.map((route) =>
									route.kind === 'widget-callback-route'
										? resolveWidgetCallbackRoute(route, edge, input)
										: route,
								)
							: slot.routes.some((route) => route.kind === 'passthrough-route')
							? slot.routes.flatMap((route) =>
									route.kind === 'passthrough-route'
										? [
												propCaptureRoute(
													[edge],
													route.propName,
													[...route.path, ...slot.path],
													input,
													absentPropIsUndefined(slot),
												),
											]
										: [],
								)
							: slot.propName
								? [
										propCaptureRoute(
											[edge],
											slot.propName,
											slot.path,
											input,
											absentPropIsUndefined(slot),
										),
									]
								: slot.routes.map((route) =>
										route.kind === 'graph-reference'
											? {
													...route,
													componentEdgeId: edge.id,
													componentEdgePath: [edge.id],
												}
											: route,
									),
					}))
					.filter((slot) => !wasProjectedThroughComponentEdge(slot.propName, edge)),
			},
		];
	});
}

// Projected children are compiler-owned template content, not a runtime prop
// value. Component edges retain enough structure to make that classification
// when imported capture metadata is rebound into the consuming module.
function wasProjectedThroughComponentEdge(
	propName: string | undefined,
	edge: SemanticComponentEdge,
): boolean {
	return (
		propName === 'children' &&
		(edge.children.childCount > 0 || edge.props.some((prop) => prop.name === 'children'))
	);
}

function symbolCaptureSlots(
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
	semantics: SymbolSourceSemanticsReader,
): ReadonlyArray<CaptureSlot> {
	const reads = lazySymbolReads(symbol, input);
	const slots = reads.map((read) => captureSlot(read, symbol, input, semantics));
	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop')
		return [...slots, ...widgetCallbackSlots(symbol, input, semantics)];

	// A non-callback lazy symbol does not need an opaque presentation value at
	// resume time: it rendered once, and the value has no live graph route that
	// could schedule it again. Keep callback captures fail-closed above, but drop
	// opaque routes (and empty slots) for update-only symbols.
	return slots.flatMap((slot) => {
		const routes = slot.routes.filter((route) => route.kind !== 'unsupported-opaque');
		return routes.length > 0 ? [{ ...slot, routes }] : [];
	});
}

/**
 * A handler that invokes a widget callback slot — directly or through a factory
 * method inlined into it — captures that slot instead of reading it. The slot
 * has no graph node and no seed: the family module records which widget root
 * prop answers it, and a composing module turns that into the ordinary callback
 * route the root's own edge proves.
 */
function widgetCallbackSlots(
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
	semantics: SymbolSourceSemanticsReader,
): ReadonlyArray<CaptureSlot> {
	const invocations = input.semanticGraph.sharedCallbackInvocations ?? [];
	if (invocations.length === 0) return [];

	const invoked = semantics.read(symbolSource(symbol));
	return invocations.flatMap((invocation) => {
		if (!invoked.invokes(invocation.calleeSource)) return [];

		const binding = (input.semanticGraph.sharedCallbackBindings ?? []).find(
			(candidate) =>
				candidate.definitionId === invocation.definitionId &&
				candidate.slotName === invocation.slotName,
		);
		if (!binding) return [];

		return [
			{
				id: `capture-slot:widget-callback:${invocation.definitionId}:${invocation.slotName}:${symbol.id}`,
				bindingId: `widget-callback:${invocation.definitionId}:${invocation.slotName}`,
				source: invocation.calleeSource,
				...(invocation.sourceSpan ? { sourceSpan: invocation.sourceSpan } : {}),
				owner: {},
				path: [],
				routes: [
					{
						kind: 'widget-callback-route' as const,
						sharedDefinitionId: invocation.definitionId,
						slotName: invocation.slotName,
						rootPropName: binding.propName,
						rootComponentName: binding.componentName,
					},
				],
			},
		];
	});
}

/**
 * The widget root this composed part belongs to: the innermost enclosing
 * component edge into the same family module. Nesting is the relationship the
 * author already wrote, so no id, prop, or name has to be spelled twice.
 */
function enclosingWidgetRootEdge(
	edge: SemanticComponentEdge,
	edges: ReadonlyArray<SemanticComponentEdge>,
): SemanticComponentEdge | undefined {
	const span = edge.sourceSpan;
	if (!span) return undefined;

	return edges
		.filter(
			(candidate) =>
				candidate.id !== edge.id &&
				candidate.importSource === edge.importSource &&
				candidate.sourceSpan !== undefined &&
				candidate.sourceSpan.filename === span.filename &&
				candidate.sourceSpan.start <= span.start &&
				candidate.sourceSpan.end >= span.end,
		)
		.sort(
			(left, right) =>
				(right.sourceSpan?.start ?? 0) - (left.sourceSpan?.start ?? 0) ||
				(left.sourceSpan?.end ?? 0) - (right.sourceSpan?.end ?? 0),
		)[0];
}

/**
 * The consumer handler a widget part's slot invocation reaches: the callback
 * prop on the widget root that encloses this part. The resolved route is keyed
 * back onto the part's own edge, because that is the instance whose dispatch
 * runs it. When nothing in this module encloses the part — its root was placed
 * by a SIBLING part, which only the consumer's nesting relates it to — the route
 * asks the graph instead: the slot is a node of the widget's own definition, so
 * the part's own instance resolves it exactly as it resolves its other reads.
 */
function resolveWidgetCallbackRoute(
	route: Extract<CaptureSlotRoute, { readonly kind: 'widget-callback-route' }>,
	edge: SemanticComponentEdge,
	input: CaptureAnalysisInput,
): CaptureSlotRoute {
	const rootEdge = enclosingWidgetRootEdge(edge, input.semanticGraph.componentEdges);
	const resolved: CaptureSlotRoute = rootEdge
		? propCaptureRoute([rootEdge], route.rootPropName, [], input, true)
		: {
				kind: 'callback-slot-route',
				graphNodeId: sharedCallbackSlotGraphNodeId(route.sharedDefinitionId, route.slotName),
				rootPropName: route.rootPropName,
				rootComponentName: route.rootComponentName,
			};
	return { ...resolved, componentEdgeId: edge.id, componentEdgePath: [edge.id] };
}

// Handlers already carry their lowered reads. Other lazy symbols are planned
// from view records, so recover prop ownership from the semantic read that
// produced the record without adding another field to the emitted wire shape.
function lazySymbolReads(
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
): ReadonlyArray<LoweredStateRead> {
	if ('reads' in symbol && symbol.reads) return symbol.reads;

	if (symbol.kind === 'dom-update') {
		return propReadForLazySymbol(
			{
				source: symbol.source,
				graphNodeId: symbol.graphNodeId,
				path: domUpdatePath(symbol, input),
			},
			symbol,
			input,
		);
	}

	if (symbol.kind === 'branch-update') {
		return symbol.testReads.flatMap((read) => propReadForLazySymbol(read, symbol, input));
	}

	if (symbol.kind === 'behavior') {
		return symbol.inputSources.flatMap((source) => {
			const read = input.semanticGraph.stateReads.find(
				(candidate) => candidate.source === source,
			);
			if (!read) return [];
			const resolved = resolveGraphPath(
				read.source,
				graphBindingMap(input.semanticGraph, undefined, read.componentName),
				semanticAliasMap(input.semanticGraph, undefined, read.componentName),
			);
			return resolved
				? propReadForLazySymbol(
						{
							source,
							graphNodeId: resolved.binding.id,
							path: resolved.path,
						},
						symbol,
						input,
					)
				: [];
		});
	}

	if (symbol.kind === 'async-computed-runner' || symbol.kind === 'sync-computed-derive') {
		return (symbol.dependencies ?? []).flatMap((dependency) =>
			propReadForLazySymbol(dependency, symbol, input),
		);
	}

	return [];
}

function domUpdatePath(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
	input: CaptureAnalysisInput,
): ReadonlyArray<string> {
	const read = input.semanticGraph.templateReads.find(
		(candidate) =>
			candidate.hostNodeId === symbol.hostNodeId && candidate.source === symbol.source,
	);
	if (symbol.graphNodeId === 'prop:props') {
		const declaration = componentPropDeclarationForSymbol(symbol, read?.sourceSpan, input);
		return declaration?.propPath ?? [];
	}
	const resolved = resolveGraphPath(
		symbol.source,
		graphBindingMap(input.semanticGraph),
		semanticAliasMap(input.semanticGraph),
	);
	return resolved?.path ?? [];
}

function propReadForLazySymbol(
	read: Pick<LoweredStateRead, 'source' | 'graphNodeId' | 'path'>,
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
): ReadonlyArray<LoweredStateRead> {
	if (!read.graphNodeId.startsWith('prop:')) return [];
	const semanticRead = semanticReadForSymbol(symbol, read.source, input);
	// Only state reads name the authored prop binding; template reads are host-scoped.
	const stateRead = semanticRead && !isTemplateRead(semanticRead) ? semanticRead : undefined;
	const declaration = componentPropDeclarationForSymbol(
		symbol,
		semanticRead?.sourceSpan,
		input,
		stateRead?.bindingId,
	);
	return [
		{
			...read,
			...(semanticRead?.sourceSpan ? { sourceSpan: semanticRead.sourceSpan } : {}),
			...(declaration?.bindingId ? { bindingId: declaration.bindingId } : {}),
			...(declaration?.componentName
				? { componentName: declaration.componentName }
				: stateRead?.componentName
					? { componentName: stateRead.componentName }
					: {}),
		},
	];
}

function isTemplateRead(
	read: SemanticStateRead | SemanticTemplateRead,
): read is SemanticTemplateRead {
	return 'hostNodeId' in read;
}

function semanticReadForSymbol(symbol: PlannedSymbol, source: string, input: CaptureAnalysisInput) {
	if (symbol.kind === 'dom-update') {
		return input.semanticGraph.templateReads.find(
			(read) => read.hostNodeId === symbol.hostNodeId && read.source === source,
		);
	}
	return input.semanticGraph.stateReads.find((read) => read.source === source);
}

function componentPropDeclarationForSymbol(
	symbol: PlannedSymbol,
	readSpan: { readonly start: number; readonly end: number } | undefined,
	input: CaptureAnalysisInput,
	bindingId?: string,
) {
	if (bindingId) {
		const direct = input.semanticGraph.componentPropBindings.find(
			(declaration) => declaration.bindingId === bindingId,
		);
		if (direct) return direct;
	}
	const propName =
		symbol.kind === 'dom-update' && symbol.graphNodeId.startsWith('prop:')
			? symbol.graphNodeId === 'prop:props'
				? rootIdentifierName(symbol.source)
				: symbol.graphNodeId.slice('prop:'.length)
			: rootIdentifierName(symbolSource(symbol));
	return input.semanticGraph.componentPropBindings.find((declaration) => {
		if (declaration.localName !== propName && declaration.propPath[0] !== propName)
			return false;
		if (!readSpan) return true;
		const range = componentSourceRange(declaration.componentId);
		return range ? range.start <= readSpan.start && range.end >= readSpan.end : false;
	});
}

function componentSourceRange(componentId: string) {
	const match = /^component:(\d+):(\d+)$/.exec(componentId);
	return match ? { start: Number(match[1]), end: Number(match[2]) } : undefined;
}

function rootIdentifierName(source: string): string | undefined {
	return /^\s*([A-Za-z_$][\w$]*)/.exec(source)?.[1];
}

function captureSlot(
	read: LoweredStateRead,
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
	semantics: SymbolSourceSemanticsReader,
): CaptureSlot {
	const declaration = read.bindingId
		? input.semanticGraph.componentPropBindings.find(
				(binding) => binding.bindingId === read.bindingId,
			)
		: undefined;
	const componentName = declaration?.componentName ?? read.componentName;
	const propName = read.graphNodeId.startsWith('prop:') ? read.path[0] : undefined;
	const routePath = propName ? read.path.slice(1) : read.path;
	// Absent callback props fold to undefined only at optional/guarded call sites.
	const absentPropIsUndefined =
		(symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') &&
		referenceInvocationIsAbsentSafe(symbolSource(symbol), read.source);
	let routes = propName
		? propCaptureRoutes(componentName, propName, routePath, input, absentPropIsUndefined)
		: [
				{
					kind: 'graph-reference' as const,
					graphNodeId: read.graphNodeId,
					path: read.path,
				},
			];
	if (
		routes.some((route) => route.kind === 'callback-route') &&
		!semantics.read(symbolSource(symbol)).invokes(read.source)
	) {
		routes = routes.map((route) =>
			route.kind === 'callback-route'
				? {
						kind: 'unsupported-opaque' as const,
						componentEdgeId: route.componentEdgeId,
						...(route.componentEdgePath
							? { componentEdgePath: route.componentEdgePath }
							: {}),
						expression: read.source,
						...(read.sourceSpan ? { sourceSpan: read.sourceSpan } : {}),
					}
				: route,
		);
	}
	const spanKey = read.sourceSpan
		? `${read.sourceSpan.start}:${read.sourceSpan.end}`
		: `${read.graphNodeId}:${read.path.join('.')}`;

	return {
		id: `capture-slot:${read.bindingId ?? read.graphNodeId}:${spanKey}`,
		bindingId: read.bindingId ?? `graph-binding:${read.graphNodeId}`,
		source: read.source,
		...(read.sourceSpan ? { sourceSpan: read.sourceSpan } : {}),
		owner: {
			...(declaration?.componentId ? { componentId: declaration.componentId } : {}),
			...(componentName ? { componentName } : {}),
			...(declaration?.sourceSpan ? { declarationSpan: declaration.sourceSpan } : {}),
		},
		...(propName ? { propName } : {}),
		path: routePath,
		routes,
	};
}

function propCaptureRoutes(
	componentName: string | undefined,
	propName: string,
	readPath: ReadonlyArray<string>,
	input: CaptureAnalysisInput,
	absentPropIsUndefined = false,
): ReadonlyArray<CaptureSlotRoute> {
	const edges = componentName
		? input.semanticGraph.componentEdges.filter(
				(edge) => edge.childComponentName === componentName,
			)
		: [];
	if (edges.length === 0) {
		return [
			{ kind: 'graph-reference', graphNodeId: 'prop:props', path: [propName, ...readPath] },
		];
	}

	return edges.flatMap((edge) =>
		componentEdgePathsEndingAt(edge, input.semanticGraph.componentEdges).map((path) =>
			propCaptureRoute(path, propName, readPath, input, absentPropIsUndefined),
		),
	);
}

function propCaptureRoute(
	componentEdgePath: ReadonlyArray<SemanticComponentEdge>,
	propName: string,
	readPath: ReadonlyArray<string>,
	input: CaptureAnalysisInput,
	absentPropIsUndefined = false,
): CaptureSlotRoute {
	const terminalEdge = componentEdgePath.at(-1);
	if (!terminalEdge) {
		throw new Error('Capture route planning requires a terminal component edge.');
	}
	return resolvePropCaptureRoute(
		componentEdgePath,
		componentEdgePath.length - 1,
		propName,
		[],
		readPath,
		terminalEdge.id,
		input,
		absentPropIsUndefined,
	);
}

function resolvePropCaptureRoute(
	componentEdgePath: ReadonlyArray<SemanticComponentEdge>,
	edgeIndex: number,
	propName: string,
	forwardedPath: ReadonlyArray<string>,
	readPath: ReadonlyArray<string>,
	terminalEdgeId: string,
	input: CaptureAnalysisInput,
	absentPropIsUndefined: boolean,
): CaptureSlotRoute {
	const edge = componentEdgePath[edgeIndex];
	if (!edge) throw new Error('Capture route ancestry ended before its terminal value.');
	const edgePathIds = componentEdgePath.map((candidate) => candidate.id);
	const prop = edge.props.find((candidate) => candidate.name === propName);
	if (!prop) {
		if (absentPropIsUndefined) {
			return createCompilerKnownConstantCaptureRoute(terminalEdgeId, edgePathIds, undefined);
		}
		return {
			kind: 'unsupported-opaque',
			componentEdgeId: terminalEdgeId,
			componentEdgePath: edgePathIds,
			expression: propName,
			absentProp: true,
		};
	}
	if (prop.kind === 'graph-reference') {
		const scoped = resolveGraphPath(
			prop.source,
			graphBindingMap(input.semanticGraph, undefined, edge.parentComponentName),
			semanticAliasMap(input.semanticGraph, undefined, edge.parentComponentName),
		);
		if (scoped?.binding.kind === 'prop') {
			const upstreamPropName = scoped.path[0];
			if (edgeIndex > 0 && upstreamPropName) {
				return resolvePropCaptureRoute(
					componentEdgePath,
					edgeIndex - 1,
					upstreamPropName,
					[...scoped.path.slice(1), ...forwardedPath],
					readPath,
					terminalEdgeId,
					input,
					absentPropIsUndefined,
				);
			}
			if (upstreamPropName && scoped.bindingId) {
				return {
					kind: 'passthrough-route',
					componentEdgeId: terminalEdgeId,
					componentEdgePath: edgePathIds,
					bindingId: scoped.bindingId,
					propName: upstreamPropName,
					path: [...scoped.path.slice(1), ...forwardedPath],
				};
			}
			return {
				kind: 'unsupported-opaque',
				componentEdgeId: terminalEdgeId,
				componentEdgePath: edgePathIds,
				expression: prop.source,
				...(prop.sourceSpan ? { sourceSpan: prop.sourceSpan } : {}),
			};
		}
		return {
			kind: 'graph-reference',
			componentEdgeId: terminalEdgeId,
			componentEdgePath: edgePathIds,
			graphNodeId: scoped?.binding.id ?? prop.graphNodeId,
			path: [...(scoped?.path ?? prop.path), ...forwardedPath, ...readPath],
		};
	}
	if (prop.kind === 'serializable') {
		return createCompilerKnownConstantCaptureRoute(
			terminalEdgeId,
			edgePathIds,
			valueAtPath(prop.value, forwardedPath),
		);
	}
	if (prop.kind === 'callback' && forwardedPath.length === 0 && readPath.length === 0) {
		const callbackSymbol = input.symbolResolver.symbols.find(
			(symbol) =>
				symbol.kind === 'callback-prop' &&
				symbol.componentEdgeId === edge.id &&
				symbol.propName === propName,
		);
		if (callbackSymbol) {
			return {
				kind: 'callback-route',
				componentEdgeId: terminalEdgeId,
				componentEdgePath: edgePathIds,
				callbackSymbolId: callbackSymbol.id,
			};
		}
	}

	return {
		kind: 'unsupported-opaque',
		componentEdgeId: terminalEdgeId,
		componentEdgePath: edgePathIds,
		expression: prop.source,
		...(prop.sourceSpan ? { sourceSpan: prop.sourceSpan } : {}),
	};
}

export function createCompilerKnownConstantCaptureRoute(
	componentEdgeId: string,
	componentEdgePath: ReadonlyArray<string>,
	value: unknown,
): Extract<CaptureSlotRoute, { readonly kind: 'compiler-known-constant' }> {
	return {
		kind: 'compiler-known-constant',
		componentEdgeId,
		componentEdgePath,
		value,
	};
}

function componentEdgePathsEndingAt(
	edge: SemanticComponentEdge,
	edges: ReadonlyArray<SemanticComponentEdge>,
	seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<ReadonlyArray<SemanticComponentEdge>> {
	if (seen.has(edge.id)) return [];
	const nextSeen = new Set(seen).add(edge.id);
	const incoming = edges.filter(
		(candidate) =>
			candidate.childComponentName === edge.parentComponentName &&
			!nextSeen.has(candidate.id),
	);
	if (incoming.length === 0) return [[edge]];
	return incoming.flatMap((parent) =>
		componentEdgePathsEndingAt(parent, edges, nextSeen).map((path) => [...path, edge]),
	);
}

function valueAtPath(value: unknown, path: ReadonlyArray<string>): unknown {
	return path.reduce<unknown>((current, key) => {
		if ((typeof current !== 'object' && typeof current !== 'function') || current === null) {
			return undefined;
		}
		return (current as Record<string, unknown>)[key];
	}, value);
}

// True when every call of `reference` in source already no-ops on a missing value (?.(), if/&&/?: guards).
function referenceInvocationIsAbsentSafe(source: string, reference: string): boolean {
	const moduleSource = `const __marklessCaptureSource = ${source};`;
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(moduleSource);
	} catch {
		return false;
	}
	const isReference = (node: AnyNode | undefined): boolean =>
		node !== undefined &&
		typeof node.start === 'number' &&
		typeof node.end === 'number' &&
		moduleSource.slice(node.start, node.end) === reference;
	const isUndefinedLiteral = (node: AnyNode | undefined): boolean =>
		node?.type === 'Identifier' && node.name === 'undefined';
	const isNullLiteral = (node: AnyNode | undefined): boolean =>
		node?.type === 'Literal' && node.value === null && node.raw === 'null';
	const isTypeofReference = (node: AnyNode | undefined): boolean =>
		node?.type === 'UnaryExpression' &&
		node.operator === 'typeof' &&
		isReference(asNode(node.argument));
	const isUndefinedString = (node: AnyNode | undefined): boolean =>
		node?.type === 'Literal' && node.value === 'undefined';
	// A comparison pairs the reference (or `typeof reference`) with the value the
	// side names: `onChange !== null` names null, which an absent prop is not.
	const comparesWith = (
		node: AnyNode,
		operand: (side: AnyNode | undefined) => boolean,
		value: (side: AnyNode | undefined) => boolean,
	): boolean => {
		const left = asNode(node.left);
		const right = asNode(node.right);
		return (operand(left) && value(right)) || (operand(right) && value(left));
	};
	// True when the test cannot be truthy while `reference` is absent, so its
	// consequent never runs on an absent prop.
	const provesPresent = (node: AnyNode | undefined): boolean => {
		if (!node) return false;
		if (isReference(node)) return true;
		if (node.type === 'ChainExpression') return provesPresent(asNode(node.expression));
		if (node.type === 'UnaryExpression' && node.operator === '!')
			return provesAbsent(asNode(node.argument));
		if (node.type === 'LogicalExpression' && node.operator === '&&')
			return provesPresent(asNode(node.left)) || provesPresent(asNode(node.right));
		if (node.type !== 'BinaryExpression') return false;
		if (node.operator === '!==')
			return (
				comparesWith(node, isReference, isUndefinedLiteral) ||
				comparesWith(node, isTypeofReference, isUndefinedString)
			);
		if (node.operator === '!=')
			return (
				comparesWith(
					node,
					isReference,
					(side) => isUndefinedLiteral(side) || isNullLiteral(side),
				) || comparesWith(node, isTypeofReference, isUndefinedString)
			);
		return false;
	};
	// The mirror: the test cannot be falsy while `reference` is absent, so its
	// alternate never runs on an absent prop.
	const provesAbsent = (node: AnyNode | undefined): boolean => {
		if (!node) return false;
		if (node.type === 'ChainExpression') return provesAbsent(asNode(node.expression));
		if (node.type === 'UnaryExpression' && node.operator === '!')
			return provesPresent(asNode(node.argument));
		if (node.type === 'LogicalExpression' && node.operator === '||')
			return provesAbsent(asNode(node.left)) || provesAbsent(asNode(node.right));
		if (node.type !== 'BinaryExpression') return false;
		if (node.operator === '===')
			return (
				comparesWith(node, isReference, isUndefinedLiteral) ||
				comparesWith(node, isTypeofReference, isUndefinedString)
			);
		if (node.operator === '==')
			return (
				comparesWith(
					node,
					isReference,
					(side) => isUndefinedLiteral(side) || isNullLiteral(side),
				) || comparesWith(node, isTypeofReference, isUndefinedString)
			);
		return false;
	};

	let invoked = false;
	let unguarded = false;
	const visit = (node: AnyNode, guarded: boolean): void => {
		if (node.type === 'CallExpression' && isReference(asNode(node.callee))) {
			invoked = true;
			if (node.optional !== true && !guarded) unguarded = true;
		}
		if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') {
			const test = asNode(node.test);
			visit(test ?? node, guarded);
			const consequent = asNode(node.consequent);
			if (consequent) visit(consequent, guarded || provesPresent(test));
			const alternate = asNode(node.alternate);
			if (alternate) visit(alternate, guarded || provesAbsent(test));
			return;
		}
		// `??` and `||` run their right side when the left is absent/falsy, so the
		// left proves nothing about presence there; only `&&` carries a guard.
		if (
			node.type === 'LogicalExpression' &&
			(node.operator === '&&' || node.operator === '||' || node.operator === '??')
		) {
			const left = asNode(node.left);
			if (left) visit(left, guarded);
			const right = asNode(node.right);
			if (right)
				visit(
					right,
					guarded ||
						(node.operator === '&&'
							? provesPresent(left)
							: node.operator === '||'
								? provesAbsent(left)
								: false),
				);
			return;
		}
		for (const child of childNodes(node)) visit(child, guarded);
	};
	visit(ast, false);

	return invoked && !unguarded;
}

function asNode(value: unknown): AnyNode | undefined {
	return typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string'
		? (value as AnyNode)
		: undefined;
}

function opaqueSlotDiagnostics(symbol: {
	readonly symbolId: string;
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
}): ReadonlyArray<CaptureAnalysisDiagnostic> {
	const reportedRoutes = new Set<string>();
	return symbol.captureSlots.flatMap((slot) =>
		slot.routes.flatMap((route) => {
			if (route.kind !== 'unsupported-opaque') return [];
			const componentName = slot.owner.componentName ?? 'unknown component';
			const propName = slot.propName ?? 'unknown prop';
			const routeKey = `${route.componentEdgeId}:${propName}`;
			if (reportedRoutes.has(routeKey)) return [];
			reportedRoutes.add(routeKey);
			return [
				{
					code: CAPTURE_OPAQUE_PROP_CODE,
					severity: 'error' as const,
					phase: CAPTURE_ANALYSIS_PHASE,
					title: 'Lazy handler prop capture is not resumable',
					message: route.absentProp
						? `Cannot bind lazy symbol "${symbol.symbolId}" on component edge "${route.componentEdgeId}" because prop "${propName}" is not passed by the parent that renders "${componentName}", and this call site invokes it unconditionally.`
						: `Cannot bind lazy symbol "${symbol.symbolId}" on component edge "${route.componentEdgeId}" because prop "${propName}" for "${componentName}" is the runtime expression "${route.expression}".`,
					why: route.absentProp
						? 'An absent prop has no value to route at this component edge. An optional or guarded call folds to undefined; an unconditional call would throw after resume, so it stays a build error.'
						: 'A demanded capture slot must route to a graph node, a compiler-known constant, or a callback symbol. This opaque runtime value cannot be reduced without adding a serialized capture protocol.',
					...(route.sourceSpan ? { primarySpan: route.sourceSpan } : {}),
					passId: CAPTURE_ANALYSIS_PASS_ID,
					artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
					symbolId: symbol.symbolId,
					componentEdgeId: route.componentEdgeId,
					componentName,
					propName,
					source: route.expression,
					suggestions: [
						{
							message: route.absentProp
								? `Call it optionally as ${propName}?.(…), guard it with if (${propName}), or pass ${propName} where "${componentName}" is rendered.`
								: 'Pass state()/computed() data, a literal value, or a callback prop to the lazy handler instead.',
						},
					],
					docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_OPAQUE_PROP',
				},
			];
		}),
	);
}

// `binding` is the component-local the symbol was proven to read. It is absent
// when the source itself could not be analyzed: there is no name to blame, but
// the captures are unknown, which refuses for the same reason.
function unsupportedCaptureDiagnostic(
	symbol: {
		readonly symbolId: string;
		readonly kind: PlannedSymbol['kind'];
		readonly source: string;
	},
	binding: SemanticLocalBinding | undefined,
): CaptureAnalysisDiagnostic {
	const span = binding?.sourceSpan ? { primarySpan: binding.sourceSpan } : {};
	const suggestions = [
		{ message: binding ? suggestionForBinding(binding.kind) : UNREADABLE_SOURCE_SUGGESTION },
	];
	const shared = {
		severity: 'error' as const,
		phase: CAPTURE_ANALYSIS_PHASE,
		...span,
		passId: CAPTURE_ANALYSIS_PASS_ID,
		artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
		symbolId: symbol.symbolId,
		source: symbol.source,
		suggestions,
	};

	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') {
		return {
			...shared,
			code: EVENT_HANDLER_EMIT_UNSUPPORTED_CODE,
			title: 'This event handler cannot run in the browser yet',
			message: binding
				? `Cannot emit lazy ${symbol.kind} symbol "${symbol.symbolId}" because it reads component-local "${binding.name}", a local ${bindingKindLabel(binding.kind)} value that cannot cross a resume boundary.`
				: `Cannot emit lazy ${symbol.kind} symbol "${symbol.symbolId}" because ${UNREADABLE_SOURCE_REASON}`,
			why: 'Lazy handler symbols run after browser resume. Handler bodies may use graph references, element handles, props/shared values, module imports, or serializable capture-plane inputs; unsupported body locals would otherwise become silent no-op code.',
			docsUrl: 'https://markless.dev/errors/MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
		};
	}

	if (symbol.kind === 'behavior') {
		return {
			...shared,
			code: BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED_CODE,
			title: 'This element behavior cannot run in the browser yet',
			message: binding
				? `Cannot emit lazy behavior symbol "${symbol.symbolId}" because it reads component-local "${binding.name}", a local ${bindingKindLabel(binding.kind)} value that cannot cross a resume boundary.`
				: `Cannot emit lazy behavior symbol "${symbol.symbolId}" because ${UNREADABLE_SOURCE_REASON}`,
			why: 'Element behavior symbols run after browser resume. Behavior factories may use module functions, graph inputs, element handles, props/shared values, or serializable capture-plane inputs; unsupported body locals would otherwise become missing behavior code.',
			docsUrl: 'https://markless.dev/errors/MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED',
		};
	}

	return {
		...shared,
		code: CAPTURE_UNSUPPORTED_VALUE_CODE,
		title: binding
			? `Cannot capture local ${bindingKindLabel(binding.kind)} in lazy symbol`
			: 'Cannot check the captures of this lazy symbol',
		message: binding
			? `Cannot capture "${binding.name}" in lazy ${symbol.kind} symbol "${symbol.symbolId}" because local ${bindingKindLabel(binding.kind)} values cannot cross a resume boundary.`
			: `Cannot emit lazy ${symbol.kind} symbol "${symbol.symbolId}" because ${UNREADABLE_SOURCE_REASON}`,
		why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
	};
}

const UNREADABLE_SOURCE_REASON =
	'the compiler could not read its source, so the values it captures across the resume boundary are unknown.';

const UNREADABLE_SOURCE_SUGGESTION =
	'Simplify the body until the compiler can read it: move helpers to module scope and keep the body to graph references, element handles, props/shared values, and serializable values.';

function bindingKindLabel(kind: SemanticLocalBinding['kind']): string {
	if (kind === 'class-instance') return 'class instance';
	if (kind === 'dom-node') return 'DOM node';
	if (kind === 'non-serializable-constant') return 'non-serializable constant';

	return 'function';
}

function suggestionForBinding(kind: SemanticLocalBinding['kind']): string {
	if (kind === 'class-instance') {
		return 'Represent durable data with state()/computed(), hoist serializable helpers to module scope, or move DOM-backed setup into a host element behavior with attach.';
	}

	if (kind === 'dom-node') {
		return 'Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with attach.';
	}

	if (kind === 'non-serializable-constant') {
		return 'Keep captured constants serializable, move functions to module scope, or represent durable data with state()/computed().';
	}

	return 'Move the helper to module scope, inline the derivation, or represent durable data with state()/computed().';
}

function symbolSource(symbol: PlannedSymbol): string {
	if (symbol.kind === 'event-handler') return symbol.source;
	if (symbol.kind === 'callback-prop') return symbol.source;
	if (symbol.kind === 'dom-update') return symbol.source;
	if (symbol.kind === 'behavior') return symbol.source;
	if (symbol.kind === 'async-computed-runner') return symbol.source;
	if (symbol.kind === 'sync-computed-derive') return symbol.source;
	if (symbol.kind === 'state-initializer') return symbol.source;

	return '';
}
