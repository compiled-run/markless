import type {
	GeneratedSymbolModule,
	PlannedSymbol,
	RuntimeDemandMapClosurePlan,
	SemanticGraphBinding,
	SymbolResolverPlan,
} from '../artifacts.ts';
import { parseJavaScriptModule, type JavaScriptAstNode } from '../js-ast.ts';
import {
	PROTOCOL_EVENT_ACTION_KIND,
	PROTOCOL_VISIBLE_EVENT_NAME,
	protocolEventActionKind,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type SerializedGraphPayload,
} from '@markless/serializer';

type Read = { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> };

// Only these targets have a symbol whose journal entry is a plain text or attribute write.
const CLOSURE_UPDATE_TARGETS: ReadonlySet<string> = new Set(['text', 'attribute', 'class']);
// Page-space and prop ids live outside the instance, so a closure touching one is not page-local.
const FOREIGN_GRAPH_ID = /^(?:shared|storage|prop):/;
// Context the closure store cannot answer; a symbol spelling any of them keeps full resume.
const FULL_CONTEXT_READ =
	/\b(?:getElementHandle|invokeCallback|invokeSymbol|locals|rowScope|rosterPosition|rosterCount)\b/;

export type ClosurePlanInput = {
	readonly resolver: SymbolResolverPlan;
	readonly view: ProtocolViewPayload;
	readonly state: ProtocolStatePayload;
	readonly componentEdges: unknown;
	readonly symbolModules: ReadonlyMap<string, GeneratedSymbolModule>;
	readonly graphBindings?: ReadonlyArray<SemanticGraphBinding>;
	readonly rowSymbolIds: ReadonlySet<string>;
	// Handlers that reach callbacks or bound bases: their bodies run elsewhere.
	readonly transitiveSymbolIds: (symbolIds: ReadonlyArray<string>) => ReadonlyArray<string>;
};

/**
 * The compiled closure of one event action, or undefined when anything its
 * write can reach needs the page runtime: a branch, repeat, async boundary,
 * behavior, handle, property write, foreign id, or an unknown symbol.
 */
