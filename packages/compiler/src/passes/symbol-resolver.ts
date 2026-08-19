import type {
	BoundSymbolResolverArtifact,
	BoundSymbolResolverInput,
	BoundSymbolResolverRow,
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	SemanticModuleImport,
	SourceSpan,
	SymbolResolverInput,
	SymbolResolverPlan,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../artifact-helpers/graph-paths.ts';
import { componentEdgeInstancePath } from '../component-edge-instance.ts';
import { getIdentifierName, walkNode, type AnyNode } from '../ast/nodes.ts';
import { parseJavaScriptModule } from '../js-ast.ts';
import { resolveBoundaryRunners } from './public-render/boundary-runner.ts';

export function planSymbolResolver(input: SymbolResolverInput): SymbolResolverPlan {
	const symbols: PlannedSymbol[] = [];
	let nextSymbolId = 0;

	for (const event of input.payloadArena.view.events) {
		for (let order = 0; order < event.handlerCount; order++) {
			const source = event.handlerSources[order] ?? '';
			const sourceSpan = event.handlerSpans[order];
			const moduleImports = referencedModuleImports(
				input.semanticGraph.moduleImports,
				source,
			);

			symbols.push({
				id: `symbol:${nextSymbolId++}`,
				kind: 'event-handler',
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				source,
				sourceSpan,
				parameters: event.handlerParameters[order] ?? [],
				...(moduleImports.length > 0 ? { moduleImports } : {}),
				order,
				reads: eventReads(
					input.stateLowering?.reads,
					sourceSpan,
					functionParameterBindingNames(source),
				),
				writes: eventWrites(source, input.stateLowering?.writes, sourceSpan),
				elementHandleCalls: collectElementHandleCalls(
					source,
					input.payloadArena.view.elementHandles,
				),
			});
		}
	}

	for (const edge of input.semanticGraph.componentEdges) {
		for (const prop of edge.props) {
			if (prop.kind !== 'callback') continue;
			const moduleImports = referencedModuleImports(
				input.semanticGraph.moduleImports,
				prop.source,
			);
			symbols.push({
				id: `symbol:${nextSymbolId++}`,
				kind: 'callback-prop',
				componentEdgeId: edge.id,
				propName: prop.name,
				source: prop.source,
				sourceSpan: prop.sourceSpan,
				parameters: prop.parameters ?? [],
				...(moduleImports.length > 0 ? { moduleImports } : {}),
				reads: eventReads(
					input.stateLowering?.reads,
					prop.sourceSpan,
					functionParameterBindingNames(prop.source),
				),
				writes: eventWrites(prop.source, input.stateLowering?.writes, prop.sourceSpan),
			});
		}
	}

	for (const domUpdate of input.payloadArena.view.domUpdates) {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'dom-update',
			hostNodeId: domUpdate.hostNodeId,
			source: domUpdate.source,
			graphNodeId: domUpdate.graphNodeId,
			target: domUpdate.target,
		});
	}

	[
		...input.payloadArena.view.behaviors,
		...input.payloadArena.view.keyedRepeats.flatMap((repeat) => repeat.rowBehaviors ?? []),
	].forEach((behavior, order) => {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'behavior',
			hostNodeId: behavior.hostNodeId,
			source: behavior.source,
			functionSource: behavior.functionSource,
			inputSources: behavior.inputSources,
			moduleImport: findModuleImport(
				input.semanticGraph.moduleImports,
				behavior.functionSource,
			),
			order,
		});
	});

	for (const computed of input.payloadArena.state.computed) {
		const source = computed.functionSource ?? '';
		const moduleImports = referencedModuleImports(input.semanticGraph.moduleImports, source);

		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: computed.async ? 'async-computed-runner' : 'sync-computed-derive',
			graphNodeId: computed.graphNodeId,
			name: computed.name,
			source,
			...(computed.dependencies && computed.dependencies.length > 0
				? { dependencies: computed.dependencies }
				: {}),
			...(moduleImports.length > 0 ? { moduleImports } : {}),
		});
	}

	for (const binding of input.semanticGraph.graphBindings) {
		if (binding.kind !== 'state' || !binding.initializerSource || binding.initialValueKnown)
			continue;
		const moduleImports = referencedModuleImports(
			input.semanticGraph.moduleImports,
			binding.initializerSource,
		);
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'state-initializer',
			graphNodeId: binding.id,
			name: binding.name,
			source: binding.initializerSource,
			...(moduleImports.length > 0 ? { moduleImports } : {}),
		});
	}

	// Boundary settle symbols (gate-blind; protocol-view wires only boundaries
	// with a plan arms entry).
	const boundaryRunners = resolveBoundaryRunners(input.semanticGraph);
	for (const boundary of input.payloadArena.view.asyncBoundaries) {
		const graphNodeId = boundaryRunners.get(boundary.id)?.runnerGraphNodeId;
		if (!graphNodeId) continue;
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'async-boundary-update',
			boundaryId: boundary.id,
			graphNodeId,
		});
	}

	// Branch flip symbols (gate-blind like the arena; protocol-view wires only
	// gate-supported ones onto branch records).
	const branchBindings = graphBindingMap(input.semanticGraph);
	const branchAliases = semanticAliasMap(input.semanticGraph);
	for (const site of input.semanticGraph.branchSites) {
		const resolved = resolveGraphPath(site.testSource, branchBindings, branchAliases);
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'branch-update',
			branchSiteId: site.id,
			testSource: site.testSource,
			testReads: resolved
				? [
						{
							source: site.testSource,
							graphNodeId: resolved.binding.id,
							path: resolved.path,
						},
					]
				: [],
		});
	}

	return {
		passId: 'symbol-resolver',
		dynamicImportOwner: 'generated-symbol-resolver',
		symbols,
		syncPolicies: input.semanticGraph.events
			.filter((event) => event.hasSyncPolicyCandidate)
			.map((event) => ({
				eventId: event.id,
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
			})),
		diagnostics: input.payloadArena.diagnostics,
	};
}

