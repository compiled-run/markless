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
import {
	createSymbolSourceSemanticsReader,
	type SymbolSourceSemanticsReader,
} from './capture-semantics.ts';

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
			captureSlots,
		};
	});
	const extractedSymbols = [...localSymbols, ...importedCaptureSymbols(input)];
	const diagnostics = [
		...extractedSymbols.flatMap((symbol) => opaqueSlotDiagnostics(symbol)),
		...extractedSymbols.flatMap((symbol) => {
			const { freeNames, analysisFailed } = semantics.read(symbol.source);
			// A source the analyzer could not read proves nothing about what it
			// closes over, so it cannot clear a component-local binding either. The
			// refusal is the existing unsupported-capture diagnostic rather than a
			// new code: the author's problem is the same one, and staying silent
			// here would emit a lazy symbol whose captures were never checked.
			return input.semanticGraph.localBindings.flatMap((binding) =>
				analysisFailed || freeNames.has(binding.name)
					? [unsupportedCaptureDiagnostic(symbol, binding)]
					: [],
			);
		}),
	];

	return {
		passId: 'capture-analysis',
		extractedSymbols,
		diagnostics,
	};
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
		const absentPropIsUndefined =
			symbol.captureSymbol.kind !== 'event-handler' &&
			symbol.captureSymbol.kind !== 'callback-prop';
		return [
			{
				...symbol.captureSymbol,
				loaderSymbolId: symbol.id,
				captureSlots: symbol.captureSymbol.captureSlots
					.map((slot) => ({
						...slot,
						routes: slot.routes.some((route) => route.kind === 'passthrough-route')
							? slot.routes.flatMap((route) =>
									route.kind === 'passthrough-route'
										? [
												propCaptureRoute(
													[edge],
													route.propName,
													[...route.path, ...slot.path],
													input,
													absentPropIsUndefined,
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
											absentPropIsUndefined,
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
	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') return slots;

	// A non-callback lazy symbol does not need an opaque presentation value at
	// resume time: it rendered once, and the value has no live graph route that
	// could schedule it again. Keep callback captures fail-closed above, but drop
	// opaque routes (and empty slots) for update-only symbols.
	return slots.flatMap((slot) => {
		const routes = slot.routes.filter((route) => route.kind !== 'unsupported-opaque');
		return routes.length > 0 ? [{ ...slot, routes }] : [];
	});
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
	let routes = propName
		? propCaptureRoutes(componentName, propName, routePath, input)
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
			propCaptureRoute(path, propName, readPath, input),
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
					code: 'MARKLESS_CAPTURE_OPAQUE_PROP' as const,
					severity: 'error' as const,
					phase: 'capture-analysis' as const,
					title: 'Lazy handler prop capture is not resumable',
					message: `Cannot bind lazy symbol "${symbol.symbolId}" on component edge "${route.componentEdgeId}" because prop "${propName}" for "${componentName}" is the runtime expression "${route.expression}".`,
					why: 'A demanded capture slot must route to a graph node, a compiler-known constant, or a callback symbol. This opaque runtime value cannot be reduced without adding a serialized capture protocol.',
					...(route.sourceSpan ? { primarySpan: route.sourceSpan } : {}),
					passId: 'capture-analysis' as const,
					artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
					symbolId: symbol.symbolId,
					componentEdgeId: route.componentEdgeId,
					componentName,
					propName,
					source: route.expression,
					suggestions: [
						{
							message:
								'Pass state()/computed() data, a literal value, or a callback prop to the lazy handler instead.',
						},
					],
					docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_OPAQUE_PROP',
				},
			];
		}),
	);
}

function unsupportedCaptureDiagnostic(
	symbol: {
		readonly symbolId: string;
		readonly kind: PlannedSymbol['kind'];
		readonly source: string;
	},
	binding: SemanticLocalBinding,
): CaptureAnalysisDiagnostic {
	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') {
		return {
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			title: 'This event handler cannot run in the browser yet',
			message: `Cannot emit lazy ${symbol.kind} symbol "${symbol.symbolId}" because it reads component-local "${binding.name}", a local ${bindingKindLabel(binding.kind)} value that cannot cross a resume boundary.`,
			why: 'Lazy handler symbols run after browser resume. Handler bodies may use graph references, element handles, props/shared values, module imports, or serializable capture-plane inputs; unsupported body locals would otherwise become silent no-op code.',
			primarySpan: binding.sourceSpan,
			passId: 'capture-analysis',
			artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
			symbolId: symbol.symbolId,
			source: symbol.source,
			suggestions: [
				{
					message: suggestionForBinding(binding.kind),
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
		};
	}

	if (symbol.kind === 'behavior') {
		return {
			code: 'MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			title: 'This element behavior cannot run in the browser yet',
			message: `Cannot emit lazy behavior symbol "${symbol.symbolId}" because it reads component-local "${binding.name}", a local ${bindingKindLabel(binding.kind)} value that cannot cross a resume boundary.`,
			why: 'Element behavior symbols run after browser resume. Behavior factories may use module functions, graph inputs, element handles, props/shared values, or serializable capture-plane inputs; unsupported body locals would otherwise become missing behavior code.',
			primarySpan: binding.sourceSpan,
			passId: 'capture-analysis',
			artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
			symbolId: symbol.symbolId,
			source: symbol.source,
			suggestions: [
				{
					message: suggestionForBinding(binding.kind),
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED',
		};
	}

	return {
		code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
		severity: 'error',
		phase: 'capture-analysis',
		title: `Cannot capture local ${bindingKindLabel(binding.kind)} in lazy symbol`,
		message: `Cannot capture "${binding.name}" in lazy ${symbol.kind} symbol "${symbol.symbolId}" because local ${bindingKindLabel(binding.kind)} values cannot cross a resume boundary.`,
		why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
		primarySpan: binding.sourceSpan,
		passId: 'capture-analysis',
		artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
		symbolId: symbol.symbolId,
		source: symbol.source,
		suggestions: [
			{
				message: suggestionForBinding(binding.kind),
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
	};
}

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
