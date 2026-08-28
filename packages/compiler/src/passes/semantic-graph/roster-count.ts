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
 * assignment, a composite, an arm test - because nothing downstream knows to
 * resolve the second binding it publishes.
 *
 * A bare read handed to a child component as a named prop is neither: the prop
 * carries the placeholder itself, so the child's own markup is judged by the
 * same rule under the name the child gave it. That is what makes `{total}` in
 * the child legal and `{total - 1}` there answerable rather than silently wrong.
 *
 * Handler bodies are untouched: by the time one runs the count is a number.
 */
function deferredAndRefusedCountSpends(
	state: WalkState,
	records: ReadonlyArray<SemanticElementRosterCount>,
): ReadonlyMap<SemanticElementRosterCount, SemanticElementRosterCount['deferred']> {
	const semantic = state.semantic();
	const scopes = new Map<string, CountScope>();
	// One scope per component, so an expression spending two counts is rewritten
	// once with both of them replaced rather than twice from the same original.
	for (const record of records) {
		const component = componentFunction(state, record.componentName);
		const declared = component ? countDeclarationId(component, record.computedName) : null;
		if (!component || typeof declared?.start !== 'number') continue;
		const symbolId = declaredSymbolAt(semantic, declared.start);
		if (symbolId === null) continue;
		holdCount(scopes, record.componentName, component, symbolId, record, declared);
	}

	// Routing is a fixpoint over BARE prop passes only, run to completion before
	// anything is emitted: a component reached from two parents is judged once,
	// with every count that arrives at it in hand.
	for (let round = 0; round < scopes.size + 1; round += 1) {
		// Collected before any is applied: filing a route grows `scopes`, and a walk
		// that iterated it live would judge a component mid-way through learning
		// which counts reach it.
		const routes: Array<{
			readonly target: PropTarget;
			readonly record: SemanticElementRosterCount;
		}> = [];
		for (const scope of scopes.values())
			for (const route of walkCountScope(state, semantic, scope).routes) routes.push(route);
		let grew = false;
		for (const route of routes) {
			const child = componentFunction(state, route.target.childComponentName);
			const declared = child ? propBindingId(child, route.target.propName) : null;
			if (!child || typeof declared?.start !== 'number') continue;
			const symbolId = declaredSymbolAt(semantic, declared.start);
			if (symbolId === null) continue;
			grew =
				holdCount(
					scopes,
					route.target.childComponentName,
					child,
					symbolId,
					route.record,
					declared,
				) || grew;
		}
		if (!grew) break;
	}

	const answers = new Map<SemanticElementRosterCount, DeferredExpression[]>();
	for (const scope of scopes.values()) {
		const found = walkCountScope(state, semantic, scope);
		for (const refusal of found.refusals) state.graph.diagnostics.push(refusal);
		for (const [printed, reads] of found.deferred) {
			const entry = deferredExpression(state.source, printed, reads, scope.componentName);
			if (!entry) continue;
			for (const record of new Set(reads.map((one) => one.record)))
				answers.set(record, [...(answers.get(record) ?? []), entry]);
		}
	}
	return answers;
}

type CountScope = {
	readonly componentName: string;
	readonly component: AnyNode;
	/** The local binding, by symbol, that holds a count inside this component. */
	readonly bySymbol: Map<number, SemanticElementRosterCount>;
	readonly declarations: Set<AnyNode>;
};

/** Files "this component's local holds that count", answering whether it is new. */
function holdCount(
	scopes: Map<string, CountScope>,
	componentName: string,
	component: AnyNode,
	symbolId: number,
	record: SemanticElementRosterCount,
	declared: AnyNode,
): boolean {
	const scope = scopes.get(componentName) ?? {
		componentName,
		component,
		bySymbol: new Map<number, SemanticElementRosterCount>(),
		declarations: new Set<AnyNode>(),
	};
	scopes.set(componentName, scope);
	if (scope.bySymbol.has(symbolId)) return false;
	scope.bySymbol.set(symbolId, record);
	scope.declarations.add(declared);
	return true;
}

type CountRead = { readonly read: AnyNode; readonly record: SemanticElementRosterCount };

type ScopeFindings = {
	readonly deferred: ReadonlyMap<AnyNode, ReadonlyArray<CountRead>>;
	readonly refusals: ReadonlyArray<ReturnType<typeof rosterCountSpentDiagnostic>>;
	readonly routes: ReadonlyArray<{
		readonly target: PropTarget;
		readonly record: SemanticElementRosterCount;
	}>;
};