export function closureActionPlan(
	input: ClosurePlanInput,
	event: ProtocolViewPayload['events'][number],
): RuntimeDemandMapClosurePlan | undefined {
	const { view, state } = input;
	if (protocolEventActionKind(event) !== PROTOCOL_EVENT_ACTION_KIND.event) return;
	if (event.eventName === PROTOCOL_VISIBLE_EVENT_NAME) return;
	const symbolIds = event.symbolIds ?? [];
	if (symbolIds.length !== 1 || input.rowSymbolIds.has(symbolIds[0]!)) return;
	if (input.transitiveSymbolIds(symbolIds).length !== 1) return;
	const symbolsById = new Map(input.resolver.symbols.map((symbol) => [symbol.id, symbol]));
	const handler = symbolsById.get(symbolIds[0]!);
	if (!handler || handler.kind !== 'event-handler' || !handlerIsClosureSafe(handler, input))
		return;
	if (
		(view.elementHandles ?? []).some((record) => record.hostNodeId === event.hostNodeId) ||
		(view.behaviors ?? []).some((record) => record.hostNodeId === event.hostNodeId)
	)
		return;

	const cellKinds = new Map(state.cells.map((cell) => [cell.graphNodeId, cell.valueKind]));
	const objectCells = objectEncodedCellIds(state, input.graphBindings ?? []);
	const computedById = new Map(state.computed.map((node) => [node.graphNodeId, node]));
	const writes = handler.writes ?? [];
	for (const write of writes) {
		if (write.row || write.path.length !== 0) return;
		if (write.operation !== 'assign' && write.operation !== 'update') return;
		if (!cellKinds.has(write.graphNodeId)) return;
	}
	const handlerReads: Read[] = [
		...(handler.reads ?? []),
		...syncPolicyReads(event.syncPolicy).map((graphNodeId) => ({ graphNodeId })),
	];
	if (
		handlerReads.some(
			(read) => !cellKinds.has(read.graphNodeId) && !computedById.has(read.graphNodeId),
		)
	)
		return;

	// Written paths per node; null once a computed re-derives as a whole.
	const affected = new Map<string, Array<ReadonlyArray<string>> | null>();
	for (const write of writes) {
		const paths = affected.get(write.graphNodeId);
		if (paths === undefined) affected.set(write.graphNodeId, [write.path]);
		else paths?.push(write.path);
	}
	const readsAffected = (entries: ReadonlyArray<Read> | undefined) =>
		(entries ?? []).some((entry) => {
			const paths = affected.get(entry.graphNodeId);
			if (paths === undefined) return false;
			if (paths === null || entry.path === undefined) return true;
			const path = entry.path;
			return paths.some((written) => startsWith(path, written) || startsWith(written, path));
		});
	for (let grew = affected.size > 0; grew;) {
		grew = false;
		for (const node of [...state.computed, ...(state.sharedSeeds ?? [])]) {
			if (affected.has(node.graphNodeId)) continue;
			if (node.dependencies !== undefined && !readsAffected(node.dependencies)) continue;
			affected.set(node.graphNodeId, null);
			grew = true;
		}
	}
	if ((state.sharedSeeds ?? []).some((seed) => affected.has(seed.graphNodeId))) return;

	const computedOrder: string[] = [];
	const visiting = new Set<string>();
	const cells = new Set<string>();
	const reach = (graphNodeId: string): boolean => {
		if (FOREIGN_GRAPH_ID.test(graphNodeId)) return false;
		const kind = cellKinds.get(graphNodeId);
		if (kind !== undefined) {
			if ((kind !== 'scalar' && kind !== 'unknown') || objectCells.has(graphNodeId))
				return false;
			cells.add(graphNodeId);
			return true;
		}
		const node = computedById.get(graphNodeId);
		if (!node || node.async !== false || !node.deriveSymbolId || !node.dependencies)
			return false;
		if (computedOrder.includes(graphNodeId)) return true;
		if (visiting.has(graphNodeId)) return false;
		visiting.add(graphNodeId);
		const derive = symbolsById.get(node.deriveSymbolId);
		if (
			derive?.kind !== 'sync-computed-derive' ||
			derive.rosterPosition ||
			derive.rosterCount ||
			FULL_CONTEXT_READ.test(input.symbolModules.get(derive.id)?.source ?? 'getElementHandle')
		)
			return false;
		if (!node.dependencies.every((dependency) => reach(dependency.graphNodeId))) return false;
		visiting.delete(graphNodeId);
		computedOrder.push(graphNodeId);
		return true;
	};
	for (const graphNodeId of [
		...writes.map((write) => write.graphNodeId),
		...handlerReads.map((read) => read.graphNodeId),
		...affected.keys(),
	])
		if (!reach(graphNodeId)) return;

	const updates: Array<RuntimeDemandMapClosurePlan['updates'][number]> = [];
	for (const update of view.domUpdates ?? []) {
		if (!readsAffected([update])) continue;
		const updateSymbol = update.symbolId ? symbolsById.get(update.symbolId) : undefined;
		if (
			!update.symbolId ||
			updateSymbol?.kind !== 'dom-update' ||
			!update.target ||
			!CLOSURE_UPDATE_TARGETS.has(update.target.kind) ||
			FULL_CONTEXT_READ.test(
				input.symbolModules.get(update.symbolId)?.source ?? 'getElementHandle',
			)
		)
			return;
		updates.push({
			hostNodeId: update.hostNodeId,
			graphNodeId: update.graphNodeId,
			path: update.path,
			symbolId: update.symbolId,
		});
	}

	// Fail closed: anything else naming a node the handler can change needs the page runtime.
	const closureIds = [...affected.keys()];
	const { cells: _cells, computed: _computed, ...stateReaders } = state;
	const { events: _events, domUpdates: _domUpdates, locators: _locators, ...viewReaders } = view;
	if (
		closureIds.some(
			(id) =>
				references(stateReaders, id) ||
				references(viewReaders, id) ||
				references(input.componentEdges, id),
		) ||
		[...cells].some((id) => references(input.componentEdges, id))
	)
		return;

	return {
		version: 1,
		kind: 'closure',
		symbolId: handler.id,
		cells: [...cells].sort(),
		computed: computedOrder.map((graphNodeId) => ({
			graphNodeId,
			deriveSymbolId: computedById.get(graphNodeId)!.deriveSymbolId!,
		})),
		updates,
	};
}

function handlerIsClosureSafe(
	handler: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
	input: ClosurePlanInput,
): boolean {
	if (handler.crossModuleInline) return false;
	if ((handler.elementHandleCalls ?? []).length > 0) return false;
	if ((handler.elementHandleReads ?? []).length > 0) return false;
	// An awaited write lands after the closure committed, on a store the page no longer reads.
	if (/^\s*async\b/.test(handler.source)) return false;
	const module = input.symbolModules.get(handler.id);
	return (
		!!module && !FULL_CONTEXT_READ.test(module.source) && !graphAccessInNestedFunction(handler)
	);
}

