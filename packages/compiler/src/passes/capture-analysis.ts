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
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../artifact-helpers/graph-paths.ts';
import { childNodes, type AnyNode } from '../ast/nodes.ts';
import { parseJavaScriptModule } from '../js-ast.ts';

export function analyzeCaptures(input: CaptureAnalysisInput): CaptureAnalysisArtifact {
	const localSymbols = input.symbolResolver.symbols.map((symbol) => {
		const captureSlots = symbolCaptureSlots(symbol, input);
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
		...extractedSymbols.flatMap((symbol) =>
			input.semanticGraph.localBindings.flatMap((binding) =>
				isCaptured(symbol.source, binding.name)
					? [unsupportedCaptureDiagnostic(symbol, binding)]
					: [],
			),
		),
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
		return [
			{
				...symbol.captureSymbol,
				loaderSymbolId: symbol.id,
				captureSlots: symbol.captureSymbol.captureSlots.map((slot) => ({
					...slot,
					routes: slot.propName
						? [propCaptureRoute([edge], slot.propName, slot.path, input)]
						: slot.routes.map((route) =>
								route.kind === 'graph-reference'
									? {
											...route,
											componentEdgeId: edge.id,
											componentEdgePath: [edge.id],
										}
									: route,
							),
				})),
			},
		];
	});
}

function symbolCaptureSlots(
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
): ReadonlyArray<CaptureSlot> {
	if (!('reads' in symbol) || !symbol.reads) return [];

	return symbol.reads.map((read) => captureSlot(read, symbol, input));
}

