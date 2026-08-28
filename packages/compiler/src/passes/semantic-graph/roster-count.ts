import type { SemanticElementRosterCount } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import { getComponentFunction } from '../../ast/tsrx.ts';
import { pendingDeriveOwner } from './collect-async.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { rosterCountSpentDiagnostic } from './diagnostics.ts';
import { deriveQueryExpression, replaceDependencies } from './roster-position.ts';
import { ownedModuleAst } from './shared-ast.ts';
import type { WalkState } from './types.ts';

/**
 * The second derive-time element() handle read the compiler answers instead of
 * refusing: how many parts the family instance has.
 *
 * It is the same question as the position — render order, which the framework
 * knows on both sides — so it is answerable for the same reason. It needs no
 * member handle and no proof of membership, so the root or any part may ask.
 *
 * Admitted only for the exact question. The derive body is `roster.length` and
 * nothing else, and the roster is a plural handle off a shared() instance.
 * Anything looser stays refused by `elementHandleDeriveReadDiagnostic`.
 */
export function collectElementRosterCounts(state: WalkState): void {
	const graph = state.graph;
	const records: SemanticElementRosterCount[] = [];

	for (const pending of state.pendingComputedDependencies) {
		const owner = pendingDeriveOwner(pending, state);
		if (!owner || owner.kind !== 'computed' || owner.async === true) continue;
		const componentName = owner.componentName;
		if (!componentName || owner.sharedDefinitionId !== undefined) continue;
		const query = countQueryExpression(pending.body);
		if (!query) continue;

		const rosterSource = expressionSource(query.roster, state.source);
		if (!rosterSource) continue;

		const dependencies = owner.dependencies ?? [];
		if (dependencies.length !== 1) continue;
		const rosterDependency = dependencies[0]!;
		if (rosterDependency.source !== `${rosterSource}.length`) continue;
		if (rosterDependency.path.length !== 1 || rosterDependency.path[0] !== 'length') continue;

		const roster = graph.graphBindings.find(
			(binding) =>
				binding.id === rosterDependency.graphNodeId &&
				binding.kind === 'element' &&
				binding.plural === true &&
				binding.sharedDefinitionId !== undefined,
		);
		if (!roster) continue;

		const span = sourceSpan(query.node, state.filename);
		records.push({
			computedGraphNodeId: owner.id,
			computedName: owner.name,
			componentName,
			rosterGraphNodeId: roster.id,
			rosterSource,
			source: expressionSource(query.node, state.source) ?? '',
			...(span ? { sourceSpan: span } : {}),
		});
		// `.length` leaves the path: the lowered call answers the count, and the
		// node a runtime invalidates on is the roster itself.
		replaceDependencies(graph.graphBindings, owner, [
			{ ...rosterDependency, source: rosterSource, path: [] },
		]);
	}

	if (records.length === 0) return;
	const deferred = deferredAndRefusedCountSpends(state, records);
	graph.elementRosterCounts = records.map((record) => {
		const entries = deferred.get(record) ?? [];
		return entries.length > 0 ? { ...record, deferred: entries } : record;
	});
}

/**
 * The count is exact when it is PRINTED, and at render time it is a placeholder
 * the page resolves after composition - so an expression that SPENDS it is only
 * answerable if the render can hand the whole expression over unevaluated.
 *
 * A spend a markup text or attribute slot prints is DEFERRED: the slot emits a
 * thunk, the resolver calls it once the counts are facts, and the count read
 * inside it is lowered to a call rather than left on the captured const, which
 * cannot be rebound. Everything else in a render position is refused by name -
 * a second computed deriving off it, a local the render carries forward, an
 * assignment, a composite, a child component's prop, an arm test - because
 * nothing downstream knows to resolve the second binding it publishes.
 *
 * Handler bodies are untouched: by the time one runs the count is a number.
 */