export function planBoundSymbolResolver(
	input: BoundSymbolResolverInput,
): BoundSymbolResolverArtifact {
	const pathsByTerminalEdge = componentEdgePaths(input.semanticGraph.componentEdges);
	const rows: BoundSymbolResolverRow[] = [];

	for (const symbol of input.captureAnalysis.extractedSymbols) {
		const edgeDependentSlots = symbol.captureSlots.filter((slot) =>
			slot.routes.some((route) => route.componentEdgeId !== undefined),
		);
		const terminalEdgeIds = new Set(
			edgeDependentSlots.flatMap((slot) =>
				slot.routes.flatMap((route) =>
					route.componentEdgeId ? [route.componentEdgeId] : [],
				),
			),
		);
		for (const terminalEdgeId of terminalEdgeIds) {
			for (const path of pathsByTerminalEdge.get(terminalEdgeId) ?? []) {
				const componentEdgePath = path.map((edge) => edge.id);
				const captureSlots = edgeDependentSlots.flatMap((slot) => {
					const route = slot.routes.find(
						(candidate) =>
							candidate.componentEdgeId === terminalEdgeId &&
							(!candidate.componentEdgePath ||
								(candidate.componentEdgePath.every(
									(edgeId, index) => componentEdgePath[index] === edgeId,
								) &&
									candidate.componentEdgePath.length ===
										componentEdgePath.length)),
					);
					return route && route.kind !== 'unsupported-opaque'
						? [
								{
									slotId: slot.id,
									path: slot.path,
									route,
									...(slot.propName
										? {
												legacyGraphRead: {
													graphNodeId: 'prop:props',
													path: [slot.propName, ...slot.path],
												},
											}
										: {}),
								},
							]
						: [];
				});
				if (captureSlots.length !== edgeDependentSlots.length) continue;
				if (
					symbol.kind !== 'event-handler' &&
					symbol.kind !== 'callback-prop' &&
					captureSlots.every((slot) => slot.route.kind === 'compiler-known-constant')
				)
					continue;
				const ancestry = path.map((edge) => ({
					componentEdgeId: edge.id,
					branchScopeIds: edge.branchScopeIds,
					keyedRepeatScopeIds: edge.keyedRepeatScopeIds,
				}));
				const instancePath = componentEdgeInstancePath(path);
				rows.push({
					id: boundSymbolId(symbol.symbolId, ancestry),
					// Imported symbols keep the child-local ID in the bound record ID,
					// but the parent resolver owns a module-scoped loader ID. Using that
					// loader ID as the row key prevents a child `symbol:0` from claiming
					// an unrelated parent-owned `symbol:0` record.
					baseSymbolId: symbol.loaderSymbolId ?? symbol.symbolId,
					...(symbol.loaderSymbolId ? { loaderSymbolId: symbol.loaderSymbolId } : {}),
					...(instancePath ? { instancePath } : {}),
					componentEdgePath,
					ancestry,
					captureSlots,
				});
			}
		}
	}

	return { passId: 'bound-symbol-resolver', rows };
}

