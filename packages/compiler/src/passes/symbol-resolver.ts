import type {
	BoundSymbolResolverArtifact,
	BoundSymbolResolverInput,
	BoundSymbolResolverRow,
	LoweredElementHandleRead,
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	SemanticGraphAlias,
	SemanticGraphBinding,
	SemanticModuleImport,
	SourceSpan,
	SymbolResolverInput,
	SymbolResolverPlan,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	type ResolvedGraphPath,
} from '../artifact-helpers/graph-paths.ts';
import {
	componentEdgeInstancePath,
	componentEdgeInstanceSegment,
} from '../component-edge-instance.ts';
import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../ast/nodes.ts';
import { parseJavaScriptModule } from '../js-ast.ts';
import {
	createSymbolSourceSemanticsReader,
	type SymbolSourceSemanticsReader,
} from './capture-semantics.ts';
import {
	componentSharedSeedWrite,
	resolveSharedInstanceGraphPath,
	sharedCallbackSlotGraphNodeId,
} from './semantic-graph/collect-shared.ts';
import { resolveBoundaryRunners } from './public-render/boundary-runner.ts';

export function planSymbolResolver(input: SymbolResolverInput): SymbolResolverPlan {
	const symbols: PlannedSymbol[] = [];
	let nextSymbolId = 0;
	// One reader per plan run, so a source shared by several symbols is analyzed
	// once and nothing is retained between compilations.
	const semanticsReader = createSymbolSourceSemanticsReader();
	// A handle this module hands to a child part through `el=` is still a handle
	// here, even though no element of this module's own markup binds it.
	const reachableElementHandles = [
		...input.payloadArena.view.elementHandles,
		...input.semanticGraph.componentEdges.flatMap((edge) =>
			edge.props.flatMap((prop) =>
				prop.kind === 'graph-reference' && prop.graphBindingKind === 'element'
					? [{ name: prop.source }]
					: [],
			),
		),
	];
	// Every handle this module can name, by the graph node state lowering resolves
	// its reads to. A read that lands here is a handle read, not a state read.
	const handlesByGraphNodeId = elementHandlesByGraphNodeId(input.payloadArena);

	const handleReadsOf = (reads: ReadonlyArray<LoweredStateRead> | undefined) =>
		elementHandleReads(reads, handlesByGraphNodeId);

	for (const event of input.payloadArena.view.events) {
		if (event.handlerSource === undefined) continue;

		const sourceSpan = event.handlerSpan;
		const inlined = inlineSharedMethodCalls(
			event.handlerSource,
			input.semanticGraph,
			semanticsReader,
		);
		const source = inlined.source;
		const moduleImports = referencedModuleImports(input.semanticGraph.moduleImports, source);
		const reads = eventReads(
			input.stateLowering?.reads,
			[sourceSpan, ...inlined.spans],
			source,
			semanticsReader,
		);

		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'event-handler',
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			source,
			sourceSpan,
			parameters: event.handlerParameters,
			...(moduleImports.length > 0 ? { moduleImports } : {}),
			order: 0,
			reads,
			writes: eventWrites(source, input.stateLowering?.writes, [
				sourceSpan,
				...inlined.spans,
			]),
			elementHandleCalls: collectElementHandleCalls(source, reachableElementHandles),
			elementHandleReads: handleReadsOf(reads),
		});
	}

	for (const edge of input.semanticGraph.componentEdges) {
		for (const prop of edge.props) {
			if (prop.kind !== 'callback') continue;
			// A callback prop carries no runtime shared instance either, so a method
			// it calls is inlined the way an event handler's is.
			const inlined = inlineSharedMethodCalls(
				prop.source,
				input.semanticGraph,
				semanticsReader,
			);
			const source = inlined.source;
			const moduleImports = referencedModuleImports(input.semanticGraph.moduleImports, source);
			const reads = eventReads(
				input.stateLowering?.reads,
				[prop.sourceSpan, ...inlined.spans],
				source,
				semanticsReader,
			);
			symbols.push({
				id: `symbol:${nextSymbolId++}`,
				kind: 'callback-prop',
				componentEdgeId: edge.id,
				propName: prop.name,
				source,
				sourceSpan: prop.sourceSpan,
				parameters: prop.parameters ?? [],
				...(moduleImports.length > 0 ? { moduleImports } : {}),
				reads,
				writes: eventWrites(source, input.stateLowering?.writes, [
					prop.sourceSpan,
					...inlined.spans,
				]),
				elementHandleReads: handleReadsOf(reads),
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

	for (const write of input.semanticGraph.stateWrites) {
		const seed = componentSharedSeedWrite(write, input.semanticGraph);
		if (!seed) continue;
		const source = write.valueSource ?? '';
		const moduleImports = referencedModuleImports(input.semanticGraph.moduleImports, source);
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'shared-seed',
			graphNodeId: seed.resolved.binding.id,
			path: seed.resolved.path,
			componentName: seed.componentName,
			name: write.target,
			source,
			...(moduleImports.length > 0 ? { moduleImports } : {}),
		});
	}

	// A widget root filling a callback slot seeds that slot's node with the id of
	// the symbol its own prop was compiled into, so a part invoking the slot
	// reaches the consumer's handler through the graph rather than through an
	// enclosure its own module cannot see.
	const seededSlots = new Set<string>();
	for (const binding of input.semanticGraph.sharedCallbackBindings ?? []) {
		const graphNodeId = sharedCallbackSlotGraphNodeId(binding.definitionId, binding.slotName);
		if (seededSlots.has(graphNodeId)) continue;
		seededSlots.add(graphNodeId);
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'shared-seed',
			graphNodeId,
			path: [],
			componentName: binding.componentName,
			name: binding.slotName,
			source: binding.propName,
			callbackSlotPropName: binding.propName,
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
		// A recombined condition already has its node: the semantic graph minted one
		// computed over every read inside it. Prefer that over re-resolving the
		// authored text, which names no binding once it is more than a bare read.
		const resolved = site.testComputedGraphNodeId
			? { binding: { id: site.testComputedGraphNodeId }, path: [] as ReadonlyArray<string> }
			: resolveBranchTestRead(
					site.testSource,
					input,
					branchBindings,
					branchAliases,
					site.componentName,
				);
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

/**
 * What a BARE branch condition tests. The instance resolver goes first because it
 * is the only reading that knows what a part local HOLDS: the binding map answers
 * `panel.open` only when the part's local happens to repeat the factory's own
 * state variable name, which is a spelling coincidence, not evidence. It answers
 * nothing when the root is not an instance local, so every other shape keeps the
 * resolution it had. Neither answering still mints nothing rather than a node no
 * one proved: a repeat local or a literal is settled by the render that made it.
 *
 * `componentName` is the body the condition was authored in. Without it the
 * instance resolver matched the local against every instance in the module and
 * the last declaration won, so one widget's arm flipped on another widget's cell.
 */
function resolveBranchTestRead(
	testSource: string,
	input: SymbolResolverInput,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
	componentName?: string,
): ResolvedGraphPath | null {
	return (
		resolveSharedInstanceGraphPath(testSource, input.semanticGraph, componentName) ??
		resolveGraphPath(testSource, bindings, aliases)
	);
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
				const instancePath = componentEdgeInstancePath(path, input.semanticGraph.componentEdges);
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

	const edges = input.semanticGraph.componentEdges;
	const componentEdgeInstancePaths = edges.flatMap((edge) => {
		const instancePath = componentEdgeInstanceSegment(edge, edges);
		return instancePath ? [{ componentEdgeId: edge.id, instancePath }] : [];
	});
	return { passId: 'bound-symbol-resolver', rows, componentEdgeInstancePaths };
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

// A shared() definition returns methods that close over its factory graph. A
// handler that calls one carries no runtime instance, so the call is replaced
// by the method's own body; the method's declaration span travels with it so
// the writes inside it are attributed to this handler.
function inlineSharedMethodCalls(
	source: string,
	semanticGraph: SymbolResolverInput['semanticGraph'],
	semanticsReader: SymbolSourceSemanticsReader,
): { readonly source: string; readonly spans: ReadonlyArray<SourceSpan> } {
	if (!source || semanticGraph.sharedInstances.length === 0) return { source, spans: [] };

	const spans: SourceSpan[] = [];
	let emitted = source;
	for (const instance of semanticGraph.sharedInstances) {
		const definition = semanticGraph.sharedDefinitions.find(
			(item) => item.id === instance.definitionId,
		);
		if (!definition) continue;
		for (const property of definition.returnProperties ?? []) {
			if (property.kind !== 'method' || !property.source) continue;
			const callee = `${instance.localName}.${property.name}`;
			if (!invokesMethod(emitted, callee, semanticsReader)) continue;
			const method = sharedMethodSource(property.source);
			if (method === null) continue;
			// A method that dispatches to a consumer callback awaits that dispatch,
			// so the inlined body has to be an async context.
			const dispatches = semanticGraph.sharedCallbackInvocations.some(
				(invocation) =>
					invocation.definitionId === definition.id &&
					method.body.includes(invocation.calleeSource),
			);
			const arrow = `(${dispatches ? 'async ' : ''}(${method.parameters}) => {${method.body}})`;
			// The dispatching body is awaited where the authored call stood, so the
			// statements the author wrote after it still run after it. Left
			// unawaited, the call is fire-and-forget: the rest of the handler races
			// the dispatch, and the end-of-dispatch flush closes over only the
			// awaited leg, so whatever the dispatch writes late is dropped. The
			// parentheses keep the await a valid operand wherever the call stood.
			// `awaited` is false only where `replaceMethodCalls` has established
			// there is nothing after the call to order against.
			const replaced = replaceMethodCalls(
				emitted,
				callee,
				(args, awaited) =>
					dispatches && awaited ? `(await ${arrow}(${args}))` : `${arrow}(${args})`,
				dispatches,
			);
			// Unchanged is the refusal: no call site could be inlined, so the
			// authored calls stand and fail the compile as unresolved references.
			if (replaced === emitted) continue;
			emitted = replaced;
			if (property.sourceSpan) spans.push(property.sourceSpan);
		}
	}

	return { source: emitted, spans };
}

/**
 * Whether the handler really calls the shared method, asked of the analyzer's
 * callee table rather than of the source text - the same name inside a string
 * literal or a comment is not a call.
 *
 * A source the analyzer could not read falls back to the text test, which is
 * what an unparsable handler already got before this pass had a semantic
 * substrate.
 */
function invokesMethod(
	source: string,
	callee: string,
	semanticsReader: SymbolSourceSemanticsReader,
): boolean {
	const semantics = semanticsReader.read(source);
	return semantics.analysisFailed ? source.includes(`${callee}()`) : semantics.invokes(callee);
}

// The statements between the method's own braces, from the authored property
// text (`login() { ... }`, `setAll(on: boolean) { ... }`). The parameter list
// travels with the body: the inlined arrow binds it to the call's own arguments,
// which is the same scoping the call had.
function sharedMethodSource(
	propertySource: string,
): { readonly parameters: string; readonly body: string } | null {
	const open = propertySource.indexOf('(');
	if (open === -1) return null;
	const close = sharedMethodParameterEnd(propertySource, open);
	if (close === -1) return null;

	const bodyStart = propertySource.indexOf('{', close);
	const bodyEnd = propertySource.lastIndexOf('}');
	if (bodyStart === -1 || bodyEnd <= bodyStart) return null;

	return {
		parameters: propertySource.slice(open + 1, close),
		body: propertySource.slice(bodyStart + 1, bodyEnd),
	};
}

/**
 * Where the parameter list's own closing parenthesis stands.
 *
 * A first-`)` scan cuts a parameter whose type or default carries parentheses
 * of its own - `done: () => void`, `now = Date.now()` - in half. The arrow
 * spliced in from that half does not parse, so every later pass reads the
 * handler as unreadable and the emitter prints an empty symbol: the whole
 * handler body disappears at dispatch with no diagnostic anywhere. The parser
 * answers the question exactly, and a source it cannot read falls back to a
 * delimiter scan, which is still right wherever the old first-`)` scan was.
 */
function sharedMethodParameterEnd(propertySource: string, open: number): number {
	const moduleSource = `const __marklessSharedMethod = { ${propertySource} };`;
	const offset = moduleSource.indexOf(propertySource);
	try {
		// Authored method text keeps its TypeScript annotations.
		const ast = parseJavaScriptModule(moduleSource, 'generated.ts');
		let bodyStart = -1;
		walkNode(ast, (node) => {
			if (bodyStart !== -1) return;
			if (node.type !== 'FunctionExpression' && node.type !== 'ArrowFunctionExpression') return;
			const body = node.body as AnyNode | undefined;
			if (typeof body?.start === 'number') bodyStart = body.start - offset;
		});
		if (bodyStart > open) {
			const close = propertySource.lastIndexOf(')', bodyStart);
			if (close > open) return close;
		}
	} catch {
		// An unparsable method falls through to the scan below.
	}

	let depth = 0;
	for (let index = open; index < propertySource.length; index += 1) {
		const character = propertySource[index];
		if (character === '(') depth += 1;
		else if (character === ')') {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

/**
 * Every call of `callee` in this source, replaced by what `build` makes of its
 * own argument text. The calls are found in the parsed expression rather than in
 * the text, so the same spelling inside a string or a comment is left alone, and
 * an argument list containing parentheses or commas keeps its own boundaries. A
 * source the parser cannot read is returned unchanged: it inlines nothing rather
 * than splicing text it did not understand.
 *
 * `awaitsCall` says the replacement text contains `await`, which is legal only
 * inside an async function. The handler the author wrote is usually synchronous,
 * so the function that encloses the call is marked async here as well - both to
 * keep this source parsable by every later pass and because the emitter reads
 * that same leading `async` when it decides whether the symbol module it prints
 * is async.
 *
 * A call inside a NESTED synchronous function cannot be fixed that way: marking
 * that function async changes what its own caller receives, and the author wrote
 * a callback, not a promise. Two cases are separated there:
 *
 * - the call stands alone as the last statement of that function, which is the
 *   shape a callback passed to a runtime option has - `onDismiss: () => {
 *   modal.setOpen(false); }`. Nothing follows it, so there is no ordering for
 *   `await` to protect and none is emitted: the body is inlined as it stands and
 *   the function keeps returning what it returned.
 * - anywhere else, the site is left alone. The authored call survives into the
 *   emitted module, where the unresolved-reference check names it and fails the
 *   compile - loudly, rather than by quietly dropping the statement.
 *
 * Either way it is decided PER CALL SITE. A single unsupported site used to
 * abandon the whole replacement, which left every other call of the same method
 * in the same handler unlowered as well.
 */
function replaceMethodCalls(
	source: string,
	callee: string,
	build: (argumentSource: string, awaited: boolean) => string,
	awaitsCall = false,
): string {
	const moduleSource = `const __marklessInlineSource = ${source};`;
	let ast: AnyNode;
	try {
		// Authored handler sources keep their TypeScript annotations, so the parse
		// has to be told it is reading TypeScript.
		ast = parseJavaScriptModule(moduleSource, 'generated.ts');
	} catch {
		return source;
	}
	const offset = moduleSource.indexOf(source);
	const edits: Array<{ start: number; end: number; text: string; unawaited: string }> = [];
	// Every function in this source, so a replacement carrying `await` can ask
	// which one encloses the call it stands in, and whether the call is the last
	// thing that function does.
	const functions: Array<{
		start: number;
		end: number;
		isAsync: boolean;
		tail: { start: number; end: number } | null;
	}> = [];
	walkNode(ast, (node) => {
		if (
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration'
		) {
			if (typeof node.start === 'number' && typeof node.end === 'number')
				functions.push({
					start: node.start,
					end: node.end,
					isAsync: node.async === true,
					tail: tailStatementExpressionSpan(node),
				});
		}
		if (node.type !== 'CallExpression') return;
		const target = node.callee as AnyNode | undefined;
		if (
			typeof node.start !== 'number' ||
			typeof node.end !== 'number' ||
			typeof target?.start !== 'number' ||
			typeof target?.end !== 'number' ||
			moduleSource.slice(target.start, target.end) !== callee
		)
			return;
		const args = (node.arguments as AnyNode[] | undefined) ?? [];
		const argumentSource = args
			.map((argument) =>
				typeof argument.start === 'number' && typeof argument.end === 'number'
					? moduleSource.slice(argument.start, argument.end)
					: '',
			)
			.join(', ');
		edits.push({
			start: node.start,
			end: node.end,
			text: build(argumentSource, true),
			unawaited: build(argumentSource, false),
		});
	});
	if (edits.length === 0) return source;

	// Outermost first, then apply from the end so earlier offsets stay valid; a
	// call nested inside one already replaced travelled with that replacement.
	const ordered = [...edits].sort((left, right) => left.start - right.start);
	const applied: typeof ordered = [];
	for (const edit of ordered) if (!applied.some((held) => held.end >= edit.end)) applied.push(edit);
	let mutations: Array<{ start: number; end: number; text: string }> = [...applied];
	if (awaitsCall) {
		const asyncified = new Set<number>();
		mutations = [];
		for (const edit of applied) {
			const enclosing = [...functions]
				.filter((fn) => fn.start <= edit.start && fn.end >= edit.end)
				.sort((left, right) => left.end - left.start - (right.end - right.start));
			const innermost = enclosing[0];
			// No enclosing function at all: `await` cannot stand here and there is
			// nothing to mark async, so the site is skipped and its authored call
			// survives for the unresolved-reference check to refuse.
			if (!innermost) continue;
			if (innermost.isAsync) {
				mutations.push(edit);
				continue;
			}
			if (enclosing.length > 1) {
				// A nested synchronous function. Marking it async would change what
				// its caller receives, so only a call standing alone as its last
				// statement is inlined, unawaited: nothing follows it there, so the
				// order the author wrote is kept exactly.
				if (
					innermost.tail &&
					innermost.tail.start === edit.start &&
					innermost.tail.end === edit.end
				) {
					mutations.push({ start: edit.start, end: edit.end, text: edit.unawaited });
				}
				continue;
			}
			mutations.push(edit);
			asyncified.add(innermost.start);
		}
		if (mutations.length === 0) return source;
		for (const start of asyncified) mutations.push({ start, end: start, text: 'async ' });
	}

	let emitted = moduleSource;
	// Highest offset first, so every earlier offset is still valid when applied.
	for (const mutation of [...mutations].sort((left, right) => right.start - left.start))
		emitted = emitted.slice(0, mutation.start) + mutation.text + emitted.slice(mutation.end);
	return emitted.slice(offset, emitted.length - 1);
}

/**
 * The span of the expression a function's LAST statement evaluates, when its
 * body is a block ending in a bare expression statement.
 *
 * "Last statement" is read off the function's own statement list, so a call
 * buried in a branch does not qualify: something after that branch could still
 * run. The expression's own span is returned rather than the statement's,
 * because the call has to BE the statement — `foo(instance.close())` ends the
 * body too, and there the call's value is consumed by `foo`.
 */
function tailStatementExpressionSpan(
	node: AnyNode,
): { readonly start: number; readonly end: number } | null {
	const body = node.body as AnyNode | undefined;
	if (body?.type !== 'BlockStatement') return null;

	const statements = asNodes(body.body);
	const last = statements[statements.length - 1];
	if (last?.type !== 'ExpressionStatement') return null;

	const expression = last.expression as AnyNode | undefined;
	if (typeof expression?.start !== 'number' || typeof expression.end !== 'number') return null;

	return { start: expression.start, end: expression.end };
}

function eventWrites(
	handlerSource: string,
	writes: ReadonlyArray<LoweredStateWrite> | undefined,
	handlerSpans: ReadonlyArray<SourceSpan | undefined>,
): ReadonlyArray<LoweredStateWrite> {
	if (!handlerSource || !writes?.length) return [];

	const spans = handlerSpans.filter((span): span is SourceSpan => span !== undefined);
	return writes.filter((write) => {
		if (spans.length > 0 && write.sourceSpan) {
			const containing = spans.some((span) => spanContains(span, write.sourceSpan!));
			if (containing) return true;
			if (handlerSpans[0]) return false;
		}
		return handlerContainsWrite(handlerSource, write);
	});
}

function eventReads(
	reads: ReadonlyArray<LoweredStateRead> | undefined,
	handlerSpans: ReadonlyArray<SourceSpan | undefined>,
	handlerSource: string,
	semanticsReader: SymbolSourceSemanticsReader,
): ReadonlyArray<LoweredStateRead> {
	const spans = handlerSpans.filter((span): span is SourceSpan => span !== undefined);
	if (spans.length === 0 || !reads?.length) return [];

	const bindsOwnName = handlerBoundName(handlerSource, semanticsReader);
	const contained = reads.filter(
		(read) =>
			read.sourceSpan !== undefined &&
			spans.some((span) => spanContains(span, read.sourceSpan!)) &&
			!bindsOwnName(rootIdentifierName(read.source)),
	);
	const seen = new Set<string>();
	return contained.filter((read) => {
		const key = `${read.bindingId ?? ''}:${read.graphNodeId}:${read.path.join('.')}:${read.source}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

// A lowered read can sit inside the handler span yet not read component state at
// all: the handler may bind that name itself. Whether a name is bound by the
// source is a scope question, and the analyzer already answers it - a name the
// source binds is not free in it - so the handler's own bindings are read off
// `freeNames` rather than recovered by walking its parameter patterns by hand.
function handlerBoundName(
	handlerSource: string,
	semanticsReader: SymbolSourceSemanticsReader,
): (name: string) => boolean {
	// A source with no text carries no bindings, and a source the analyzer could
	// not read reports no names for lack of an answer rather than because it binds
	// none. Both stay fail-open, keeping every contained read exactly as an
	// unparsable handler did before.
	if (handlerSource.trim() === '') return () => false;
	const semantics = semanticsReader.read(handlerSource);
	if (semantics.analysisFailed) return () => false;

	// A read whose source does not start with an identifier has no root name to
	// attribute, so it is never treated as handler-bound.
	return (name) => name !== '' && !semantics.freeNames.has(name);
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
	// A template literal blanks its text but keeps its `${}` expressions, so an
	// identifier used only inside an interpolation stays visible to the scan. The
	// stack carries that nesting: each frame is either a template or the code of
	// one interpolation, whose own braces have to balance before `}` closes it.
	const frames: Array<{ readonly template: boolean; braceDepth: number }> = [
		{ template: false, braceDepth: 0 },
	];

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';
		const frame = frames[frames.length - 1] ?? { template: false, braceDepth: 0 };

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

		if (frame.template) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '`') {
				frames.pop();
			} else if (char === '$' && next === '{') {
				frames.push({ template: false, braceDepth: 0 });
				result += '  ';
				index++;
				continue;
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

		if (char === '"' || char === "'") {
			quote = char;
			result += ' ';
			continue;
		}

		if (char === '`') {
			frames.push({ template: true, braceDepth: 0 });
			result += ' ';
			continue;
		}

		if (char === '{') {
			frame.braceDepth++;
			result += char;
			continue;
		}

		if (char === '}') {
			if (frame.braceDepth === 0 && frames.length > 1) {
				frames.pop();
				result += ' ';
				continue;
			}
			if (frame.braceDepth > 0) frame.braceDepth--;
			result += char;
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

/**
 * Every element() handle this module renders, keyed by the graph node that state
 * lowering resolves a read of it to.
 *
 * Handles bound in a keyed row and handles inside an async boundary arm are
 * collected too: a handler in either place still names the same authored handle,
 * and the resume registry answers by the same name.
 */
function elementHandlesByGraphNodeId(
	payloadArena: SymbolResolverInput['payloadArena'],
): ReadonlyMap<string, { readonly handleId: string; readonly name: string }> {
	const byGraphNodeId = new Map<string, { handleId: string; name: string }>();
	for (const handle of [
		...payloadArena.view.elementHandles,
		...payloadArena.view.keyedRepeats.flatMap((repeat) => repeat.rowElementHandles ?? []),
		...payloadArena.view.asyncBoundaries.flatMap((boundary) =>
			boundary.armRecords.flatMap((arm) => arm.elementHandles),
		),
	]) {
		if (!byGraphNodeId.has(handle.handleId))
			byGraphNodeId.set(handle.handleId, { handleId: handle.handleId, name: handle.name });
	}
	return byGraphNodeId;
}

/**
 * The reads that are really handle reads.
 *
 * `element()` handles are not graph values, so lowering a read of one into
 * `graph.read` answers `undefined` at dispatch — the defect this record exists to
 * close. The read stays in `reads` as well, so nothing that counts a handler's
 * graph dependencies changes shape; only the emitter treats it differently.
 */
function elementHandleReads(
	reads: ReadonlyArray<LoweredStateRead> | undefined,
	handlesByGraphNodeId: ReadonlyMap<string, { readonly handleId: string; readonly name: string }>,
): ReadonlyArray<LoweredElementHandleRead> {
	if (!reads || reads.length === 0 || handlesByGraphNodeId.size === 0) return [];
	const collected: LoweredElementHandleRead[] = [];
	for (const read of reads) {
		const handle = handlesByGraphNodeId.get(read.graphNodeId);
		// A path off a handle is a DOM property, not part of the handle's identity,
		// so it is carried beside the handle rather than folded into it: the
		// emitter rebuilds the tail onto `getElementHandle(...)`.
		if (!handle) continue;
		if (collected.some((existing) => existing.source === read.source)) continue;
		collected.push({
			source: read.source,
			handleId: handle.handleId,
			handleName: handle.name,
			...(read.path.length > 0 ? { path: read.path } : {}),
		});
	}
	return collected;
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
		// TS filename: handler sources can carry annotations and casts.
		ast = parseJavaScriptModule(wrappedSource, 'generated.ts');
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