function deferredAndRefusedCountSpends(
	state: WalkState,
	records: ReadonlyArray<SemanticElementRosterCount>,
): ReadonlyMap<SemanticElementRosterCount, SemanticElementRosterCount['deferred']> {
	const semantic = state.semantic();
	const answers = new Map<SemanticElementRosterCount, DeferredExpression[]>();
	// One walk per component, so an expression spending two counts is rewritten
	// once with both of them replaced rather than twice from the same original.
	for (const componentName of new Set(records.map((record) => record.componentName))) {
		const component = componentFunction(state, componentName);
		if (!component) continue;
		const bySymbol = new Map<number, SemanticElementRosterCount>();
		const declarations = new Set<AnyNode>();
		for (const record of records) {
			if (record.componentName !== componentName) continue;
			const declared = countDeclarationId(component, record.computedName);
			if (typeof declared?.start !== 'number') continue;
			const symbolId = declaredSymbolAt(semantic, declared.start);
			if (symbolId === null) continue;
			bySymbol.set(symbolId, record);
			declarations.add(declared);
		}
		if (bySymbol.size === 0) continue;

		const deferred = new Map<
			AnyNode,
			Array<{ readonly read: AnyNode; readonly record: SemanticElementRosterCount }>
		>();
		const seen = new Set<AnyNode>();
		const visit = (node: AnyNode, ancestors: ReadonlyArray<AnyNode>): void => {
			if (seen.has(node)) return;
			seen.add(node);
			if (node.type === 'Identifier' && !declarations.has(node) && typeof node.start === 'number') {
				const record = bySymbol.get(resolvedSymbolAt(semantic, node.start) ?? -1);
				if (!record || getIdentifierName(node) !== record.computedName) {
					const chain = [...ancestors, node];
					for (const child of markupChildNodes(node)) visit(child, chain);
					return;
				}
				const verdict = renderTime(ancestors) ? spentAt(node, ancestors) : null;
				if (verdict?.kind === 'defer') {
					deferred.set(verdict.printed, [
						...(deferred.get(verdict.printed) ?? []),
						{ read: node, record },
					]);
				} else if (verdict?.kind === 'refuse') {
					state.graph.diagnostics.push(
						rosterCountSpentDiagnostic({
							computedName: record.computedName,
							componentName,
							operation: verdict.operation,
							source: expressionSource(verdict.node, state.source) ?? record.computedName,
							...(sourceSpan(verdict.node, state.filename)
								? { span: sourceSpan(verdict.node, state.filename)! }
								: {}),
						}),
					);
				}
				return;
			}
			const chain = [...ancestors, node];
			for (const child of markupChildNodes(node)) visit(child, chain);
		};
		visit(component, []);

		for (const [printed, reads] of deferred) {
			const entry = deferredExpression(state.source, printed, reads);
			if (!entry) continue;
			for (const record of new Set(reads.map((one) => one.record)))
				answers.set(record, [...(answers.get(record) ?? []), entry]);
		}
	}
	return answers;
}

type DeferredExpression = { readonly source: string; readonly thunkSource: string };

/**
 * The printed expression as the render data names it, beside the same
 * expression with every count read replaced by a call the resolver binds.
 */
function deferredExpression(
	source: string,
	printed: AnyNode,
	reads: ReadonlyArray<{ readonly read: AnyNode; readonly record: SemanticElementRosterCount }>,
): DeferredExpression | null {
	const start = printed.start;
	const end = printed.end;
	if (typeof start !== 'number' || typeof end !== 'number') return null;
	const raw = source.slice(start, end);
	let thunk = raw;
	for (const one of [...reads].sort((left, right) => (right.read.start ?? 0) - (left.read.start ?? 0))) {
		if (typeof one.read.start !== 'number' || typeof one.read.end !== 'number') return null;
		thunk =
			thunk.slice(0, one.read.start - start) +
			`${COUNT_VALUE_PARAMETER}(${one.record.computedName})` +
			thunk.slice(one.read.end - start);
	}
	return { source: raw.trim(), thunkSource: thunk.trim() };
}

/** The one name both regimes bind the resolved count reader to inside a thunk. */
export const COUNT_VALUE_PARAMETER = 'marklessCountValue';

// The shared walk skips `openingElement`, so an attribute expression is only
// reachable through it - and an attribute is where a count is usually spent.
function markupChildNodes(node: AnyNode): AnyNode[] {
	const opening = node.openingElement as AnyNode | undefined;
	return opening ? [...childNodes(node), ...childNodes(opening)] : childNodes(node);
}