function componentEdgePaths(edges: SymbolResolverInput['semanticGraph']['componentEdges']) {
	const incomingByComponent = new Map<string, typeof edges>();
	for (const edge of edges) {
		const incoming = incomingByComponent.get(edge.childComponentName) ?? [];
		incomingByComponent.set(edge.childComponentName, [...incoming, edge]);
	}
	const result = new Map<string, Array<Array<(typeof edges)[number]>>>();
	const visit = (
		edge: (typeof edges)[number],
		seen: ReadonlySet<string>,
	): Array<Array<(typeof edges)[number]>> => {
		if (seen.has(edge.id)) return [];
		const nextSeen = new Set(seen).add(edge.id);
		const parents = (incomingByComponent.get(edge.parentComponentName) ?? []).filter(
			(parent) => !nextSeen.has(parent.id),
		);
		if (parents.length === 0) return [[edge]];
		return parents.flatMap((parent) => visit(parent, nextSeen).map((path) => [...path, edge]));
	};
	for (const edge of edges) result.set(edge.id, visit(edge, new Set()));
	return result;
}

function boundSymbolId(baseSymbolId: string, ancestry: BoundSymbolResolverRow['ancestry']): string {
	const segment = (values: ReadonlyArray<string>) => values.map(encodeURIComponent).join(',');
	return `bound:${encodeURIComponent(baseSymbolId)}:${ancestry
		.map((entry) => {
			const scopes =
				entry.branchScopeIds.length === 0 && entry.keyedRepeatScopeIds.length === 0
					? ''
					: `b=${segment(entry.branchScopeIds)};k=${segment(entry.keyedRepeatScopeIds)}`;
			const edgeId = encodeURIComponent(entry.componentEdgeId);
			return scopes ? `${edgeId}[${scopes}]` : edgeId;
		})
		.join('/')}`;
}

function eventWrites(
	handlerSource: string,
	writes: ReadonlyArray<LoweredStateWrite> | undefined,
	handlerSpan: SourceSpan | undefined,
): ReadonlyArray<LoweredStateWrite> {
	if (!handlerSource || !writes?.length) return [];

	return writes.filter((write) => {
		if (handlerSpan && write.sourceSpan) return spanContains(handlerSpan, write.sourceSpan);
		return handlerContainsWrite(handlerSource, write);
	});
}

