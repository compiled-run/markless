import { asNodes, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	graphMemberSource,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import type { FunctionEffect, SemanticGraphDiagnostic } from '../../artifacts.ts';
import {
	createFunctionEffects,
	type CalleeEffect,
	type FunctionEffects,
} from './function-effects.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { isPrimitiveExpression, isScalarState } from './primitive-values.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { WalkState } from './types.ts';
import { stateOriginOf, writeThroughLocal, type LocalOrigin } from './write-through-locals.ts';

// An import whose module the host has not summarized yet: nothing to refuse until it has.
const PENDING: FunctionEffect = { parameters: [] };

type ModuleEffects = {
	readonly effects: FunctionEffects;
	readonly callsBySpan: ReadonlyMap<string, AnyNode>;
};

const moduleEffects = new WeakMap<WalkState, ModuleEffects>();

// Calls in handlers, callbacks and attach bodies are decided after the walk.
export function collectStateEscapes(node: AnyNode, state: WalkState): void {
	if (state.currentFunctionSite !== 'handler' && state.currentFunctionSite !== 'helper') return;
	if (state.currentCreationSite === 'computed') return;
	if (state.currentSharedDefinitionId || !state.currentComponentName) return;
	if (asNodes(node.arguments).length === 0) return;
	let pending = pendingCalls.get(state);
	if (!pending) pendingCalls.set(state, (pending = []));
	pending.push({
		node,
		functionSite: state.currentFunctionSite,
		componentName: state.currentComponentName,
	});
}

type PendingCall = {
	readonly node: AnyNode;
	readonly functionSite: 'handler' | 'helper';
	readonly componentName: string;
};

const pendingCalls = new WeakMap<WalkState, PendingCall[]>();

/** Decided after the walk, when every write that says what a state holds is known. */
export function resolveStateEscapes(state: WalkState): void {
	collectChangingImportReads(state);
	const calls = pendingCalls.get(state);
	if (!calls) return;
	pendingCalls.delete(state);
	const previous = { site: state.currentFunctionSite, component: state.currentComponentName };
	for (const pending of calls) {
		state.currentFunctionSite = pending.functionSite;
		state.currentComponentName = pending.componentName;
		resolveCall(pending.node, state);
	}
	state.currentFunctionSite = previous.site;
	state.currentComponentName = previous.component;
}

function resolveCall(node: AnyNode, state: WalkState): void {
	let effects: ModuleEffects | undefined;
	asNodes(node.arguments).forEach((argument, index) => {
		const value = unwrapTypeAssertion(
			argument.type === 'SpreadElement' ? (argument.argument as AnyNode) : argument,
		)!;
		const origin = argumentOrigin(value, state);
		if (!origin) return;

		effects ??= effectsFor(state);
		const call = effects.callsBySpan.get(`${node.start}:${node.end}`);
		if (!call) return;
		if (index === 0 && isObjectAssign(call)) return;
		if (isMarklessCallee(call, state)) return;
		const callee = effects.effects.ofCallee(call, index);
		const refusal = refusalFor(
			callee,
			value,
			origin,
			state,
			expressionSource(node.callee as AnyNode, state.source),
		);
		if (
			refusal?.reason === 'mutates' &&
			callee.kind === 'effect' &&
			trackChanges(node, value, callee.effect.mutates, origin, state)
		) {
			return;
		}
		if (refusal) {
			state.graph.diagnostics.push(
				statePassedByReferenceDiagnostic({
					argument: expressionSource(value, state.source),
					holds: origin.kind === 'container' || origin.kind === 'untracked',
					call: expressionSource(node, state.source),
					span: sourceSpan(value, state.filename),
					filename: state.filename,
					...refusal,
				}),
			);
		}
	});
}

// A template read of a plain value its own module changes renders once.
function collectChangingImportReads(state: WalkState): void {
	const semantic = state.semantic();
	const requests = (state.graph.importedFunctionRequests ??= []);
	const reported = new Set<string>();
	for (const read of state.graph.templateReads) {
		if (!read.sourceSpan) continue;
		const offset =
			read.sourceSpan.start + (read.source.length - read.source.trimStart().length);
		const root = /^[$A-Z_a-z][$\w]*/.exec(read.source.trimStart())?.[0];
		// A call is the function's own business; only a value read can be a stale copy.
		if (!root || /^\s*\(/.test(read.source.trimStart().slice(root.length))) continue;
		const symbolId = resolvedSymbolAt(semantic, offset);
		if (symbolId === null) continue;
		const record = semantic.imports.find(
			(candidate) => candidate.local?.id === symbolId && !candidate.typeOnly,
		);
		if (!record || record.specifier.startsWith('@markless/') || record.isNamespace) continue;
		const summaries = state.importedFunctionSummaries?.[record.specifier];
		if (!summaries) {
			if (!requests.includes(record.specifier)) requests.push(record.specifier);
			continue;
		}
		if (!summaries[record.name ?? 'default']?.changedByItsModule) continue;
		const key = `${record.specifier}#${root}`;
		if (reported.has(key)) continue;
		reported.add(key);
		state.graph.diagnostics.push({
			code: 'MARKLESS_TEMPLATE_READS_CHANGING_IMPORT',
			severity: 'error',
			phase: 'semantic-graph',
			title: 'The page shows a changing plain value once',
			message: `The page shows \`${read.source}\` once: "${root}" is a plain value that its module (${record.specifier}) changes, and only changes to state reach the page.`,
			why: 'Markless has no runtime proxies. A value outside state() and shared() is rendered as it is when the page renders, and nothing tells the page when code elsewhere changes it.',
			primarySpan: read.sourceSpan,
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			statePath: read.source,
			source: read.source,
			suggestions: [
				{
					message: `Keep "${root}" in state: create it with shared() in a .tsrx module and change it through the instance, or keep a state() in this component that the code changing "${root}" also writes.`,
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_READS_CHANGING_IMPORT',
		});
	}
}

// What the argument hands over, or null when no state object can be in it.
function argumentOrigin(value: AnyNode, state: WalkState): LocalOrigin | null {
	if (value.type === 'ArrayExpression' || value.type === 'ObjectExpression') {
		const members =
			value.type === 'ArrayExpression'
				? asNodes(value.elements)
				: asNodes(value.properties).map((property) =>
						property.type === 'Property' ? (property.value as AnyNode) : property,
					);
		for (const member of members) {
			if (member.type === 'SpreadElement') {
				const spread = stateOriginOf(member.argument as AnyNode, state);
				if (spread.kind !== 'plain' && holdsObjectMembers(spread, state)) {
					return {
						kind: 'container',
						source: expressionSource(member.argument as AnyNode, state.source),
					};
				}
				continue;
			}
			const held = argumentOrigin(unwrapTypeAssertion(member)!, state);
			if (held) return { kind: 'container', source: expressionSource(member, state.source) };
		}
		return null;
	}
	if (isPrimitiveExpression(value, state)) return null;
	const origin = stateOriginOf(value, state);
	if (origin.kind === 'plain' || !holdsObject(origin, null, state)) return null;
	return origin;
}

// Calls into code Markless compiles itself: a callback prop, a shared() instance method, an element handle.
function isMarklessCallee(call: AnyNode, state: WalkState): boolean {
	let callee = unwrapTypeAssertion(call.callee as AnyNode | undefined);
	while (callee?.type === 'MemberExpression')
		callee = unwrapTypeAssertion(callee.object as AnyNode);
	if (callee?.type !== 'Identifier' || typeof callee.start !== 'number') return false;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, callee.start);
	if (symbolId === null) return false;
	const binding = semantic.bindings[symbolId]!;
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	const start = declaration?.start;
	if (state.graph.sharedInstances.some((instance) => instance.localName === binding.name))
		return true;
	if (state.graph.componentPropBindings.some((prop) => prop.sourceSpan.start === start))
		return true;
	if (state.graph.aliases.some((alias) => alias.propPath && alias.sourceSpan?.start === start))
		return true;
	return state.graph.graphBindings.some(
		(graphBinding) =>
			(graphBinding.kind === 'prop' || graphBinding.kind === 'element') &&
			graphBinding.name === binding.name &&
			(graphBinding.kind === 'prop' || graphBinding.sourceSpan?.start === start),
	);
}

// The call runs as written and each path the function changed is invalidated; false when no graph path names the state.
function trackChanges(
	call: AnyNode,
	argument: AnyNode,
	mutates: ReadonlyArray<ReadonlyArray<string> | null>,
	origin: LocalOrigin,
	state: WalkState,
): boolean {
	if (origin.kind !== 'path' && origin.kind !== 'element') return false;
	if (origin.kind === 'element' && origin.anchor === '') return false;
	const argumentText = expressionSource(argument, state.source);
	const through = writeThroughLocal(argument, state, 'call');
	if (through && through.kind !== 'path' && through.kind !== 'element') return false;
	const callSource = expressionSource(call, state.source);
	for (const mutated of mutates) {
		// A changed length is a change of the array that holds it.
		const path = mutated?.at(-1) === 'length' ? mutated.slice(0, -1) : (mutated ?? []);
		state.graph.stateWrites.push({
			target: path.reduce(graphMemberSource, argumentText),
			...(state.currentSharedDefinitionId
				? { sharedDefinitionId: state.currentSharedDefinitionId }
				: {}),
			writeScope: state.currentFunctionSite ?? 'handler',
			...(state.currentComponentName ? { componentName: state.currentComponentName } : {}),
			targetSpan: sourceSpan(call, state.filename),
			...(through ? { through: { ...through, path: [...through.path, ...path] } } : {}),
			operation: 'call',
			changedByCall: { callSource },
		});
	}
	return true;
}

type Refusal = {
	readonly callee: string;
	readonly reason: 'unseen' | 'mutates' | 'retains' | 'hands-on';
	readonly detail?: string;
};

// `Object.assign(state, ...)` onto its first argument is lowered as a write of its own.
function isObjectAssign(call: AnyNode): boolean {
	const callee = call.callee as AnyNode | undefined;
	if (callee?.type !== 'MemberExpression' || callee.computed === true) return false;
	const owner = callee.object as AnyNode | undefined;
	return (
		owner?.type === 'Identifier' &&
		owner.name === 'Object' &&
		(callee.property as AnyNode | undefined)?.name === 'assign'
	);
}

function refusalFor(
	callee: CalleeEffect,
	argument: AnyNode,
	origin: LocalOrigin,
	state: WalkState,
	calleeSource: string,
): Refusal | null {
	if (callee.kind === 'pure') return null;
	if (callee.kind === 'unseen') {
		return {
			callee: callee.name === 'the function it computes' ? calleeSource : callee.name,
			reason: 'unseen',
		};
	}
	const { effect } = callee;
	const fresh = argument.type === 'ObjectExpression' || argument.type === 'ArrayExpression';
	const mutated = effect.mutates.find((path) =>
		!fresh
			? true
			: path === null
				? riskAt(argument, null, state)
				: (path.length > 1 && riskAt(argument, path.slice(0, -1), state)) ||
					(path.length > 0 && riskAt(argument, path, state)),
	);
	if (mutated !== undefined) {
		return { callee: callee.name, reason: 'mutates', detail: mutated?.join('.') ?? '' };
	}
	if (effect.retains.some((path) => riskAt(argument, path, state))) {
		return { callee: callee.name, reason: 'retains' };
	}
	const handedOn = effect.unseen.find((pass) => riskAt(argument, pass.path, state));
	if (handedOn) return { callee: callee.name, reason: 'hands-on', detail: handedOn.callee };
	return null;
}

// Whether the argument's part at `path` (null: somewhere inside) can be a state object, following literals member by member.
function riskAt(argument: AnyNode, path: ReadonlyArray<string> | null, state: WalkState): boolean {
	const value = unwrapTypeAssertion(argument)!;
	if (value.type === 'ObjectExpression' || value.type === 'ArrayExpression') {
		const members =
			value.type === 'ArrayExpression'
				? asNodes(value.elements).map((element, index) => ({
						key: String(index),
						value: element,
					}))
				: asNodes(value.properties).map((property) => ({
						key:
							property.type === 'Property'
								? String(
										(property.key as AnyNode | undefined)?.name ??
											(property.key as AnyNode | undefined)?.value,
									)
								: null,
						value:
							property.type === 'Property' ? (property.value as AnyNode) : property,
					}));
		const spreadRisk = members.some(
			(member) =>
				member.value.type === 'SpreadElement' &&
				holdsObjectMembers(stateOriginOf(member.value.argument as AnyNode, state), state),
		);
		if (spreadRisk) return true;
		if (path === null || path.length === 0) {
			return members.some(
				(member) =>
					member.value.type !== 'SpreadElement' && riskAt(member.value, null, state),
			);
		}
		const [head, ...rest] = path;
		const member = members.find((candidate) => candidate.key === head);
		return member ? riskAt(member.value, rest, state) : false;
	}
	if (isPrimitiveExpression(value, state)) return false;
	const origin = stateOriginOf(value, state);
	return origin.kind !== 'plain' && holdsObject(origin, path, state);
}

function effectsFor(state: WalkState): ModuleEffects {
	const known = moduleEffects.get(state);
	if (known) return known;
	const semantic = state.semantic();
	const requests = (state.graph.importedFunctionRequests ??= []);
	const effects = createFunctionEffects(semantic, (specifier, name) => {
		const summaries = state.importedFunctionSummaries?.[specifier];
		if (!summaries) {
			if (!requests.includes(specifier)) requests.push(specifier);
			return PENDING;
		}
		return summaries[name];
	});
	const created = { effects, callsBySpan: callsBySpan(semantic) };
	moduleEffects.set(state, created);
	return created;
}

function callsBySpan(semantic: ModuleSemantics): ReadonlyMap<string, AnyNode> {
	const calls = new Map<string, AnyNode>();
	for (const call of semantic.findAll(['CallExpression', 'NewExpression'])) {
		calls.set(`${call.start}:${call.end}`, call as unknown as AnyNode);
	}
	return calls;
}

// Decided from the state's initial value; anything not known is treated as an object.
function holdsObject(
	origin: LocalOrigin,
	path: ReadonlyArray<string> | null,
	state: WalkState,
): boolean {
	if (origin.kind === 'plain') return false;
	if (origin.kind !== 'path' && origin.kind !== 'element') return true;
	const scope = state.currentSharedDefinitionId ?? null;
	const resolved = resolveGraphPath(
		origin.kind === 'path' ? origin.target : origin.collection,
		graphBindingMap(state.graph, scope),
		semanticAliasMap(state.graph, scope),
	);
	if (!resolved) return true;
	// A prop is the parent's value; which of the parent's values it is, this module cannot tell.
	if (resolved.binding.kind === 'prop') return false;
	if (resolved.binding.valueKind === 'scalar') return false;
	if (origin.kind === 'element' && isRowKey(origin, path, state)) return false;
	if (
		origin.kind === 'path' &&
		resolved.path.length === 0 &&
		path === null &&
		isScalarState(resolved.binding, state)
	) {
		return false;
	}
	if (!resolved.binding.initialValueKnown) return true;
	const base = readInitial(resolved.binding.initialValue, resolved.path);
	if (!base.found) return true;
	const candidates =
		origin.kind === 'element'
			? Array.isArray(base.value)
				? base.value.map((element) => readInitial(element, origin.itemPath))
				: [{ found: false as const }]
			: [base];
	return candidates.some((candidate) => {
		if (!candidate.found) return true;
		if (path === null) return isObject(candidate.value);
		const inner = readInitial(candidate.value, path);
		return !inner.found || isObject(inner.value);
	});
}

// The member a keyed @for reads as each row's key identifies the row, and is a string or a number.
function isRowKey(
	origin: Extract<LocalOrigin, { readonly kind: 'element' }>,
	path: ReadonlyArray<string> | null,
	state: WalkState,
): boolean {
	if (path !== null && path.length > 0) return false;
	return state.graph.keyedRepeats.some(
		(repeat) =>
			repeat.collectionSource === origin.collection &&
			repeat.keyPath.length > 0 &&
			repeat.keyPath.join('.') === origin.itemPath.join('.'),
	);
}

// A spread copies the members: whether any of them can be an object.
function holdsObjectMembers(origin: LocalOrigin, state: WalkState): boolean {
	if (origin.kind !== 'path') return true;
	const scope = state.currentSharedDefinitionId ?? null;
	const resolved = resolveGraphPath(
		origin.target,
		graphBindingMap(state.graph, scope),
		semanticAliasMap(state.graph, scope),
	);
	if (!resolved?.binding.initialValueKnown) return true;
	const value = readInitial(resolved.binding.initialValue, resolved.path);
	if (!value.found || !isObject(value.value)) return !value.found;
	return Object.values(value.value as Record<string, unknown>).some(isObject);
}

function readInitial(
	value: unknown,
	path: ReadonlyArray<string>,
): { readonly found: true; readonly value: unknown } | { readonly found: false } {
	let cursor = value;
	for (const segment of path) {
		if (!isObject(cursor) || !Object.hasOwn(cursor as object, segment)) return { found: false };
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return { found: true, value: cursor };
}

function isObject(value: unknown): boolean {
	return typeof value === 'object' && value !== null;
}

function statePassedByReferenceDiagnostic(input: {
	readonly argument: string;
	readonly holds: boolean;
	readonly call: string;
	readonly span: ReturnType<typeof sourceSpan>;
	readonly filename: string;
	readonly callee: string;
	readonly reason: Refusal['reason'];
	readonly detail?: string;
}): SemanticGraphDiagnostic {
	const { argument, callee } = input;
	const because: Record<Refusal['reason'], string> = {
		unseen: `Markless cannot see what ${callee}() does with it`,
		mutates: `${callee}() changes ${input.detail ? `its "${input.detail}"` : 'it'} in place, and Markless cannot follow that change through "${argument}"`,
		retains: `${callee}() keeps a reference to it after it returns, so it could change it later`,
		'hands-on': `${callee}() hands it on to ${input.detail}(), and Markless cannot see what that does with it`,
	};
	return {
		code: 'MARKLESS_STATE_PASSED_BY_REFERENCE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'State object handed to code Markless cannot follow',
		message: `Cannot pass "${argument}" to ${callee}() here: "${argument}" ${input.holds ? 'holds state objects' : 'is a state object'}, and ${because[input.reason]}. A change made to it there would not reach the page.`,
		why: 'Markless has no runtime proxies. A state change reaches the page only when the compiler sees the write, so a state object handed to a function must not be changed inside it, now or later.',
		primarySpan: input.span ?? { filename: input.filename, start: 0, end: 0 },
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: argument,
		source: input.call,
		suggestions: [
			{
				message: `If ${callee}() only reads it, pass the fields it reads, or a copy: \`${callee}({ ...${argument} })\`.`,
			},
			{
				message: `If it changes the value, give it a copy and assign the result back: \`const next = structuredClone(${argument}); ${callee}(next); ${argument} = next;\`.`,
			},
			{
				message: `If a library needs the live object over time, keep the object in the library and copy changes into state from its own callbacks inside an \`attach\` behaviour.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_PASSED_BY_REFERENCE',
	};
}