type Spend = { readonly node: AnyNode; readonly operation: string };

type Verdict =
	| { readonly kind: 'print' }
	| { readonly kind: 'defer'; readonly printed: AnyNode }
	| ({ readonly kind: 'refuse' } & Spend);

/**
 * Whether the render itself performs this read. A read the render never
 * performs is not a spend: by the time a handler runs, the count is a number in
 * the graph, and every arithmetic it does there is right. So the question is
 * settled by the nearest enclosing function, before any operation is judged -
 * `w.count = total` inside an onClick must not read as an assignment spend.
 */
function renderTime(ancestors: ReadonlyArray<AnyNode>): boolean {
	// `ancestors[0]` is the component itself, which may be written as an arrow.
	for (let at = ancestors.length - 1; at >= 1; at -= 1) {
		const node = ancestors[at]!;
		if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') continue;
		return isDeriveFunction(ancestors[at - 1], node);
	}
	return true;
}

/**
 * Walks out from the read until something decides how the value is used. A
 * template literal slot is transparent - the count is stringified into the text
 * either way - so the walk steps through it and judges what holds the template.
 *
 * It keeps walking through the operations a thunk can carry, remembering the
 * INNERMOST one, because that is the operation an author has to move if the
 * walk ends somewhere a thunk cannot reach. Reaching a markup text or attribute
 * slot with an operation behind it is the deferrable shape.
 *
 * A read the render never performs is not a spend: by the time a handler runs,
 * the count is a number in the graph. So the walk stops at the nearest function
 * that is not a derive, and says nothing.
 */
function spentAt(read: AnyNode, ancestors: ReadonlyArray<AnyNode>): Verdict | null {
	let child = read;
	let innermost: Spend | null = null;
	for (let at = ancestors.length - 1; at >= 0; at -= 1) {
		const parent = ancestors[at]!;
		if (parent.type === 'TemplateLiteral' && asNodes(parent.expressions).includes(child)) {
			child = parent;
			continue;
		}
		if (isPrintedPosition(parent, child)) {
			if (!innermost) return { kind: 'print' };
			return printsMarkupValue(ancestors, at)
				? { kind: 'defer', printed: child }
				: { kind: 'refuse', ...innermost };
		}
		if (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
			// A derive is the one function the render runs, and the value it
			// publishes is a second binding holding the placeholder.
			if (!isDeriveFunction(ancestors[at - 1], parent)) return null;
			// The innermost operation is still the one the author has to move; a
			// derive that only FORWARDS the count has no other, and is named itself.
			return innermost
				? { kind: 'refuse', ...innermost }
				: { kind: 'refuse', node: parent, operation: 'a derivation of the count' };
		}
		// Statement scaffolding inside a derive body carries the value out unchanged.
		if (parent.type === 'ReturnStatement' || parent.type === 'BlockStatement') {
			child = parent;
			continue;
		}
		const operation = operationName(parent, child);
		if (!operation) return innermost ? { kind: 'refuse', ...innermost } : null;
		if (!innermost) innermost = { node: parent, operation };
		if (!thunkable(parent, child)) return { kind: 'refuse', ...innermost };
		child = parent;
	}
	return innermost ? { kind: 'refuse', ...innermost } : null;
}

/** Whether a thunk called after the page composed can still carry this value out. */
function thunkable(parent: AnyNode, child: AnyNode): boolean {
	switch (parent.type) {
		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'UnaryExpression':
		case 'ConditionalExpression':
			return true;
		case 'MemberExpression':
			return parent.object === child;
		case 'CallExpression':
			return parent.callee !== child;
		default:
			// An assignment, an update, a composite and a carried local all publish
			// the value somewhere the resolver has no token to find it in.
			return false;
	}
}

// A markup slot: the value the renderer prints, verbatim, wherever it stands.
function isPrintedPosition(parent: AnyNode, child: AnyNode): boolean {
	if (parent.type === 'JSXExpressionContainer' || parent.type === 'TSRXExpression')
		return parent.expression === child;
	// The block-with-one-expression form a bare arm interpolation parses as.
	if (parent.type === 'ExpressionStatement') return parent.expression === child;
	return false;
}