function captureSlot(
	read: LoweredStateRead,
	symbol: PlannedSymbol,
	input: CaptureAnalysisInput,
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
		!sourceInvokesReference(symbolSource(symbol), read.source)
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
): CaptureSlotRoute {
	const edge = componentEdgePath[edgeIndex];
	if (!edge) throw new Error('Capture route ancestry ended before its terminal value.');
	const edgePathIds = componentEdgePath.map((candidate) => candidate.id);
	const prop = edge.props.find((candidate) => candidate.name === propName);
	if (!prop) {
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
				);
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
	if (value === undefined) {
		throw new Error(
			`Cannot construct compiler-known constant capture route without a materialized value for component edge ${componentEdgeId}.`,
		);
	}
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

function sourceInvokesReference(source: string, reference: string): boolean {
	const moduleSource = `const __marklessCaptureSource = ${source};`;
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(moduleSource);
	} catch {
		return false;
	}
	let invoked = false;
	const visit = (node: AnyNode): void => {
		if (invoked) return;
		if (node.type === 'CallExpression') {
			const callee = node.callee as AnyNode | undefined;
			if (
				callee &&
				typeof callee.start === 'number' &&
				typeof callee.end === 'number' &&
				moduleSource.slice(callee.start, callee.end) === reference
			) {
				invoked = true;
				return;
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(ast);
	return invoked;
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

function isCaptured(source: string, name: string): boolean {
	const searchableSource = sourceWithoutStringOrCommentText(source);
	if (symbolLocalBindingNames(searchableSource).has(name)) return false;

	for (
		let index = searchableSource.indexOf(name);
		index !== -1;
		index = searchableSource.indexOf(name, index + name.length)
	) {
		const before = searchableSource[index - 1] ?? '';
		const after = searchableSource[index + name.length] ?? '';
		if (isIdentifierChar(before) || before === '.') continue;
		if (isIdentifierChar(after)) continue;
		if (nextNonWhitespace(searchableSource, index + name.length) === ':') continue;
		if (isObjectMethodKey(searchableSource, index, name.length)) continue;

		return true;
	}

	return false;
}

function symbolLocalBindingNames(source: string): ReadonlySet<string> {
	const names = new Set(leadingArrowFunctionParameterNames(source));
	const body = leadingArrowFunctionBlockBody(source);
	if (body === null) return names;

	for (const name of topLevelDeclarationNames(body)) {
		names.add(name);
	}

	return names;
}

function leadingArrowFunctionParameterNames(source: string): ReadonlySet<string> {
	const start = nextNonWhitespaceIndex(source, 0);
	if (start === -1) return new Set();

	return leadingArrowFunctionParameterNamesFrom(source, start);
}

function leadingArrowFunctionParameterNamesFrom(
	source: string,
	start: number,
): ReadonlySet<string> {
	if (startsWithKeyword(source, start, 'async')) {
		const afterAsync = nextNonWhitespaceIndex(source, start + 'async'.length);
		if (afterAsync === -1) return new Set();

		return leadingArrowFunctionParameterNamesFrom(source, afterAsync);
	}

	if (source[start] === '(') {
		const paramsEnd = matchingCloseParenIndex(source, start);
		if (paramsEnd === -1) return new Set();

		const afterParams = nextNonWhitespaceIndex(source, paramsEnd + 1);
		if (!startsWithArrow(source, afterParams)) return new Set();

		return parameterBindingNames(source.slice(start + 1, paramsEnd));
	}

	const identifierEnd = identifierEndIndex(source, start);
	if (identifierEnd === start) return new Set();

	const afterIdentifier = nextNonWhitespaceIndex(source, identifierEnd);
	if (!startsWithArrow(source, afterIdentifier)) return new Set();

	return new Set([source.slice(start, identifierEnd)]);
}

function leadingArrowFunctionBlockBody(source: string): string | null {
	const bodyStart = leadingArrowFunctionBodyStart(source);
	if (bodyStart === -1 || source[bodyStart] !== '{') return null;

	const bodyEnd = matchingCloseBraceIndex(source, bodyStart);
	if (bodyEnd === -1) return null;

	return source.slice(bodyStart + 1, bodyEnd);
}

function leadingArrowFunctionBodyStart(source: string): number {
	const start = nextNonWhitespaceIndex(source, 0);
	if (start === -1) return -1;

	return leadingArrowFunctionBodyStartFrom(source, start);
}

function leadingArrowFunctionBodyStartFrom(source: string, start: number): number {
	if (startsWithKeyword(source, start, 'async')) {
		const afterAsync = nextNonWhitespaceIndex(source, start + 'async'.length);
		if (afterAsync === -1) return -1;

		return leadingArrowFunctionBodyStartFrom(source, afterAsync);
	}

	if (source[start] === '(') {
		const paramsEnd = matchingCloseParenIndex(source, start);
		if (paramsEnd === -1) return -1;

		const afterParams = nextNonWhitespaceIndex(source, paramsEnd + 1);
		if (!startsWithArrow(source, afterParams)) return -1;

		return nextNonWhitespaceIndex(source, afterParams + 2);
	}

	const identifierEnd = identifierEndIndex(source, start);
	if (identifierEnd === start) return -1;

	const afterIdentifier = nextNonWhitespaceIndex(source, identifierEnd);
	if (!startsWithArrow(source, afterIdentifier)) return -1;

	return nextNonWhitespaceIndex(source, afterIdentifier + 2);
}

function parameterBindingNames(source: string): ReadonlySet<string> {
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(`const __marklessParameters = (${source}) => {};`);
	} catch {
		return new Set();
	}

	const names = new Set<string>();
	const visit = (node: AnyNode): void => {
		if (node.type === 'ArrowFunctionExpression') {
			for (const parameter of nodeArray(node.params)) {
				for (const name of bindingPatternNames(parameter)) names.add(name);
			}
			return;
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(ast);
	return names;
}

function bindingPatternNames(node: AnyNode | undefined): ReadonlyArray<string> {
	if (!node) return [];
	if (node.type === 'Identifier') {
		return typeof node.name === 'string' ? [node.name] : [];
	}
	if (node.type === 'AssignmentPattern') {
		return bindingPatternNames(node.left as AnyNode | undefined);
	}
	if (node.type === 'RestElement') {
		return bindingPatternNames(node.argument as AnyNode | undefined);
	}
	if (node.type === 'ObjectPattern') {
		return nodeArray(node.properties).flatMap((property) =>
			property.type === 'Property'
				? bindingPatternNames(property.value as AnyNode | undefined)
				: bindingPatternNames(property.argument as AnyNode | undefined),
		);
	}
	if (node.type === 'ArrayPattern') {
		return nodeArray(node.elements).flatMap((element) => bindingPatternNames(element));
	}
	return [];
}

function nodeArray(value: unknown): AnyNode[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is AnyNode =>
					typeof item === 'object' &&
					item !== null &&
					typeof (item as AnyNode).type === 'string',
			)
		: [];
}

function topLevelDeclarationNames(source: string): ReadonlySet<string> {
	const names = new Set<string>();
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const isTopLevel = parenDepth === 0 && bracketDepth === 0 && braceDepth === 0;

		if (isTopLevel) {
			const variableKeyword = variableDeclarationKeywordAt(source, index);
			if (variableKeyword !== null) {
				index = collectVariableDeclarationNames(
					source,
					index + variableKeyword.length,
					names,
				);
				continue;
			}

			const namedDeclarationKeyword = namedDeclarationKeywordAt(source, index);
			if (namedDeclarationKeyword !== null) {
				index = collectNamedDeclarationName(
					source,
					index + namedDeclarationKeyword.length,
					names,
				);
				continue;
			}
		}

		if (char === '(') parenDepth++;
		if (char === ')' && parenDepth > 0) parenDepth--;
		if (char === '[') bracketDepth++;
		if (char === ']' && bracketDepth > 0) bracketDepth--;
		if (char === '{') braceDepth++;
		if (char === '}' && braceDepth > 0) braceDepth--;
	}

	return names;
}

function variableDeclarationKeywordAt(source: string, index: number): string | null {
	if (startsWithKeyword(source, index, 'const')) return 'const';
	if (startsWithKeyword(source, index, 'let')) return 'let';
	if (startsWithKeyword(source, index, 'var')) return 'var';

	return null;
}

function namedDeclarationKeywordAt(source: string, index: number): string | null {
	if (startsWithKeyword(source, index, 'function')) return 'function';
	if (startsWithKeyword(source, index, 'class')) return 'class';

	return null;
}

function collectVariableDeclarationNames(
	source: string,
	start: number,
	names: Set<string>,
): number {
	let index = nextNonWhitespaceIndex(source, start);
	if (index === -1) return source.length;

	while (index < source.length) {
		const nameEnd = identifierEndIndex(source, index);
		if (nameEnd > index) {
			names.add(source.slice(index, nameEnd));
			index = nameEnd;
		}

		index = skipVariableDeclarator(source, index);
		const next = nextNonWhitespaceIndex(source, index);
		if (next === -1) return source.length;
		if (source[next] === ',') {
			index = nextNonWhitespaceIndex(source, next + 1);
			if (index === -1) return source.length;
			continue;
		}

		return next;
	}

	return source.length;
}

function skipVariableDeclarator(source: string, start: number): number {
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let index = start; index < source.length; index++) {
		const char = source[index] ?? '';

		if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			if (char === ',' || char === ';') return index;
		}

		if (char === '(') parenDepth++;
		if (char === ')' && parenDepth > 0) parenDepth--;
		if (char === '[') bracketDepth++;
		if (char === ']' && bracketDepth > 0) bracketDepth--;
		if (char === '{') braceDepth++;
		if (char === '}' && braceDepth > 0) braceDepth--;
	}

	return source.length;
}

function collectNamedDeclarationName(source: string, start: number, names: Set<string>): number {
	let nameStart = nextNonWhitespaceIndex(source, start);
	if (source[nameStart] === '*') {
		nameStart = nextNonWhitespaceIndex(source, nameStart + 1);
	}

	if (nameStart === -1) return source.length;

	const nameEnd = identifierEndIndex(source, nameStart);
	if (nameEnd > nameStart) names.add(source.slice(nameStart, nameEnd));

	return nameEnd;
}

function startsWithKeyword(source: string, start: number, keyword: string): boolean {
	const end = start + keyword.length;
	return (
		source.slice(start, end) === keyword &&
		!isIdentifierChar(source[start - 1] ?? '') &&
		!isIdentifierChar(source[end] ?? '')
	);
}

function startsWithArrow(source: string, start: number): boolean {
	return start !== -1 && source[start] === '=' && source[start + 1] === '>';
}

function identifierEndIndex(source: string, start: number): number {
	if (!isIdentifierStart(source[start] ?? '')) return start;

	let index = start + 1;
	while (isIdentifierChar(source[index] ?? '')) {
		index++;
	}

	return index;
}

function isIdentifierStart(char: string): boolean {
	return /[A-Za-z_$]/.test(char);
}

function isIdentifierChar(char: string): boolean {
	return /[\w$]/.test(char);
}

function nextNonWhitespace(source: string, startIndex: number): string {
	for (let index = startIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (!/\s/.test(char)) return char;
	}

	return '';
}

function previousNonWhitespace(source: string, startIndex: number): string {
	for (let index = startIndex; index >= 0; index--) {
		const char = source[index] ?? '';
		if (!/\s/.test(char)) return char;
	}

	return '';
}

function isObjectMethodKey(source: string, nameStart: number, nameLength: number): boolean {
	const previous = previousNonWhitespace(source, nameStart - 1);
	if (previous !== '{' && previous !== ',') return false;

	const paramsStart = nextNonWhitespaceIndex(source, nameStart + nameLength);
	if (source[paramsStart] !== '(') return false;

	const paramsEnd = matchingCloseParenIndex(source, paramsStart);
	if (paramsEnd === -1) return false;

	const afterParams = nextNonWhitespace(source, paramsEnd + 1);
	return afterParams === '{';
}

function nextNonWhitespaceIndex(source: string, startIndex: number): number {
	for (let index = startIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (!/\s/.test(char)) return index;
	}

	return -1;
}

function matchingCloseParenIndex(source: string, openParenIndex: number): number {
	let depth = 0;

	for (let index = openParenIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (char === '(') depth++;
		if (char === ')') {
			depth--;
			if (depth === 0) return index;
		}
	}

	return -1;
}

function matchingCloseBraceIndex(source: string, openBraceIndex: number): number {
	let depth = 0;

	for (let index = openBraceIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (char === '{') depth++;
		if (char === '}') {
			depth--;
			if (depth === 0) return index;
		}
	}

	return -1;
}

function sourceWithoutStringOrCommentText(source: string): string {
	let output = '';
	const stack: Array<'template' | { readonly mode: 'template-expression'; depth: number }> = [];

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';
		const mode = stack[stack.length - 1];

		if (mode === 'template') {
			if (char === '\\') {
				output += '  ';
				index++;
				continue;
			}

			if (char === '`') {
				output += ' ';
				stack.pop();
				continue;
			}

			if (char === '$' && next === '{') {
				output += '  ';
				index++;
				stack.push({ mode: 'template-expression', depth: 1 });
				continue;
			}

			output += char === '\n' ? '\n' : ' ';
			continue;
		}

		if (char === "'" || char === '"') {
			const result = consumeQuotedText(source, index, char);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}

		if (char === '`') {
			output += ' ';
			stack.push('template');
			continue;
		}

		if (char === '/' && next === '/') {
			const result = consumeLineComment(source, index);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}

		if (char === '/' && next === '*') {
			const result = consumeBlockComment(source, index);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}

		if (typeof mode === 'object') {
			if (char === '{') {
				mode.depth++;
			}

			if (char === '}') {
				mode.depth--;
				if (mode.depth === 0) {
					output += ' ';
					stack.pop();
					continue;
				}
			}
		}

		output += char;
	}

	return output;
}

