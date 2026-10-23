import { asNodes, childNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	uniqueBy,
} from '../../artifact-helpers/graph-paths.ts';
import type {
	SemanticGraphDiagnostic,
	SemanticSyncPolicy,
	SemanticSyncPolicyAction,
	SemanticSyncPolicyBranch,
	SemanticSyncPolicyCondition,
	SourceSpan,
} from '../../artifacts.ts';
import type { WalkState } from './types.ts';

// Lives here rather than beside the element walk because a browser-critical
// policy can also arrive as a callback PROP a part spreads onto its own
// element, and that edge is collected in collect-components.
export function unextractableSyncPolicyDiagnostic(
	attributeName: string,
	value: AnyNode | undefined,
	handlers: ReadonlyArray<AnyNode>,
	state: Pick<WalkState, 'filename' | 'source'>,
): SemanticGraphDiagnostic {
	const detached = firstDetachedSyncPolicyReference({
		type: 'ArrayExpression',
		elements: handlers,
	} as AnyNode);
	if (detached) {
		const source = state.source.slice(detached.start, detached.end).trim();
		return {
			code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
			severity: 'error',
			phase: 'sync-policy',
			title: 'Cannot extract synchronous event policy',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			message: `\`${source}\` detaches ${detached.action} from the event, so the compiler cannot prove when the default action is cancelled for ${attributeName}.`,
			why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load; a detached reference hides which action runs and under what condition.',
			primarySpan: { filename: state.filename, start: detached.start, end: detached.end },
			suggestions: [
				{
					message: `Call it directly on the event parameter instead of detaching ${detached.action}.`,
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
		};
	}

	const shadowed = handlers.map((handler) => shadowedSyncPolicyCall(handler)).find(Boolean);
	if (shadowed) return secondSyncPolicyCancelDiagnostic(attributeName, shadowed, state);

	const actionCall =
		handlers.map((handler) => firstSyncPolicyActionCall(handler)).find(Boolean) ??
		firstSyncPolicyActionCall(value);
	const actionLabel = actionCall?.action ?? 'preventDefault/stopPropagation';

	return {
		code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
		severity: 'error',
		phase: 'sync-policy',
		title: 'Cannot extract synchronous event policy',
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		message: `Cannot extract a synchronous ${actionLabel} policy for ${attributeName} because the guard is not limited to graph state, event fields, props, and constants.`,
		why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.',
		primarySpan:
			(actionCall ? sourceSpan(actionCall.node, state.filename) : undefined) ??
			(value ? sourceSpan(value, state.filename) : undefined) ??
			fallbackSpan(state.filename),
		suggestions: [
			{
				message:
					"Write the guard from event fields compared with literals (`event.key === 'Enter'`), modifier flags (`event.metaKey`), state, props and module constants, joined with &&, || and !: either `if (event.key === 'Enter' && !busy) event.preventDefault()` or an early `if (event.key !== 'Enter') return;` before an unconditional `event.preventDefault()`. A condition that reads the DOM (such as `event.target.closest('a')`) cannot run before the handler loads; keep what it decides in state, or remove the cancel from the lazy handler.",
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	};
}

export type StraySyncPolicyCall = {
	readonly action: SemanticSyncPolicyAction;
	readonly node: AnyNode;
	readonly eventParam: string;
	readonly reason: SyncPolicyRefusal;
};

// A cancel the policy does not run waits for the lazy symbol and never reaches
// the event, so it is refused rather than left silently inert.
export function secondSyncPolicyCancelDiagnostic(
	attributeName: string,
	stray: StraySyncPolicyCall,
	state: Pick<WalkState, 'filename'>,
): SemanticGraphDiagnostic {
	const call = `${stray.eventParam}.${stray.action}()`;
	const reasons: Record<SyncPolicyRefusal, { readonly message: string; readonly fix: string }> = {
		'unextractable-guard': {
			message: `This ${stray.action}() for ${attributeName} is guarded by a condition that is not limited to event fields, state, props and constants, so it cannot join the cancels that run before the handler loads, and it would never reach the event.`,
			fix: `Write its guard from event fields compared with literals, modifier flags, state, props and module constants joined with &&, || and !, e.g. \`if (${stray.eventParam}.key === 'ArrowDown') ${call}\`. Keep anything else the guard decides in state.`,
		},
		'guard-reads-written-state': {
			message: `This ${stray.action}() for ${attributeName} is guarded by state that an earlier statement in the handler can change, and the cancels run before the handler does, so the guard would be read before that change.`,
			fix: `Guard it with event fields only (\`if (${stray.eventParam}.key === 'ArrowUp') ${call}\`), or move it above the statement that changes the state.`,
		},
		'shadowed-event-name': {
			message: `This ${stray.action}() for ${attributeName} is called on a \`${stray.eventParam}\` that a nested function, block or catch declares again, so the compiler cannot tell whether it is the event, and a cancel that is would run after the event has finished.`,
			fix: `Rename the inner \`${stray.eventParam}\` so it no longer shares the event parameter's name, or cancel the event itself in a top-level statement, \`if (condition) ${call}\`.`,
		},
		'not-a-guard': {
			message: `This ${stray.action}() for ${attributeName} is not the body of a top-level \`if\` in the handler (it sits in a loop, switch, try, nested function or after other code decides whether it runs), so it cannot run before the handler loads, and it would never reach the event.`,
			fix: `Move it to its own top-level statement, \`if (condition) ${call}\`, with a condition built from event fields, state, props and constants.`,
		},
	};
	const reason = reasons[stray.reason];
	return {
		code: 'MARKLESS_SYNC_POLICY_SECOND_CANCEL',
		severity: 'error',
		phase: 'sync-policy',
		title: 'This cancel cannot run before the handler loads',
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		message: reason.message,
		why: 'preventDefault() and stopPropagation() take effect only while the event is dispatching. Each top-level `if (...) event.preventDefault()` in a handler becomes a policy the page applies before the handler symbol loads; a cancel the compiler cannot place there would run after the event has finished.',
		primarySpan: sourceSpan(stray.node, state.filename),
		suggestions: [{ message: reason.fix }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_SECOND_CANCEL',
	};
}

function fallbackSpan(filename: string): SourceSpan {
	return { filename, start: 0, end: 0 };
}

export function extractSyncPolicy(
	node: AnyNode | undefined,
	state: Pick<WalkState, 'graph' | 'source'>,
): SemanticSyncPolicy | undefined {
	if (!node) return undefined;

	const eventParam = getIdentifierName(asNodes(node.params)[0]) ?? 'event';
	return locateSyncPolicy(node.body as AnyNode | undefined, eventParam, state)?.policy;
}

export function uncoveredSyncPolicyCall(
	node: AnyNode | undefined,
	state: Pick<WalkState, 'graph' | 'source'>,
): StraySyncPolicyCall | null {
	if (!node) return null;

	const eventParam = getIdentifierName(asNodes(node.params)[0]) ?? 'event';
	const body = node.body as AnyNode | undefined;
	const located = locateSyncPolicy(body, eventParam, state);
	if (!located) return null;

	const covered = new Set(located.calls);
	const stray = syncActionCallNodes(body, eventParam, ALL_SYNC_POLICY_ACTIONS).find(
		(call) => !covered.has(call),
	);
	if (!stray) return shadowedSyncPolicyCall(node);

	const action = syncActionCall(stray, eventParam);
	return action
		? { action, node: stray, eventParam, reason: located.refused.get(stray) ?? 'not-a-guard' }
		: null;
}

// A cancel on a nested binding that reuses the event parameter's name: it may or may not be the event, so it is refused.
function shadowedSyncPolicyCall(node: AnyNode | undefined): StraySyncPolicyCall | null {
	if (!node) return null;
	const eventParam = getIdentifierName(asNodes(node.params)[0]) ?? 'event';
	const body = node.body as AnyNode | undefined;
	const own = new Set(syncActionCallNodes(body, eventParam, ALL_SYNC_POLICY_ACTIONS));
	let found: StraySyncPolicyCall | null = null;
	walkNode(body, (candidate) => {
		if (found || own.has(candidate)) return;
		const action = syncActionCall(candidate, eventParam);
		if (action)
			found = { action, node: candidate, eventParam, reason: 'shadowed-event-name' };
	});
	return found;
}

const ALL_SYNC_POLICY_ACTIONS: ReadonlySet<SemanticSyncPolicyAction> = new Set([
	'preventDefault',
	'stopPropagation',
]);

export function hasSyncEventPolicyCandidate(node: AnyNode | undefined): boolean {
	return firstSyncPolicyActionCall(node) !== null;
}

export function firstSyncPolicyActionCall(
	node: AnyNode | undefined,
): { readonly action: SemanticSyncPolicyAction; readonly node: AnyNode } | null {
	let found: { readonly action: SemanticSyncPolicyAction; readonly node: AnyNode } | null = null;

	walkNode(node, (candidate) => {
		if (found) return;
		if (candidate.type !== 'CallExpression') return;

		const callee = unwrapParens(candidate.callee as AnyNode | undefined);
		if (callee?.type !== 'MemberExpression') return;

		const propertyName = getStaticPropertyName(callee.property as AnyNode | undefined);
		if (propertyName === 'preventDefault' || propertyName === 'stopPropagation') {
			found = { action: propertyName, node: candidate };
		}
	});

	return found;
}

// The cancel calls the policy already runs, so the lazy handler can drop them.
export function extractedSyncPolicyActionCalls(
	node: AnyNode | undefined,
	eventParam: string,
	actions: ReadonlySet<SemanticSyncPolicyAction>,
	state: Pick<WalkState, 'graph' | 'source'>,
): AnyNode[] {
	if (!node || actions.size === 0) return [];
	// Calls after the first plain statement stay in the lazy handler, as they always have.
	const statements = node.type === 'BlockStatement' ? asNodes(node.body) : [node];
	const horizon = statements.find(
		(statement) =>
			statement.type !== 'IfStatement' &&
			!syncActionCall(
				statement.type === 'ExpressionStatement'
					? (statement.expression as AnyNode | undefined)
					: statement,
				eventParam,
			),
	);
	const end = horizon?.start ?? Number.POSITIVE_INFINITY;
	return (locateSyncPolicy(node, eventParam, state)?.calls ?? []).filter((call) => {
		const action = syncActionCall(call, eventParam);
		return action !== null && actions.has(action) && (call.start ?? 0) < end;
	});
}

export function firstDetachedSyncPolicyReference(node: AnyNode | undefined): {
	readonly action: SemanticSyncPolicyAction;
	readonly alias: string;
	readonly start: number;
	readonly end: number;
} | null {
	let detached: {
		action: SemanticSyncPolicyAction;
		alias: string;
		start: number;
		end: number;
	} | null = null;

	walkNode(node, (candidate) => {
		if (detached || candidate.type !== 'VariableDeclarator') return;
		const alias = getIdentifierName(candidate.id as AnyNode | undefined);
		const init = candidate.init as AnyNode | undefined;
		const target = unwrapParens(init);
		if (!alias || target?.type !== 'MemberExpression') return;

		const action = getStaticPropertyName(target.property as AnyNode | undefined);
		if (action !== 'preventDefault' && action !== 'stopPropagation') return;
		if (!callsIdentifier(node, alias)) return;

		detached = {
			action,
			alias,
			start: candidate.start ?? init?.start ?? 0,
			end: candidate.end ?? init?.end ?? 0,
		};
	});

	return detached;
}

type SyncPolicyLocation = {
	readonly policy: SemanticSyncPolicy;
	readonly calls: ReadonlyArray<AnyNode>;
	readonly refused: ReadonlyMap<AnyNode, SyncPolicyRefusal>;
};

export type SyncPolicyRefusal =
	| 'unextractable-guard'
	| 'guard-reads-written-state'
	| 'not-a-guard'
	| 'shadowed-event-name';

type SyncPolicyScan = {
	readonly eventParam: string;
	readonly state: Pick<WalkState, 'graph' | 'source'>;
	readonly branches: SemanticSyncPolicyBranch[];
	readonly calls: AnyNode[];
	readonly refused: Map<AnyNode, SyncPolicyRefusal>;
	mayHaveWritten: boolean;
};

// Every top-level guarded cancel joins the policy; the resumer evaluates all of
// them before the handler runs, so a guard is folded only when that is the same
// answer the handler would reach at that statement.
function locateSyncPolicy(
	body: AnyNode | undefined,
	eventParam: string,
	state: Pick<WalkState, 'graph' | 'source'>,
): SyncPolicyLocation | undefined {
	if (!body || rebindsName(body, eventParam)) return undefined;

	const statements = body.type === 'BlockStatement' ? asNodes(body.body) : [body];
	const scan: SyncPolicyScan = {
		eventParam,
		state,
		branches: [],
		calls: [],
		refused: new Map(),
		mayHaveWritten: false,
	};
	// A cancel after `if (guard) return;` runs only where every guard before it is false.
	const guards: SemanticSyncPolicyCondition[] = [];
	for (const statement of statements) {
		if (statement.type === 'IfStatement') {
			scanIfStatement(statement, guards, scan, true);
		} else {
			const expression =
				statement.type === 'ExpressionStatement'
					? (statement.expression as AnyNode | undefined)
					: statement;
			const action = syncActionCall(expression, eventParam);
			if (action && expression) {
				scan.branches.push({
					when: guardedCondition(guards, { type: 'constant-truthy', value: true }),
					actions: [action],
				});
				scan.calls.push(unwrapParens(expression) ?? expression);
				continue;
			}
		}
		if (mayWrite(statement, eventParam)) scan.mayHaveWritten = true;
	}

	if (scan.branches.length === 0) return undefined;
	return { policy: foldedPolicy(scan.branches), calls: scan.calls, refused: scan.refused };
}

function scanIfStatement(
	statement: AnyNode,
	guards: SemanticSyncPolicyCondition[],
	scan: SyncPolicyScan,
	topLevel: boolean,
): void {
	const consequent = statement.consequent as AnyNode | undefined;
	const alternate = statement.alternate as AnyNode | undefined;
	const test = statement.test as AnyNode | undefined;
	const actions = extractSyncActions(consequent, scan.eventParam);
	const alternateCancels = extractSyncActions(alternate, scan.eventParam).length > 0;
	if (actions.length === 0 && !alternateCancels) {
		if (!topLevel || alternate || !exitsAtEnd(consequent)) return;
		// What the policy cannot read before the handler loads is taken as not leaving, so the cancel is never narrower than authored.
		guards.push(
			negatedCondition(approximateCondition(test, scan.eventParam, scan.state, false)),
		);
		return;
	}

	const when = extractSyncCondition(test, scan.eventParam, scan.state);
	const refusal: SyncPolicyRefusal | null = !when
		? 'unextractable-guard'
		: scan.branches.length > 0 && scan.mayHaveWritten && readsGraph(when)
			? 'guard-reads-written-state'
			: null;
	if (!when || refusal) {
		for (const call of syncActionCallNodes(statement, scan.eventParam, ALL_SYNC_POLICY_ACTIONS))
			scan.refused.set(call, refusal ?? 'unextractable-guard');
		return;
	}

	if (actions.length > 0) {
		scan.branches.push({ when: guardedCondition(guards, when), actions });
		scan.calls.push(...syncActionCallNodes(consequent, scan.eventParam, new Set(actions)));
	}
	if (alternateCancels) {
		const otherwise = [...guards, negatedCondition(when)];
		if (alternate?.type === 'IfStatement') {
			scanIfStatement(alternate, otherwise, scan, false);
		} else {
			const alternateActions = extractSyncActions(alternate, scan.eventParam);
			scan.branches.push({
				when: guardedCondition(otherwise, { type: 'constant-truthy', value: true }),
				actions: alternateActions,
			});
			scan.calls.push(
				...syncActionCallNodes(alternate, scan.eventParam, new Set(alternateActions)),
			);
		}
	}
	if (topLevel && !alternate && exitsAtEnd(consequent)) guards.push(negatedCondition(when));
}

// Branches cancelling the same actions are one branch whose guard is any of theirs.
function foldedPolicy(branches: ReadonlyArray<SemanticSyncPolicyBranch>): SemanticSyncPolicy {
	const actionKey = (branch: SemanticSyncPolicyBranch) => [...branch.actions].sort().join(',');
	const first = branches[0]!;
	if (branches.every((branch) => actionKey(branch) === actionKey(first))) {
		return branches.length === 1
			? first
			: {
					when: combinedCondition(
						'or',
						branches.map((branch) => branch.when),
					),
					actions: first.actions,
				};
	}
	return { branches };
}

function readsGraph(condition: SemanticSyncPolicyCondition): boolean {
	if (condition.type === 'graph-truthy') return true;
	if (condition.type === 'and' || condition.type === 'or')
		return condition.conditions.some(readsGraph);
	return condition.type === 'not' ? readsGraph(condition.condition) : false;
}

// Anything that can change state before a later guard reads it: assignments,
// updates, deletes, and any call other than the event's own cancel methods.
function mayWrite(node: AnyNode | undefined, eventParam: string): boolean {
	let writes = false;
	const cancels = new Set(syncActionCallNodes(node, eventParam, ALL_SYNC_POLICY_ACTIONS));
	walkNode(node, (candidate) => {
		if (writes) return;
		if (
			candidate.type === 'AssignmentExpression' ||
			candidate.type === 'UpdateExpression' ||
			(candidate.type === 'UnaryExpression' && candidate.operator === 'delete') ||
			(candidate.type === 'CallExpression' && !cancels.has(candidate)) ||
			candidate.type === 'NewExpression' ||
			candidate.type === 'AwaitExpression'
		)
			writes = true;
	});
	return writes;
}

function guardedCondition(
	guards: ReadonlyArray<SemanticSyncPolicyCondition>,
	when: SemanticSyncPolicyCondition,
): SemanticSyncPolicyCondition {
	return combinedCondition('and', [...guards, when]);
}

function combinedCondition(
	type: 'and' | 'or',
	parts: ReadonlyArray<SemanticSyncPolicyCondition>,
): SemanticSyncPolicyCondition {
	const absorbing = type === 'or';
	const conditions: SemanticSyncPolicyCondition[] = [];
	for (const part of parts) {
		if (part.type === 'constant-truthy') {
			if (Boolean(part.value) === absorbing)
				return { type: 'constant-truthy', value: absorbing };
			continue;
		}
		conditions.push(part);
	}
	if (conditions.length === 0) return { type: 'constant-truthy', value: !absorbing };
	if (conditions.length === 1) return conditions[0]!;
	return { type, conditions: flattenSyncConditions(type, conditions) };
}

function negatedCondition(condition: SemanticSyncPolicyCondition): SemanticSyncPolicyCondition {
	if (condition.type === 'constant-truthy')
		return { type: 'constant-truthy', value: !condition.value };
	return condition.type === 'not' ? condition.condition : { type: 'not', condition };
}

// The readable part of a guard, with every unreadable piece taken as `unreadable`.
function approximateCondition(
	input: AnyNode | undefined,
	eventParam: string,
	state: Pick<WalkState, 'graph' | 'source'>,
	unreadable: boolean,
): SemanticSyncPolicyCondition {
	const exact = extractSyncCondition(input, eventParam, state);
	if (exact) return exact;
	const node = unwrapParens(input);
	if (node?.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||'))
		return combinedCondition(node.operator === '&&' ? 'and' : 'or', [
			approximateCondition(node.left as AnyNode | undefined, eventParam, state, unreadable),
			approximateCondition(node.right as AnyNode | undefined, eventParam, state, unreadable),
		]);
	if (node?.type === 'UnaryExpression' && node.operator === '!')
		return negatedCondition(
			approximateCondition(
				node.argument as AnyNode | undefined,
				eventParam,
				state,
				!unreadable,
			),
		);
	return { type: 'constant-truthy', value: unreadable };
}

// A `return` or `throw` the handler itself reaches; a nested function's own exits are not its.
function mayExitEarly(node: AnyNode | undefined): boolean {
	let exits = false;
	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate || exits) return;
		if (candidate.type === 'ReturnStatement' || candidate.type === 'ThrowStatement') {
			exits = true;
			return;
		}
		if (isFunctionNode(candidate)) return;
		for (const child of childNodes(candidate)) visit(child);
	};
	visit(node);
	return exits;
}

// Only a guard that always leaves is a guard: `if (x) { log(); return; }`, never `if (x) { if (y) return; }`.
function exitsAtEnd(node: AnyNode | undefined): boolean {
	if (!node) return false;
	if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;
	if (node.type !== 'BlockStatement') return false;
	const body = asNodes(node.body);
	const last = body.at(-1);
	if (!last || !exitsAtEnd(last)) return false;
	return body.slice(0, -1).every((statement) => !mayExitEarly(statement));
}

// Visits the nodes where `name` still means the handler's event: a nested function, block, loop or catch that binds it holds its own value.
function walkEventScope(
	node: AnyNode | undefined,
	name: string,
	visit: (node: AnyNode) => void,
): void {
	if (!node || typeof node !== 'object' || rebindsName(node, name)) return;
	visit(node);
	for (const child of childNodes(node)) walkEventScope(child, name, visit);
}

function rebindsName(node: AnyNode, name: string): boolean {
	if (isFunctionNode(node) || node.type === 'ArrowFunctionExpression')
		return (
			asNodes(node.params).some((parameter) => patternBindsName(parameter, name)) ||
			declaresName(node.body as AnyNode | undefined, name, true)
		);
	if (node.type === 'BlockStatement' || node.type === 'StaticBlock' || node.type === 'Program')
		return declaresName(node, name, false);
	if (node.type === 'SwitchStatement')
		return asNodes(node.cases).some((switchCase) =>
			asNodes(switchCase.consequent).some((statement) =>
				declaresName(statement, name, false, true),
			),
		);
	if (node.type === 'CatchClause') return patternBindsName(node.param as AnyNode | undefined, name);
	if (node.type === 'ForStatement')
		return declaresName(node.init as AnyNode | undefined, name, false, true);
	if (node.type === 'ForInStatement' || node.type === 'ForOfStatement')
		return declaresName(node.left as AnyNode | undefined, name, false, true);
	return false;
}

// Whether a scope's own statements declare `name`; `var` declarations count through nested blocks of a function body.
function declaresName(
	node: AnyNode | undefined,
	name: string,
	functionBody: boolean,
	direct = false,
): boolean {
	if (!node) return false;
	const statements = direct
		? [node]
		: node.type === 'BlockStatement' || node.type === 'StaticBlock' || node.type === 'Program'
			? asNodes(node.body)
			: [];
	if (
		statements.some(
			(statement) =>
				((statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') &&
					getIdentifierName(statement.id as AnyNode | undefined) === name) ||
				(statement.type === 'VariableDeclaration' &&
					asNodes(statement.declarations).some((declarator) =>
						patternBindsName(declarator.id as AnyNode | undefined, name),
					)),
		)
	)
		return true;
	if (!functionBody) return false;
	let hoisted = false;
	const visit = (candidate: AnyNode): void => {
		if (hoisted || (candidate !== node && isFunctionNode(candidate))) return;
		if (
			candidate.type === 'VariableDeclaration' &&
			candidate.kind === 'var' &&
			asNodes(candidate.declarations).some((declarator) =>
				patternBindsName(declarator.id as AnyNode | undefined, name),
			)
		)
			hoisted = true;
		for (const child of childNodes(candidate)) visit(child);
	};
	visit(node);
	return hoisted;
}

function patternBindsName(pattern: AnyNode | undefined, name: string): boolean {
	let binds = false;
	walkNode(pattern, (candidate) => {
		if (candidate.type === 'Identifier' && getIdentifierName(candidate) === name) binds = true;
	});
	return binds;
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

function extractSyncActions(
	node: AnyNode | undefined,
	eventParam: string,
): SemanticSyncPolicyAction[] {
	const actions: SemanticSyncPolicyAction[] = [];

	walkEventScope(node, eventParam, (candidate) => {
		if (candidate.type !== 'CallExpression') return;

		const callee = unwrapParens(candidate.callee as AnyNode | undefined);
		if (callee?.type !== 'MemberExpression') return;
		if (getIdentifierName(unwrapParens(callee.object as AnyNode | undefined)) !== eventParam)
			return;

		const propertyName = getStaticPropertyName(callee.property as AnyNode | undefined);
		if (propertyName === 'preventDefault' || propertyName === 'stopPropagation') {
			actions.push(propertyName);
		}
	});

	return uniqueBy(actions, (action) => action);
}

function syncActionCallNodes(
	node: AnyNode | undefined,
	eventParam: string,
	actions: ReadonlySet<SemanticSyncPolicyAction>,
): AnyNode[] {
	const calls: AnyNode[] = [];

	walkEventScope(node, eventParam, (candidate) => {
		if (candidate.type !== 'CallExpression') return;

		const callee = unwrapParens(candidate.callee as AnyNode | undefined);
		if (callee?.type !== 'MemberExpression') return;
		if (getIdentifierName(unwrapParens(callee.object as AnyNode | undefined)) !== eventParam)
			return;

		const propertyName = getStaticPropertyName(callee.property as AnyNode | undefined);
		if (
			(propertyName === 'preventDefault' || propertyName === 'stopPropagation') &&
			actions.has(propertyName)
		) {
			calls.push(candidate);
		}
	});

	return calls;
}

function syncActionCall(
	input: AnyNode | undefined,
	eventParam: string,
): SemanticSyncPolicyAction | null {
	const node = unwrapParens(input);
	if (node?.type !== 'CallExpression') return null;

	const callee = unwrapParens(node.callee as AnyNode | undefined);
	if (callee?.type !== 'MemberExpression') return null;
	if (getIdentifierName(unwrapParens(callee.object as AnyNode | undefined)) !== eventParam)
		return null;

	const propertyName = getStaticPropertyName(callee.property as AnyNode | undefined);
	if (propertyName === 'preventDefault' || propertyName === 'stopPropagation') {
		return propertyName;
	}
	return null;
}

// The parser keeps authored parentheses as nodes and the formatter re-adds them,
// so every classifier below must see through them or the same guard is refused
// with parentheses and accepted without.
function unwrapParens(node: AnyNode | undefined): AnyNode | undefined {
	let current = node;
	while (current?.type === 'ParenthesizedExpression') {
		current = current.expression as AnyNode | undefined;
	}
	return current;
}

// DOM event fields that are always booleans, so reading one alone is `=== true`.
const BOOLEAN_EVENT_FIELDS: ReadonlySet<string> = new Set([
	'altKey',
	'ctrlKey',
	'metaKey',
	'shiftKey',
	'repeat',
	'isComposing',
]);

function extractSyncCondition(
	input: AnyNode | undefined,
	eventParam: string,
	state: Pick<WalkState, 'graph' | 'source'>,
): SemanticSyncPolicyCondition | undefined {
	const node = unwrapParens(input);
	if (!node) return undefined;

	if (node.type === 'LogicalExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '';
		const left = extractSyncCondition(node.left as AnyNode | undefined, eventParam, state);
		const right = extractSyncCondition(node.right as AnyNode | undefined, eventParam, state);
		if (!left || !right) return undefined;

		if (operator === '&&') {
			return { type: 'and', conditions: flattenSyncConditions('and', [left, right]) };
		}
		if (operator === '||') {
			return { type: 'or', conditions: flattenSyncConditions('or', [left, right]) };
		}

		return undefined;
	}

	if (node.type === 'BinaryExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '';
		if (operator === '!==' || operator === '!=') {
			const equality = extractSyncEquality(node, eventParam, state);
			return equality ? { type: 'not', condition: equality } : undefined;
		}
		if (operator !== '===' && operator !== '==') return undefined;

		return extractSyncEquality(node, eventParam, state);
	}

	if (node.type === 'UnaryExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '';
		if (operator !== '!') return undefined;

		const condition = extractSyncCondition(
			node.argument as AnyNode | undefined,
			eventParam,
			state,
		);
		if (!condition) return undefined;

		return { type: 'not', condition };
	}

	const field = eventFieldName(node, eventParam);
	if (field && BOOLEAN_EVENT_FIELDS.has(field))
		return { type: 'event-equals', field, value: true };

	const resolved = resolveGraphPath(
		expressionSource(node, state.source),
		graphBindingMap(state.graph),
		semanticAliasMap(state.graph),
	);
	if (!resolved) {
		const constant = syncPolicyConstantValue(node, state.graph.syncPolicyConstants ?? []);
		if (!constant.ok) return undefined;

		return {
			type: 'constant-truthy',
			value: constant.value,
		};
	}

	return {
		type: 'graph-truthy',
		graphNodeId: resolved.binding.id,
		path: resolved.path,
	};
}

// `a !== b` is `!(a === b)`, so both operators share one equality reader.
function extractSyncEquality(
	node: AnyNode,
	eventParam: string,
	state: Pick<WalkState, 'graph' | 'source'>,
): SemanticSyncPolicyCondition | undefined {
	const leftField = eventFieldName(node.left as AnyNode | undefined, eventParam);
	const rightValue = literalValue(node.right as AnyNode | undefined);
	if (leftField && rightValue.ok) {
		return { type: 'event-equals', field: leftField, value: rightValue.value };
	}

	const rightField = eventFieldName(node.right as AnyNode | undefined, eventParam);
	const leftValue = literalValue(node.left as AnyNode | undefined);
	if (rightField && leftValue.ok) {
		return { type: 'event-equals', field: rightField, value: leftValue.value };
	}

	const constants = state.graph.syncPolicyConstants ?? [];
	const leftSyncValue = syncPolicyStaticValue(node.left as AnyNode | undefined, constants);
	const rightSyncValue = syncPolicyStaticValue(node.right as AnyNode | undefined, constants);
	if (leftSyncValue.ok && rightSyncValue.ok) {
		return { type: 'constant-truthy', value: leftSyncValue.value === rightSyncValue.value };
	}

	return undefined;
}

function syncPolicyStaticValue(
	node: AnyNode | undefined,
	constants: ReadonlyArray<{ readonly name: string; readonly value: unknown }>,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	const literal = literalValue(node);
	if (literal.ok) return literal;
	if (!node) return { ok: false };
	return syncPolicyConstantValue(node, constants);
}

function callsIdentifier(node: AnyNode | undefined, name: string): boolean {
	let found = false;
	walkNode(node, (candidate) => {
		if (found || candidate.type !== 'CallExpression') return;
		found = getIdentifierName(candidate.callee as AnyNode | undefined) === name;
	});
	return found;
}

function syncPolicyConstantValue(
	node: AnyNode,
	constants: ReadonlyArray<{ readonly name: string; readonly value: unknown }>,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	const path = staticExpressionPath(node);
	if (!path) return { ok: false };
	const [name, ...segments] = path;

	for (let index = constants.length - 1; index >= 0; index--) {
		const constant = constants[index];
		if (constant.name === name) {
			return { ok: true, value: readStaticPath(constant.value, segments) };
		}
	}

	return { ok: false };
}

function staticExpressionPath(input: AnyNode | undefined | null): ReadonlyArray<string> | null {
	const node = unwrapParens(input ?? undefined);
	if (!node) return null;

	const name = getIdentifierName(node);
	if (name) return [name];

	if (node.type !== 'MemberExpression') return null;

	const parent = staticExpressionPath(node.object as AnyNode | undefined);
	const property = getStaticPropertyName(node.property as AnyNode | undefined);
	if (!parent || !property) return null;

	return [...parent, property];
}

function readStaticPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;

	for (const segment of path) {
		if (current == null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

function flattenSyncConditions(
	type: 'and' | 'or',
	conditions: ReadonlyArray<SemanticSyncPolicyCondition>,
): ReadonlyArray<SemanticSyncPolicyCondition> {
	return conditions.flatMap((condition) => {
		if (condition.type === type) return condition.conditions;
		return [condition];
	});
}

function eventFieldName(input: AnyNode | undefined, eventParam: string): string | null {
	const node = unwrapParens(input);
	if (node?.type !== 'MemberExpression') return null;
	if (getIdentifierName(unwrapParens(node.object as AnyNode | undefined)) !== eventParam)
		return null;

	return getStaticPropertyName(node.property as AnyNode | undefined);
}

function literalValue(
	input: AnyNode | undefined,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	const node = unwrapParens(input);
	if (node?.type !== 'Literal') return { ok: false };

	return { ok: true, value: node.value };
}

function getStaticPropertyName(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (typeof node.name === 'string') return node.name;
	if (typeof node.value === 'string' || typeof node.value === 'number') return String(node.value);
	return null;
}
