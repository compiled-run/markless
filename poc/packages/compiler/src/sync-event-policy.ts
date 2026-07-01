import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import type { SourceSpan } from './semantic-graph.ts';

export type SyncEventPolicyInput = {
	readonly filename: string;
	readonly source: string;
};

export type SyncPolicyMethod = 'preventDefault' | 'stopPropagation';

export type SyncEventLazyWrite = {
	readonly target: string;
	readonly operation: 'assign' | 'update' | 'call';
	readonly method?: string;
	readonly span?: SourceSpan;
};

export type SyncEventHandlerRecord = {
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly lazyWrites: ReadonlyArray<SyncEventLazyWrite>;
};

export type SyncPolicyRecord = {
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly guardSource: string;
	readonly methods: ReadonlyArray<SyncPolicyMethod>;
	readonly graphReads: ReadonlyArray<string>;
	readonly eventReads: ReadonlyArray<string>;
	readonly lazyWriteTargets: ReadonlyArray<string>;
	readonly span?: SourceSpan;
};

export type SyncEventPolicyDiagnostic = {
	readonly code: 'MARKLESS_SYNC_POLICY_UNPROVABLE_GUARD';
	readonly severity: 'error';
	readonly phase: 'sync-event-policy';
	readonly passId: 'sync-event-policy';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly eventName: string;
	readonly method: SyncPolicyMethod;
	readonly guardSource: string;
	readonly unsupportedReads: ReadonlyArray<string>;
	readonly primarySpan?: SourceSpan;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export type SyncEventPolicyArtifact = {
	readonly passId: 'sync-event-policy';
	readonly filename: string;
	readonly eventHandlers: ReadonlyArray<SyncEventHandlerRecord>;
	readonly syncPolicies: ReadonlyArray<SyncPolicyRecord>;
	readonly diagnostics: ReadonlyArray<SyncEventPolicyDiagnostic>;
};

type AnyNode = {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

type LocalRuntimeAlias = {
	readonly name: string;
	readonly origins: ReadonlyArray<string>;
};

type GuardAnalysis = {
	readonly graphReads: ReadonlyArray<string>;
	readonly eventReads: ReadonlyArray<string>;
	readonly unsupportedReads: ReadonlyArray<string>;
	readonly supported: boolean;
};

const ignoredWalkKeys = new Set([
	'comments',
	'closingElement',
	'innerComments',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);

const mutatingCollectionMethods = new Set([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift',
]);

const allowedEventFields = new Set(['altKey', 'key', 'shiftKey']);

export function extractSyncEventPolicies(input: SyncEventPolicyInput): SyncEventPolicyArtifact {
	const ast = parseModule(input.source, input.filename) as AnyNode;
	const stateNames = collectStateNames(ast);
	const eventHandlers: SyncEventHandlerRecord[] = [];
	const syncPolicies: SyncPolicyRecord[] = [];
	const diagnostics: SyncEventPolicyDiagnostic[] = [];
	let hostNodeIndex = 0;

	walk(ast, (node) => {
		if (node.type !== 'Element') return;

		const hostNodeId = `h${hostNodeIndex++}`;

		for (const attribute of asNodes(node.attributes)) {
			if (attribute.type !== 'Attribute') continue;

			const attributeName = getIdentifierName(attribute.name);
			if (!attributeName || !isEventAttribute(attributeName)) continue;

			const eventName = normalizeEventName(attributeName);
			const handler = attribute.value as AnyNode | undefined;
			const symbolId = `${input.filename}#${eventName}_${eventHandlers.length}`;
			const lazyWrites = collectStateWrites(handler, stateNames);
			const eventParam = eventParamName(handler);
			const localRuntimeAliases = collectLocalRuntimeAliases(handler, eventParam);

			eventHandlers.push({
				eventName,
				hostNodeId,
				symbolId,
				lazyWrites,
			});

			for (const statement of statementsInHandler(handler)) {
				collectPoliciesFromStatement({
					statement,
					eventName,
					hostNodeId,
					symbolId,
					eventParam,
					stateNames,
					localRuntimeAliases,
					source: input.source,
					syncPolicies,
					diagnostics,
				});
			}
		}
	});

	return {
		passId: 'sync-event-policy',
		filename: input.filename,
		eventHandlers,
		syncPolicies,
		diagnostics,
	};
}

function collectPoliciesFromStatement(input: {
	readonly statement: AnyNode;
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly eventParam: string | null;
	readonly stateNames: ReadonlySet<string>;
	readonly localRuntimeAliases: ReadonlyMap<string, LocalRuntimeAlias>;
	readonly source: string;
	readonly syncPolicies: SyncPolicyRecord[];
	readonly diagnostics: SyncEventPolicyDiagnostic[];
}): void {
	walk(input.statement, (node) => {
		if (node.type !== 'IfStatement') return;

		const methods = eventPolicyMethods(
			node.consequent as AnyNode | undefined,
			input.eventParam,
		);
		if (methods.length === 0) return;

		const test = node.test as AnyNode | undefined;
		const guard = analyzeGuard({
			node: test,
			eventParam: input.eventParam,
			stateNames: input.stateNames,
			localRuntimeAliases: input.localRuntimeAliases,
		});
		const lazyWriteTargets = unique(
			collectStateWrites(node.consequent as AnyNode | undefined, input.stateNames).map(
				(write) => write.target,
			),
		);
		const guardSource = sourceForNode(input.source, test).trim();

		if (guard.supported) {
			input.syncPolicies.push({
				eventName: input.eventName,
				hostNodeId: input.hostNodeId,
				symbolId: input.symbolId,
				guardSource,
				methods,
				graphReads: guard.graphReads,
				eventReads: guard.eventReads,
				lazyWriteTargets,
				span: sourceSpan(node),
			});
			return;
		}

		for (const method of methods) {
			input.diagnostics.push({
				code: 'MARKLESS_SYNC_POLICY_UNPROVABLE_GUARD',
				severity: 'error',
				phase: 'sync-event-policy',
				passId: 'sync-event-policy',
				title: 'Cannot prove synchronous event policy guard',
				message: `The ${input.eventName} handler calls event.${method}() behind a guard the compiler cannot run synchronously.`,
				why: 'Synchronous browser policy can only depend on framework graph state and stable event fields. DOM/runtime reads must stay in the lazy handler or use an explicit eager policy.',
				eventName: input.eventName,
				method,
				guardSource,
				unsupportedReads: guard.unsupportedReads,
				primarySpan: sourceSpan(node),
				suggestions: [
					{
						message:
							'Move DOM/runtime-dependent checks into the lazy handler, or express the sync browser policy with graph state and event fields only.',
					},
				],
				docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNPROVABLE_GUARD',
			});
		}
	});
}

function collectStateNames(ast: AnyNode): ReadonlySet<string> {
	const stateNames = new Set<string>();

	walk(ast, (node) => {
		if (node.type !== 'VariableDeclarator') return;

		const name = getIdentifierName(node.id);
		if (!name) return;

		if (getCalleePath(node.init as AnyNode | undefined) === 'state') {
			stateNames.add(name);
		}
	});

	return stateNames;
}

function collectStateWrites(
	node: AnyNode | null | undefined,
	stateNames: ReadonlySet<string>,
): ReadonlyArray<SyncEventLazyWrite> {
	const writes: SyncEventLazyWrite[] = [];

	walk(node, (candidate) => {
		if (candidate.type === 'AssignmentExpression') {
			const target = expressionPath(candidate.left as AnyNode | undefined);
			if (target && stateNames.has(rootName(target))) {
				pushUniqueWrite(writes, {
					target,
					operation: 'assign',
					span: sourceSpan(candidate),
				});
			}
			return;
		}

		if (candidate.type === 'UpdateExpression') {
			const target = expressionPath(candidate.argument as AnyNode | undefined);
			if (target && stateNames.has(rootName(target))) {
				pushUniqueWrite(writes, {
					target,
					operation: 'update',
					span: sourceSpan(candidate),
				});
			}
			return;
		}

		if (candidate.type === 'CallExpression') {
			const callee = candidate.callee as AnyNode | undefined;
			if (callee?.type !== 'MemberExpression') return;

			const method = getPropertyName(callee.property as AnyNode | undefined);
			const target = expressionPath(callee.object as AnyNode | undefined);
			if (!method || !target || !mutatingCollectionMethods.has(method)) return;
			if (!stateNames.has(rootName(target))) return;

			pushUniqueWrite(writes, {
				target,
				operation: 'call',
				method,
				span: sourceSpan(candidate),
			});
		}
	});

	return writes;
}

function collectLocalRuntimeAliases(
	handler: AnyNode | null | undefined,
	eventParam: string | null,
): ReadonlyMap<string, LocalRuntimeAlias> {
	const aliases = new Map<string, LocalRuntimeAlias>();

	for (const statement of statementsInHandler(handler)) {
		if (statement.type !== 'VariableDeclaration') continue;

		for (const declarator of asNodes(statement.declarations)) {
			const name = getIdentifierName(declarator.id);
			if (!name) continue;

			const origins = runtimeOrigins(declarator.init as AnyNode | undefined, eventParam);
			if (origins.length === 0) continue;

			aliases.set(name, { name, origins });
		}
	}

	return aliases;
}

function runtimeOrigins(
	node: AnyNode | null | undefined,
	eventParam: string | null,
): ReadonlyArray<string> {
	const origins: string[] = [];

	walk(node, (candidate) => {
		if (
			candidate.type === 'NewExpression' &&
			expressionPath(candidate.callee as AnyNode) === 'FormData'
		) {
			pushUnique(origins, 'FormData');
		}

		const path = expressionPath(candidate);
		if (eventParam && path === `${eventParam}.currentTarget`) {
			pushUnique(origins, 'event.currentTarget');
		}
	});

	return origins;
}

function analyzeGuard(input: {
	readonly node: AnyNode | null | undefined;
	readonly eventParam: string | null;
	readonly stateNames: ReadonlySet<string>;
	readonly localRuntimeAliases: ReadonlyMap<string, LocalRuntimeAlias>;
}): GuardAnalysis {
	const graphReads: string[] = [];
	const eventReads: string[] = [];
	const unsupportedReads: string[] = [];

	walk(input.node, (candidate) => {
		if (candidate.type !== 'MemberExpression') return;

		const path = expressionPath(candidate);
		if (!path) return;

		const root = rootName(path);

		if (input.stateNames.has(root)) {
			pushUnique(graphReads, path);
			return;
		}

		if (input.eventParam && root === input.eventParam) {
			if (allowedEventRead(path, input.eventParam)) {
				pushUnique(eventReads, path);
			} else {
				pushUnique(unsupportedReads, path);
			}
			return;
		}

		const localRuntimeAlias = input.localRuntimeAliases.get(root);
		if (localRuntimeAlias) {
			pushUnique(unsupportedReads, path);
			for (const origin of localRuntimeAlias.origins) pushUnique(unsupportedReads, origin);
		}
	});

	return {
		graphReads,
		eventReads,
		unsupportedReads,
		supported: unsupportedReads.length === 0,
	};
}

function allowedEventRead(path: string, eventParam: string): boolean {
	const field = path.slice(eventParam.length + 1);
	return allowedEventFields.has(field);
}

function eventPolicyMethods(
	node: AnyNode | null | undefined,
	eventParam: string | null,
): ReadonlyArray<SyncPolicyMethod> {
	const methods: SyncPolicyMethod[] = [];

	walk(node, (candidate) => {
		if (candidate.type !== 'CallExpression') return;

		const callee = expressionPath(candidate.callee as AnyNode | undefined);
		if (!eventParam || !callee?.startsWith(`${eventParam}.`)) return;

		const method = callee.slice(eventParam.length + 1);
		if (method === 'preventDefault' || method === 'stopPropagation') {
			pushUnique(methods, method);
		}
	});

	return methods;
}

function statementsInHandler(handler: AnyNode | null | undefined): ReadonlyArray<AnyNode> {
	const body = handler?.body as AnyNode | undefined;
	if (body?.type !== 'BlockStatement') return [];

	return asNodes(body.body);
}

function eventParamName(handler: AnyNode | null | undefined): string | null {
	const firstParam = asNodes(handler?.params)[0];
	return getIdentifierName(firstParam);
}

function getCalleePath(node: AnyNode | null | undefined): string | null {
	if (!node || (node.type !== 'CallExpression' && node.type !== 'NewExpression')) return null;
	return expressionPath(node.callee as AnyNode | undefined);
}

function expressionPath(node: AnyNode | null | undefined): string | null {
	if (!node) return null;

	if (node.type === 'Identifier') {
		return getIdentifierName(node);
	}

	if (node.type === 'MemberExpression') {
		const object = expressionPath(node.object as AnyNode | undefined);
		const property = getPropertyName(node.property as AnyNode | undefined);
		if (!object || !property) return null;

		return `${object}.${property}`;
	}

	if (node.type === 'ChainExpression') {
		return expressionPath(node.expression as AnyNode | undefined);
	}

	return null;
}

function rootName(path: string): string {
	return path.split('.')[0] ?? path;
}

function getIdentifierName(node: unknown): string | null {
	if (!isNode(node) || node.type !== 'Identifier') return null;

	return typeof node.name === 'string' ? node.name : null;
}

function getPropertyName(node: AnyNode | null | undefined): string | null {
	if (!node) return null;

	if (node.type === 'Identifier') return getIdentifierName(node);

	if (node.type === 'Literal') {
		const value = node.value;
		return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
	}

	return null;
}

function sourceForNode(source: string, node: AnyNode | null | undefined): string {
	if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return '';

	return source.slice(node.start, node.end);
}

function sourceSpan(node: AnyNode | null | undefined): SourceSpan | undefined {
	if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return undefined;

	return {
		start: node.start,
		end: node.end,
	};
}

function walk(node: unknown, visit: (node: AnyNode) => void): void {
	if (!isNode(node)) return;

	visit(node);

	for (const [key, value] of Object.entries(node)) {
		if (ignoredWalkKeys.has(key)) continue;

		if (Array.isArray(value)) {
			for (const child of value) walk(child, visit);
			continue;
		}

		if (isNode(value)) walk(value, visit);
	}
}

function asNodes(value: unknown): AnyNode[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is AnyNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string'
	);
}

function unique<T>(values: ReadonlyArray<T>): ReadonlyArray<T> {
	return Array.from(new Set(values));
}

function pushUnique<T>(values: T[], next: T): void {
	if (!values.includes(next)) values.push(next);
}

function pushUniqueWrite(writes: SyncEventLazyWrite[], next: SyncEventLazyWrite): void {
	if (
		writes.some(
			(write) =>
				write.target === next.target &&
				write.operation === next.operation &&
				write.method === next.method,
		)
	) {
		return;
	}

	writes.push(next);
}
