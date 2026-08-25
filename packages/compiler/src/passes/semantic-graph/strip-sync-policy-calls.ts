import { childNodes, type AnyNode } from '../../ast/nodes.ts';
import { parseJavaScriptModule } from '../../js-ast.ts';
import type {
	PlannedSymbol,
	SemanticGraphArtifact,
	SemanticSyncPolicy,
	SemanticSyncPolicyAction,
} from '../../artifacts.ts';
import { extractedSyncPolicyActionCalls } from './collect-sync-policy.ts';

/**
 * Rewrites event-handler symbol sources so the calls the eager sync policy
 * already runs are not run a second time in the lazy handler, and drops the
 * symbol entirely when the policy subsumed the whole body.
 *
 * Runs on the planned symbol list in place, before any pass reads it.
 */
export function stripExtractedSyncPolicyCalls(
	symbols: ReadonlyArray<PlannedSymbol>,
	semanticGraph: SemanticGraphArtifact,
): void {
	const elided = new Set<PlannedSymbol>();
	for (const event of semanticGraph.events) {
		if (!event.syncPolicy) continue;
		const actions = syncPolicyActionSet(event.syncPolicy);
		if (actions.size === 0) continue;
		for (const symbol of symbols) {
			if (
				symbol.kind !== 'event-handler' ||
				symbol.hostNodeId !== event.hostNodeId ||
				symbol.eventName !== event.eventName
			)
				continue;
			const residual = residualHandlerSource(
				symbol.source,
				symbol.parameters[0] ?? 'event',
				actions,
				semanticGraph,
			);
			if (residual.elide) {
				elided.add(symbol);
				continue;
			}
			if (residual.source !== symbol.source)
				(symbol as { source: string }).source = residual.source;
		}
	}
	if (elided.size === 0) return;
	const list = symbols as Array<PlannedSymbol>;
	for (let index = list.length - 1; index >= 0; index--)
		if (elided.has(list[index]!)) list.splice(index, 1);
	compactHandlerOrder(list);
}

/**
 * One element's handler list is read back as a dense array indexed by `order`,
 * so dropping a handler out of the middle has to close the gap it left.
 */
function compactHandlerOrder(symbols: Array<PlannedSymbol>): void {
	const groups = new Map<string, Array<PlannedEventHandler>>();
	for (const symbol of symbols) {
		if (symbol.kind !== 'event-handler') continue;
		const key = `${symbol.hostNodeId}:${symbol.eventName}`;
		const group = groups.get(key) ?? [];
		group.push(symbol);
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		group.sort((left, right) => left.order - right.order);
		group.forEach((symbol, order) => {
			if (symbol.order !== order) (symbol as { order: number }).order = order;
		});
	}
}

function syncPolicyActionSet(policy: SemanticSyncPolicy): ReadonlySet<SemanticSyncPolicyAction> {
	const actions = new Set<SemanticSyncPolicyAction>();
	const branches = 'branches' in policy ? policy.branches : [policy];
	for (const branch of branches) for (const action of branch.actions) actions.add(action);
	return actions;
}

type PlannedEventHandler = Extract<PlannedSymbol, { readonly kind: 'event-handler' }>;

type ResidualHandler = { readonly source: string; readonly elide: boolean };

type SourceEdit = { readonly start: number; readonly end: number; readonly text: string };

function residualHandlerSource(
	source: string,
	eventParam: string,
	actions: ReadonlySet<SemanticSyncPolicyAction>,
	semanticGraph: SemanticGraphArtifact,
): ResidualHandler {
	const prefix = 'const __marklessHandler = ';
	const wrappedSource = `${prefix}${source};`;
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(wrappedSource, 'markless-handler.js') as AnyNode;
	} catch {
		return { source, elide: false };
	}
	const parents = new Map<AnyNode, AnyNode>();
	let handler: AnyNode | undefined;
	const visit = (node: AnyNode): void => {
		if (
			!handler &&
			(node.type === 'ArrowFunctionExpression' ||
				node.type === 'FunctionExpression' ||
				node.type === 'FunctionDeclaration')
		)
			handler = node;
		for (const child of childNodes(node)) {
			parents.set(child, node);
			visit(child);
		}
	};
	visit(ast);
	const body = handler?.body as AnyNode | undefined;
	const extracted = new Set(
		extractedSyncPolicyActionCalls(body, eventParam, actions, {
			graph: semanticGraph as never,
			source: wrappedSource,
		}),
	);
	if (extracted.size === 0) return { source, elide: false };
	if (body && residualIsNoOp(body, extracted)) return { source, elide: true };

	const edits: Array<SourceEdit> = [];
	for (const node of extracted) {
		const parent = parents.get(node);
		const grandparent = parent ? parents.get(parent) : undefined;
		const removable = removableCallSpan(
			source,
			(node.start ?? 0) - prefix.length,
			(node.end ?? 0) - prefix.length,
		);
		if (removable.length === 0) continue;
		// A call that is the entire body of an `if`/loop cannot be deleted outright;
		// the residual would parse as a header with no statement after it.
		const bare =
			parent?.type === 'ExpressionStatement' &&
			grandparent !== undefined &&
			grandparent.type !== 'BlockStatement' &&
			grandparent.type !== 'Program' &&
			grandparent.type !== 'StaticBlock';
		for (const span of removable) edits.push({ ...span, text: bare ? ';' : '' });
	}
	edits.sort((left, right) => right.start - left.start);
	let stripped = source;
	for (const edit of edits)
		stripped = stripped.slice(0, edit.start) + edit.text + stripped.slice(edit.end);

	return { source: stripped, elide: false };
}

/** True when every statement the residual would keep is an extracted policy call. */
function residualIsNoOp(node: AnyNode, extracted: ReadonlySet<AnyNode>): boolean {
	if (extracted.has(node)) return true;
	if (node.type === 'EmptyStatement') return true;
	if (node.type === 'ExpressionStatement') {
		const expression = node.expression as AnyNode | undefined;
		return !!expression && extracted.has(expression);
	}
	if (node.type === 'BlockStatement') {
		const statements = (node.body as Array<AnyNode> | undefined) ?? [];
		return statements.every((statement) => residualIsNoOp(statement, extracted));
	}
	// A lifted policy's guard is limited to graph/event/prop/constant reads, so an
	// `if` whose arms are all policy calls leaves nothing for the lazy handler.
	if (node.type === 'IfStatement') {
		const consequent = node.consequent as AnyNode | undefined;
		const alternate = node.alternate as AnyNode | undefined;
		if (!consequent || !residualIsNoOp(consequent, extracted)) return false;
		return !alternate || residualIsNoOp(alternate, extracted);
	}
	return false;
}

function removableCallSpan(
	source: string,
	start: number,
	end: number,
): Array<{ readonly start: number; readonly end: number }> {
	if (start < 0 || end <= start || end > source.length) return [];
	let removeEnd = end;
	while (source[removeEnd] === ' ' || source[removeEnd] === '\t') removeEnd++;
	if (source[removeEnd] === ';') removeEnd++;
	const lineStart = source.lastIndexOf('\n', start - 1) + 1;
	if (/^[\t ]*$/.test(source.slice(lineStart, start)) && source[removeEnd] === '\n') {
		return [{ start: lineStart, end: removeEnd + 1 }];
	}
	return [{ start, end: removeEnd }];
}
