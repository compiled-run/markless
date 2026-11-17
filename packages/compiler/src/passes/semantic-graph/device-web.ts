import { DEVICE_MODULE } from '@markless/serializer/native-device';
import type { AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { WalkState } from './types.ts';

// A web build cannot follow a live device value or ask the device during a server render yet: whether a page may
// subscribe with no element owning it is an open owner decision (docs/goals/native-targets-api/device-contract.md).

/** The `@markless/device` import an expression's root name binds to, when it binds to one at module scope. */
function deviceImportOf(node: AnyNode | undefined, state: WalkState): string | null {
	let root = node;
	while (
		root?.type === 'MemberExpression' ||
		root?.type === 'CallExpression' ||
		root?.type === 'AwaitExpression'
	)
		root = (
			root.type === 'MemberExpression'
				? root.object
				: root.type === 'CallExpression'
					? root.callee
					: root.argument
		) as AnyNode | undefined;
	if (
		root?.type !== 'Identifier' ||
		typeof root.name !== 'string' ||
		typeof root.start !== 'number'
	)
		return null;
	const semantic = state.semantic();
	const symbol = resolvedSymbolAt(semantic, root.start);
	if (symbol !== null && semantic.scopes[semantic.bindings[symbol]!.scope.id]!.kind !== 'module')
		return null;
	const entry = state.graph.moduleImports.find(
		(item) => item.localName === root.name && !item.typeOnly,
	);
	return entry?.source === DEVICE_MODULE ? root.name : null;
}

function refuse(node: AnyNode, message: string, state: WalkState): void {
	const span = sourceSpan(node, state.filename);
	if (
		state.graph.diagnostics.some(
			(d) =>
				d.code === 'MARKLESS_DEVICE_WEB_UNSUPPORTED' &&
				d.primarySpan?.start === span?.start,
		)
	)
		return;
	state.graph.diagnostics.push({
		code: 'MARKLESS_DEVICE_WEB_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'This device feature has no web build yet',
		message,
		why: 'A web page cannot follow a device value or ask the device before the browser has it; how it should is an open design decision.',
		primarySpan: span,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{ message: 'Call device features from an event handler on the web for now.' },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_DEVICE_WEB_UNSUPPORTED',
	});
}

/** Refuses, on a web build, markup that reads a live value of a `@markless/device` import. */
export function refuseDeviceValueOnWeb(node: AnyNode, state: WalkState): void {
	if (state.nativeFacts) return;
	const name = deviceImportOf(node, state);
	if (name)
		refuse(
			node,
			`\`${name}\` from ${DEVICE_MODULE} is read in markup, which a web build cannot follow yet`,
			state,
		);
}

/** Refuses, on a web build, an async computed whose value is a `@markless/device` ask. */
export function refuseDeviceAskOnWeb(body: AnyNode | undefined, state: WalkState): void {
	if (state.nativeFacts || body?.async !== true) return;
	const inner = body.body as AnyNode | undefined;
	const statements =
		inner?.type === 'BlockStatement' ? (inner.body as AnyNode[] | undefined) : undefined;
	const value =
		inner?.type === 'BlockStatement'
			? statements?.length === 1 && statements[0]?.type === 'ReturnStatement'
				? (statements[0].argument as AnyNode | undefined)
				: undefined
			: inner;
	const name = deviceImportOf(value, state);
	if (name && value)
		refuse(
			value,
			`an async computed asks \`${name}\` from ${DEVICE_MODULE}, which a server render cannot ask yet`,
			state,
		);
}