/** Every count read in one component, sorted into deferrals, refusals and routes. */
function walkCountScope(
	state: WalkState,
	semantic: ReturnType<WalkState['semantic']>,
	scope: CountScope,
): ScopeFindings {
	const deferred = new Map<AnyNode, CountRead[]>();
	const refusals: Array<ReturnType<typeof rosterCountSpentDiagnostic>> = [];
	const routes: Array<{ target: PropTarget; record: SemanticElementRosterCount }> = [];
	const seen = new Set<AnyNode>();
	const visit = (node: AnyNode, ancestors: ReadonlyArray<AnyNode>): void => {
		if (seen.has(node)) return;
		seen.add(node);
		const localName = node.type === 'Identifier' ? getIdentifierName(node) : undefined;
		if (localName && !scope.declarations.has(node) && typeof node.start === 'number') {
			const record = scope.bySymbol.get(resolvedSymbolAt(semantic, node.start) ?? -1);
			if (record) {
				const verdict = renderTime(ancestors) ? spentAt(node, ancestors) : null;
				if (verdict?.kind === 'defer')
					deferred.set(verdict.printed, [
						...(deferred.get(verdict.printed) ?? []),
						{ read: node, record },
					]);
				else if (verdict?.kind === 'route') routes.push({ target: verdict.target, record });
				else if (verdict?.kind === 'refuse')
					refusals.push(
						rosterCountSpentDiagnostic({
							computedName: localName,
							componentName: scope.componentName,
							operation: verdict.operation,
							source: expressionSource(verdict.node, state.source) ?? localName,
							...(record.componentName === scope.componentName
								? {}
								: { heldBy: record.computedName, derivedIn: record.componentName }),
							...(sourceSpan(verdict.node, state.filename)
								? { span: sourceSpan(verdict.node, state.filename)! }
								: {}),
						}),
					);
				return;
			}
		}
		const chain = [...ancestors, node];
		for (const child of markupChildNodes(node)) visit(child, chain);
	};
	visit(scope.component, []);
	return { deferred, refusals, routes };
}

type DeferredExpression = NonNullable<SemanticElementRosterCount['deferred']>[number];

/**
 * The printed expression as the render data names it, beside the same
 * expression with every count read replaced by a call the resolver binds. The
 * call takes the read's OWN name: a count that arrived through a prop is spelled
 * by the child's parameter, and the placeholder it holds is the same value.
 */
function deferredExpression(
	source: string,
	printed: AnyNode,
	reads: ReadonlyArray<CountRead>,
	componentName: string,
): DeferredExpression | null {
	const start = printed.start;
	const end = printed.end;
	if (typeof start !== 'number' || typeof end !== 'number') return null;
	const raw = source.slice(start, end);
	let thunk = raw;
	for (const one of [...reads].sort((left, right) => (right.read.start ?? 0) - (left.read.start ?? 0))) {
		if (typeof one.read.start !== 'number' || typeof one.read.end !== 'number') return null;
		const name = getIdentifierName(one.read);
		if (!name) return null;
		thunk =
			thunk.slice(0, one.read.start - start) +
			`${COUNT_VALUE_PARAMETER}(${name})` +
			thunk.slice(one.read.end - start);
	}
	const routed = reads.some((one) => one.record.componentName !== componentName);
	return {
		source: raw.trim(),
		thunkSource: thunk.trim(),
		...(routed ? { componentName } : {}),
	};
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

type PropTarget = { readonly childComponentName: string; readonly propName: string };

type Verdict =
	| { readonly kind: 'print' }
	| { readonly kind: 'route'; readonly target: PropTarget }
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
			if (!innermost) {
				// Only a BARE pass routes: a template slot would hand the child a
				// string with the placeholder buried in it, which reads as text and
				// not as a number.
				const target = child === read ? componentPropTarget(ancestors, at) : null;
				return target ? { kind: 'route', target } : { kind: 'print' };
			}
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
	return componentElementName(node) !== null;
}

function componentElementName(node: AnyNode): string | null {
	if (node.type !== 'JSXElement') return null;
	const name = getIdentifierName(
		(node.openingElement as AnyNode | undefined)?.name as AnyNode | undefined,
	);
	return name && /^[A-Z]/.test(name) ? name : null;
}

/**
 * The child component and prop name a printed position hands the value to, when
 * that is what it is. A `{children}` projection is not one: it carries no name
 * the child's signature can take the count out under.
 */
function componentPropTarget(ancestors: ReadonlyArray<AnyNode>, at: number): PropTarget | null {
	const holder = ancestors[at - 1];
	if (holder?.type !== 'JSXAttribute') return null;
	const element = ancestors[at - 2];
	const childComponentName = element ? componentElementName(element) : null;
	const propName = getIdentifierName(holder.name as AnyNode | undefined);
	return childComponentName && propName ? { childComponentName, propName } : null;
}

/**
 * The local a component's signature takes one prop out under. Only a plain
 * destructured name, with or without a default: a rest binding or a nested
 * pattern reaches the value through a shape this walk does not follow, and a
 * count arriving that way stays unrouted rather than routed wrongly.
 */
function propBindingId(component: AnyNode, propName: string): AnyNode | null {
	const parameter = asNodes(component.params)[0];
	if (parameter?.type !== 'ObjectPattern') return null;
	for (const property of asNodes(parameter.properties)) {
		if (property.type !== 'Property' || property.computed === true) continue;
		if (getIdentifierName(property.key as AnyNode | undefined) !== propName) continue;
		const value = property.value as AnyNode | undefined;
		const local = value?.type === 'AssignmentPattern' ? (value.left as AnyNode) : value;
		return local?.type === 'Identifier' ? local : null;
	}
	return null;
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