/**
 * Whether the printed position is one the renderer prints as TEXT or as a host
 * attribute - the two slots a deferred token can stand in until the resolver
 * splices it. A child component's prop is not one: the token would cross into
 * another module's render as a string nobody there knows to resolve.
 */
function printsMarkupValue(ancestors: ReadonlyArray<AnyNode>, at: number): boolean {
	const holder = ancestors[at - 1];
	if (!holder) return true;
	if (holder.type !== 'JSXAttribute') return !isComponentElement(holder);
	const element = ancestors[at - 2];
	return !element || !isComponentElement(element);
}

function isComponentElement(node: AnyNode): boolean {
	if (node.type !== 'JSXElement') return false;
	const name = getIdentifierName(
		(node.openingElement as AnyNode | undefined)?.name as AnyNode | undefined,
	);
	return !!name && /^[A-Z]/.test(name);
}

function isDeriveFunction(grandparent: AnyNode | undefined, fn: AnyNode): boolean {
	if (grandparent?.type !== 'CallExpression') return false;
	if (!asNodes(grandparent.arguments).includes(fn)) return false;
	return getIdentifierName(grandparent.callee as AnyNode | undefined) === 'computed';
}

/** The operation, in the words the author wrote it in. */
function operationName(parent: AnyNode, child: AnyNode): string | null {
	switch (parent.type) {
		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'AssignmentExpression':
			return `a "${String(parent.operator)}" operation`;
		case 'UnaryExpression':
		case 'UpdateExpression':
			return `a "${String(parent.operator)}" operation`;
		case 'ConditionalExpression':
			return parent.test === child ? 'a condition' : 'a branch of a conditional';
		case 'MemberExpression':
			return parent.object === child ? 'a property read' : null;
		case 'CallExpression':
		case 'NewExpression':
			return parent.callee === child ? 'a call' : 'a call argument';
		case 'ArrayExpression':
		case 'ObjectExpression':
		case 'Property':
		case 'SpreadElement':
			return 'a composite value';
		case 'VariableDeclarator':
			return parent.init === child ? 'a local the render carries forward' : null;
		default:
			return null;
	}
}

function componentFunction(state: WalkState, componentName: string): AnyNode | null {
	const ast = ownedModuleAst(state, state.source, state.filename);
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (component?.name === componentName) return component.node;
	}
	return null;
}

/** The `const <name> = computed(...)` declarator id inside the component body. */
function countDeclarationId(component: AnyNode, computedName: string): AnyNode | null {
	let found: AnyNode | null = null;
	const visit = (node: AnyNode): void => {
		if (found) return;
		if (node.type === 'VariableDeclarator') {
			const id = node.id as AnyNode | undefined;
			if (id && getIdentifierName(id) === computedName) {
				found = id;
				return;
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(component);
	return found;
}

/** The binding a declaration site introduces, found by where its name starts. */
function declaredSymbolAt(
	semantic: ReturnType<WalkState['semantic']>,
	offset: number,
): number | null {
	for (let symbolId = 0; symbolId < semantic.symbol.count; symbolId += 1) {
		for (let declIndex = 0; declIndex < semantic.symbol.declCount(symbolId); declIndex += 1) {
			if (semantic.symbol.declNode(symbolId, declIndex).start === offset) return symbolId;
		}
	}
	return null;
}

type CountQuery = {
	readonly node: AnyNode;
	readonly roster: AnyNode;
};

/** `() => roster.length`, with nothing else in the body. */
function countQueryExpression(body: AnyNode | undefined): CountQuery | null {
	const node = deriveQueryExpression(body);
	if (node?.type !== 'MemberExpression') return null;
	if (node.computed === true || node.optional === true) return null;
	if (getIdentifierName(node.property as AnyNode | undefined) !== 'length') return null;

	const roster = node.object as AnyNode | undefined;
	if (roster?.type !== 'Identifier' && roster?.type !== 'MemberExpression') return null;
	return { node, roster };
}