function eventReads(
	reads: ReadonlyArray<LoweredStateRead> | undefined,
	handlerSpan: SourceSpan | undefined,
	parameterBindingNames: ReadonlySet<string>,
): ReadonlyArray<LoweredStateRead> {
	if (!handlerSpan || !reads?.length) return [];

	const contained = reads.filter(
		(read) =>
			read.sourceSpan !== undefined &&
			spanContains(handlerSpan, read.sourceSpan) &&
			!parameterBindingNames.has(rootIdentifierName(read.source)),
	);
	const seen = new Set<string>();
	return contained.filter((read) => {
		const key = `${read.bindingId ?? ''}:${read.graphNodeId}:${read.path.join('.')}:${read.source}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function functionParameterBindingNames(source: string): ReadonlySet<string> {
	const prefix = 'const __marklessHandler = ';
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(`${prefix}${source};`);
	} catch {
		return new Set();
	}

	const names = new Set<string>();
	let foundFunction = false;
	walkNode(ast, (node) => {
		if (
			foundFunction ||
			(node.type !== 'ArrowFunctionExpression' &&
				node.type !== 'FunctionExpression' &&
				node.type !== 'FunctionDeclaration')
		) {
			return;
		}
		foundFunction = true;
		for (const parameter of asNodeArray(node.params)) {
			for (const name of bindingPatternNames(parameter)) names.add(name);
		}
	});
	return names;
}

function bindingPatternNames(node: AnyNode | undefined): ReadonlyArray<string> {
	if (!node) return [];
	if (node.type === 'Identifier') {
		const name = getIdentifierName(node);
		return name ? [name] : [];
	}
	if (node.type === 'AssignmentPattern') {
		return bindingPatternNames(node.left as AnyNode | undefined);
	}
	if (node.type === 'RestElement') {
		return bindingPatternNames(node.argument as AnyNode | undefined);
	}
	if (node.type === 'ObjectPattern') {
		return asNodeArray(node.properties).flatMap((property) =>
			property.type === 'Property'
				? bindingPatternNames(property.value as AnyNode | undefined)
				: bindingPatternNames(property.argument as AnyNode | undefined),
		);
	}
	if (node.type === 'ArrayPattern') {
		return asNodeArray(node.elements).flatMap((element) => bindingPatternNames(element));
	}
	return [];
}

function rootIdentifierName(source: string): string {
	return /^[$A-Z_a-z][$0-9A-Z_a-z]*/.exec(source)?.[0] ?? '';
}

function spanContains(container: SourceSpan, child: SourceSpan): boolean {
	return (
		container.filename === child.filename &&
		child.start >= container.start &&
		child.end <= container.end
	);
}

function handlerContainsWrite(handlerSource: string, write: LoweredStateWrite): boolean {
	if (write.operation === 'assign' && write.valueSource) {
		return handlerContainsAssignment(handlerSource, write);
	}

	if (write.operation === 'update' && write.updateOperator) {
		const source = escapeRegExp(write.source);
		const operator = escapeRegExp(write.updateOperator);
		return (
			new RegExp(`(?:^|[^$0-9A-Z_a-z])${source}\\s*${operator}`).test(handlerSource) ||
			new RegExp(`${operator}\\s*${source}(?:$|[^$0-9A-Z_a-z])`).test(handlerSource)
		);
	}

	if (write.operation === 'delete') {
		return new RegExp(`delete\\s+${escapeRegExp(write.source)}(?:$|[^$0-9A-Z_a-z])`).test(
			handlerSource,
		);
	}

	if (write.operation === 'call' && write.method) {
		return (
			handlerSource.includes(write.source) &&
			handlerSource.includes(`.${write.method}`) &&
			(write.argumentSources ?? []).every((argument) => handlerSource.includes(argument))
		);
	}

	return handlerSource.includes(write.source);
}

function handlerContainsAssignment(handlerSource: string, write: LoweredStateWrite): boolean {
	if (!write.valueSource) return false;

	const source = escapeRegExp(write.source);
	const operator = escapeRegExp(write.assignmentOperator ?? '=');
	const valueSource = escapeRegExp(write.valueSource);

	return new RegExp(
		`(?:^|[^$0-9A-Z_a-z])${source}\\s*${operator}\\s*${valueSource}(?:$|[^$0-9A-Z_a-z])`,
	).test(handlerSource);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function referencedModuleImports(
	imports: ReadonlyArray<SemanticModuleImport>,
	source: string,
): ReadonlyArray<SemanticModuleImport> {
	if (!source || imports.length === 0) return [];

	const searchableSource = sourceWithoutStringOrCommentText(source);
	return imports.filter((item) => sourceReferencesIdentifier(searchableSource, item.localName));
}

function sourceReferencesIdentifier(source: string, name: string): boolean {
	for (
		let index = source.indexOf(name);
		index !== -1;
		index = source.indexOf(name, index + name.length)
	) {
		const before = source[index - 1] ?? '';
		const after = source[index + name.length] ?? '';
		if (isIdentifierChar(before)) continue;
		if (before === '.' && source.slice(index - 3, index) !== '...') continue;
		if (isIdentifierChar(after)) continue;

		return true;
	}

	return false;
}

function isIdentifierChar(char: string): boolean {
	return /[$0-9A-Z_a-z]/.test(char);
}

function sourceWithoutStringOrCommentText(source: string): string {
	let result = '';
	let quote: string | null = null;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';

		if (lineComment) {
			if (char === '\n') {
				lineComment = false;
				result += char;
			} else {
				result += ' ';
			}
			continue;
		}

		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				result += '  ';
				index++;
			} else {
				result += char === '\n' ? char : ' ';
			}
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			result += ' ';
			continue;
		}

		if (char === '/' && next === '/') {
			lineComment = true;
			result += '  ';
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			blockComment = true;
			result += '  ';
			index++;
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			result += ' ';
			continue;
		}

		result += char;
	}

	return result;
}

function findModuleImport(
	imports: SymbolResolverInput['semanticGraph']['moduleImports'],
	functionSource: string,
) {
	const [rootName] = functionSource.split('.');
	if (!rootName) return undefined;

	return imports.find((item) => item.localName === rootName);
}

// Handler statements like box.focus() reference element() handles; they must
// survive into the emitted symbol (the runtime resolves the handle by name).
// Walks the handler AST so optional calls, nested callbacks, and lookalike
// string/comment text keep authored source semantics.
function collectElementHandleCalls(
	source: string,
	elementHandles: ReadonlyArray<{ readonly name: string }>,
): ReadonlyArray<{
	readonly handleName: string;
	readonly method: string;
	readonly source: string;
	readonly argumentSources: ReadonlyArray<string>;
	readonly offset: number;
	readonly endOffset: number;
}> {
	if (elementHandles.length === 0) return [];
	const names = new Set(elementHandles.map((handle) => handle.name));
	const calls: Array<{
		handleName: string;
		method: string;
		source: string;
		argumentSources: string[];
		offset: number;
		endOffset: number;
	}> = [];

	const prefix = 'const __marklessHandler = ';
	const wrappedSource = `${prefix}${source};`;
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(wrappedSource);
	} catch {
		return [];
	}

	walkNode(ast, (node) => {
		if (node.type !== 'CallExpression') return;

		const callee = unwrapChainExpression(node.callee as AnyNode | undefined);
		if (callee?.type !== 'MemberExpression') return;

		const handleName = getIdentifierName(
			unwrapChainExpression(callee.object as AnyNode | undefined),
		);
		const method = getStaticMemberPropertyName(callee);
		if (!handleName || !method || !names.has(handleName)) return;
		if (typeof node.start !== 'number' || typeof node.end !== 'number') return;

		const offset = node.start - prefix.length;
		const endOffset = node.end - prefix.length;
		if (offset < 0 || endOffset <= offset || endOffset > source.length) return;

		const argumentSources = asNodeArray(node.arguments).map((argument) =>
			wrappedSource.slice(argument.start, argument.end).trim(),
		);
		calls.push({
			handleName,
			method,
			source: source.slice(offset, endOffset),
			argumentSources,
			offset,
			endOffset,
		});
	});

	return calls;
}

function unwrapChainExpression(node: AnyNode | undefined): AnyNode | undefined {
	return node?.type === 'ChainExpression' ? (node.expression as AnyNode | undefined) : node;
}

function getStaticMemberPropertyName(node: AnyNode): string | null {
	const property = node.property as AnyNode | undefined;
	if (typeof property?.name === 'string') return property.name;
	if (
		node.computed === true &&
		property?.type === 'Literal' &&
		typeof property.value === 'string'
	) {
		return property.value;
	}
	return null;
}

function asNodeArray(value: unknown): AnyNode[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is AnyNode =>
					typeof item === 'object' &&
					item !== null &&
					typeof (item as AnyNode).start === 'number' &&
					typeof (item as AnyNode).end === 'number',
			)
		: [];
}