function consumeQuotedText(
	source: string,
	startIndex: number,
	quote: "'" | '"',
): { readonly replacement: string; readonly endIndex: number } {
	let replacement = ' ';

	for (let index = startIndex + 1; index < source.length; index++) {
		const char = source[index] ?? '';

		if (char === '\\') {
			replacement += '  ';
			index++;
			continue;
		}

		replacement += char === '\n' ? '\n' : ' ';

		if (char === quote) {
			return { replacement, endIndex: index };
		}
	}

	return { replacement, endIndex: source.length - 1 };
}

function consumeLineComment(
	source: string,
	startIndex: number,
): { readonly replacement: string; readonly endIndex: number } {
	let replacement = '  ';

	for (let index = startIndex + 2; index < source.length; index++) {
		const char = source[index] ?? '';

		if (char === '\n') {
			replacement += '\n';
			return { replacement, endIndex: index };
		}

		replacement += ' ';
	}

	return { replacement, endIndex: source.length - 1 };
}

function consumeBlockComment(
	source: string,
	startIndex: number,
): { readonly replacement: string; readonly endIndex: number } {
	let replacement = '  ';

	for (let index = startIndex + 2; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';

		if (char === '*' && next === '/') {
			replacement += '  ';
			return { replacement, endIndex: index + 1 };
		}

		replacement += char === '\n' ? '\n' : ' ';
	}

	return { replacement, endIndex: source.length - 1 };
}

function symbolSource(symbol: PlannedSymbol): string {
	if (symbol.kind === 'event-handler') return symbol.source;
	if (symbol.kind === 'callback-prop') return symbol.source;
	if (symbol.kind === 'dom-update') return symbol.source;
	if (symbol.kind === 'behavior') return symbol.source;
	if (symbol.kind === 'async-computed-runner') return symbol.source;

	return '';
}