// The closure decodes only record-free served values; a `new` seed always serializes to records.
function objectEncodedCellIds(
	state: ProtocolStatePayload,
	bindings: ReadonlyArray<SemanticGraphBinding>,
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const cell of state.cells) {
		const value = cell.value as SerializedGraphPayload | undefined;
		if (value && value.records.length > 0) ids.add(cell.graphNodeId);
	}
	for (const binding of bindings)
		if (binding.kind === 'state' && binding.initializerSource !== undefined)
			if (initializerConstructs(binding.initializerSource)) ids.add(binding.id);
	return ids;
}

function initializerConstructs(source: string): boolean {
	let expression: JavaScriptAstNode | undefined;
	try {
		const program = parseJavaScriptModule(`(${source});`, 'initializer.ts');
		expression = ((program.body as JavaScriptAstNode[] | undefined)?.[0]?.expression ??
			undefined) as JavaScriptAstNode | undefined;
	} catch {
		return true;
	}
	while (expression && WRAPPER_EXPRESSIONS.has(expression.type ?? ''))
		expression = expression.expression as JavaScriptAstNode | undefined;
	return !expression || expression.type === 'NewExpression';
}

const WRAPPER_EXPRESSIONS: ReadonlySet<string> = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
]);

const FUNCTION_NODES: ReadonlySet<string> = new Set([
	'ArrowFunctionExpression',
	'FunctionExpression',
	'FunctionDeclaration',
]);

// A nested function touching the graph can run after commit, writing to a dead store.
function graphAccessInNestedFunction(
	handler: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
): boolean {
	const accesses = [...(handler.reads ?? []), ...(handler.writes ?? [])];
	if (accesses.length === 0) return false;
	const span = handler.sourceSpan;
	if (!span || span.end - span.start !== handler.source.length) return true;
	let root: JavaScriptAstNode | undefined;
	try {
		const program = parseJavaScriptModule(`(${handler.source});`, 'closure-handler.ts');
		root = (program.body as JavaScriptAstNode[] | undefined)?.[0]?.expression as
			| JavaScriptAstNode
			| undefined;
	} catch {
		return true;
	}
	while (root && WRAPPER_EXPRESSIONS.has(root.type ?? ''))
		root = root.expression as JavaScriptAstNode | undefined;
	if (!root || !FUNCTION_NODES.has(root.type ?? '')) return true;
	// Offsets into the snippet, which carries one leading paren.
	const nested = collectNodes(root.body, (node) => FUNCTION_NODES.has(node.type ?? ''));
	return accesses.some((access) => {
		if (!access.sourceSpan) return true;
		const offset = access.sourceSpan.start - span.start + 1;
		return nested.some((fn) => (fn.start ?? 0) <= offset && offset < (fn.end ?? 0));
	});
}

function collectNodes(
	root: unknown,
	match: (node: JavaScriptAstNode) => boolean,
): JavaScriptAstNode[] {
	const found: JavaScriptAstNode[] = [];
	const visit = (value: unknown) => {
		if (Array.isArray(value)) return value.forEach(visit);
		if (!value || typeof value !== 'object') return;
		const node = value as JavaScriptAstNode;
		if (typeof node.type === 'string' && match(node)) found.push(node);
		for (const child of Object.values(node)) visit(child);
	};
	visit(root);
	return found;
}

function syncPolicyReads(policy: unknown): string[] {
	if (!policy || typeof policy !== 'object') return [];
	const branches = Array.isArray((policy as { readonly branches?: unknown }).branches)
		? (policy as { readonly branches: ReadonlyArray<{ readonly when?: unknown }> }).branches
		: [policy as { readonly when?: unknown }];
	return branches.flatMap((branch) => conditionReads(branch.when));
}

function conditionReads(condition: unknown): string[] {
	if (!condition || typeof condition !== 'object') return [];
	const typed = condition as {
		readonly type?: unknown;
		readonly graphNodeId?: unknown;
		readonly condition?: unknown;
		readonly conditions?: ReadonlyArray<unknown>;
	};
	if (typeof typed.graphNodeId === 'string') return [typed.graphNodeId];
	if (typed.type === 'not') return conditionReads(typed.condition);
	if (Array.isArray(typed.conditions)) return typed.conditions.flatMap(conditionReads);
	return [];
}

function startsWith(path: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
	return prefix.every((part, index) => path[index] === part);
}

function references(value: unknown, id: string): boolean {
	if (value === id) return true;
	if (!value || typeof value !== 'object') return false;
	return Object.values(value).some((child) => references(child, id));
}
