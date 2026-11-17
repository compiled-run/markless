import { DEVICE_MODULE, targetConstants } from '@markless/serializer/native-device';
import { getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { isEventAttribute } from '../../ast/events.ts';
import { expressionSource } from '../../ast/source.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { ifChainOf } from './if-chain.ts';
import type { DeviceTargetFacts } from '../../artifacts.ts';
import type { WalkState } from './types.ts';

// What `@markless/device` and `platform` are at build time for the target being built: an `@if` they decide keeps one
// arm, and on the web a feature is absent from the output.

export type TargetValue =
	| { readonly known: true; readonly value: unknown }
	| { readonly known: false };

const UNKNOWN: TargetValue = { known: false };

/** The export of `@markless/device` an identifier names, when it resolves to that module-scope import. */
export function deviceExportOf(node: AnyNode | undefined, state: WalkState): string | null {
	if (
		node?.type !== 'Identifier' ||
		typeof node.name !== 'string' ||
		typeof node.start !== 'number'
	)
		return null;
	const semantic = state.semantic();
	const symbol = resolvedSymbolAt(semantic, node.start);
	if (symbol !== null && semantic.scopes[semantic.bindings[symbol]!.scope.id]!.kind !== 'module')
		return null;
	const entry = state.graph.moduleImports.find(
		(item) => item.localName === node.name && !item.typeOnly,
	);
	return entry?.source === DEVICE_MODULE && entry.importedName ? entry.importedName : null;
}

/** The root identifier of a member chain or call (`network` in `network.online`, `haptics` in `haptics.tap()`). */
export function deviceRootOf(node: AnyNode | undefined): AnyNode | undefined {
	let root = node;
	while (
		root?.type === 'MemberExpression' ||
		root?.type === 'CallExpression' ||
		root?.type === 'ChainExpression'
	)
		root = (
			root.type === 'MemberExpression'
				? root.object
				: root.type === 'CallExpression'
					? root.callee
					: root.expression
		) as AnyNode | undefined;
	return root;
}

/** The value of an expression on the build's target, when only literals and target constants decide it. */
export function targetValue(node: AnyNode | undefined, state: WalkState): TargetValue {
	if (!node) return UNKNOWN;
	switch (node.type) {
		case 'ParenthesizedExpression':
		case 'ChainExpression':
		case 'TSAsExpression':
		case 'TSNonNullExpression':
		case 'TSSatisfiesExpression':
			return targetValue(node.expression as AnyNode | undefined, state);
		case 'Literal':
			return typeof node.value === 'object' && node.value !== null
				? UNKNOWN
				: { known: true, value: node.value };
		case 'MemberExpression': {
			const property = (node.property as AnyNode | undefined)?.name;
			const exported = deviceExportOf(node.object as AnyNode | undefined, state);
			if (node.computed || typeof property !== 'string' || exported === null) return UNKNOWN;
			if (state.platformGuardsOnly && state.target === 'web' && exported !== 'platform') return UNKNOWN;
			const fields = targetConstants(state.target)[exported];
			return fields && Object.hasOwn(fields, property)
				? { known: true, value: fields[property] }
				: UNKNOWN;
		}
		case 'UnaryExpression': {
			const operand = targetValue(node.argument as AnyNode | undefined, state);
			return node.operator === '!' && operand.known
				? { known: true, value: !operand.value }
				: UNKNOWN;
		}
		case 'LogicalExpression': {
			const left = targetValue(node.left as AnyNode | undefined, state);
			if (!left.known) return UNKNOWN;
			const decided =
				node.operator === '&&'
					? !left.value
					: node.operator === '||'
						? !!left.value
						: left.value != null;
			return decided ? left : targetValue(node.right as AnyNode | undefined, state);
		}
		case 'BinaryExpression': {
			if (node.operator !== '===' && node.operator !== '!==') return UNKNOWN;
			const left = targetValue(node.left as AnyNode | undefined, state);
			const right = targetValue(node.right as AnyNode | undefined, state);
			if (!left.known || !right.known) return UNKNOWN;
			return {
				known: true,
				value: (left.value === right.value) === (node.operator === '==='),
			};
		}
		case 'ConditionalExpression': {
			const test = targetValue(node.test as AnyNode | undefined, state);
			if (!test.known) return UNKNOWN;
			return targetValue(
				(test.value ? node.consequent : node.alternate) as AnyNode | undefined,
				state,
			);
		}
		default:
			return UNKNOWN;
	}
}

/** True when an expression reads a `@markless/device` constant: only those fold, so literal-only tests keep today's meaning. */
export function readsTargetConstant(node: AnyNode | undefined, state: WalkState): boolean {
	if (!node || typeof node !== 'object') return false;
	if (
		node.type === 'MemberExpression' &&
		deviceExportOf(node.object as AnyNode | undefined, state) !== null
	)
		return true;
	for (const [key, child] of Object.entries(node)) {
		if (key === 'parent' || key === 'loc' || key === 'range') continue;
		if (
			Array.isArray(child)
				? child.some((item) => readsTargetConstant(item as AnyNode, state))
				: child &&
					typeof child === 'object' &&
					typeof (child as AnyNode).type === 'string' &&
					readsTargetConstant(child as AnyNode, state)
		)
			return true;
	}
	return false;
}

/**
 * The arm an `@if` chain shows on this target when target constants decide it (null: none), recorded so markup
 * collection folds the same sites; undefined when the chain stays a live branch.
 */
export function foldedIfArm(node: AnyNode, state: WalkState): number | null | undefined {
	if (state.foldedIfs.has(node)) return state.foldedIfs.get(node);
	const chain = ifChainOf(node);
	if (!chain.tests.some((test) => readsTargetConstant(test, state))) return undefined;
	let chosen: number | null | undefined;
	for (const [index, test] of chain.tests.entries()) {
		const value = targetValue(test, state);
		if (!value.known) return undefined;
		if (value.value) {
			chosen = index;
			break;
		}
	}
	if (chosen === undefined) chosen = chain.arms[chain.tests.length] ? chain.tests.length : null;
	state.foldedIfs.set(node, chosen);
	return chosen;
}

/** A change a web build makes to authored handler code: remove a device call, or write a constant in place of a read. */
export type WebDeviceEdit = { readonly start: number; readonly end: number; readonly text: string };

const isDeviceCallOf = (node: AnyNode | undefined, state: WalkState): boolean =>
	node?.type === 'CallExpression' && deviceExportOf(deviceRootOf(node), state) !== null;

/** True when a statement always leaves its block (`return`, `throw`, or a block ending in one). */
function exits(node: AnyNode | undefined): boolean {
	if (!node) return false;
	if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;
	if (node.type === 'BlockStatement') {
		const body = (node.body as AnyNode[] | undefined) ?? [];
		return exits(body.at(-1));
	}
	return false;
}

/**
 * On the web every `@markless/device` feature is absent. Walks the module as the web will run it (skipping what the
 * target's constants rule out) and records: a device call whose result nothing uses is removed; a read of a target
 * constant is written as that constant; anything else needs an answer the web cannot give and is refused with
 * `MARKLESS_DEVICE_WEB_ABSENT`, unless `answers` is `reject`, when it is left to the web module, which rejects.
 */
export function collectWebDeviceAbsence(
	ast: AnyNode,
	state: WalkState,
	answers: 'build-error' | 'platform-only' | 'reject',
): WebDeviceEdit[] {
	const edits: WebDeviceEdit[] = [];
	const at = (node: AnyNode) => ({ start: node.start as number, end: node.end as number });
	// Names the kept code mentions: a module function only they name runs on the web at all.
	const named = new Set<string>();
	const visitStatements = (statements: ReadonlyArray<AnyNode>) => {
		for (const statement of statements) {
			visit(statement);
			if (statement.type === 'IfStatement') {
				const test = targetValue(statement.test as AnyNode | undefined, state);
				if (
					test.known &&
					exits(
						(test.value ? statement.consequent : statement.alternate) as
							| AnyNode
							| undefined,
					)
				)
					return;
			}
		}
	};
	const visit = (node: AnyNode | undefined): void => {
		if (!node || typeof node !== 'object') return;
		switch (node.type) {
			case 'ImportDeclaration':
				return;
			case 'Identifier':
				if (typeof node.name === 'string') named.add(node.name);
				return;
			case 'JSXIdentifier':
				if (typeof node.name === 'string') named.add(node.name);
				return;
			case 'JSXIfExpression': {
				const folded = state.foldedIfs.get(node);
				if (folded === undefined) break;
				if (folded !== null) visitStatements(armStatementsOf(node, folded));
				return;
			}
			case 'JSXExpressionContainer':
				if (state.foldedTexts.has(node)) return;
				break;
			case 'BlockStatement':
			case 'Program':
				visitStatements((node.body as AnyNode[] | undefined) ?? []);
				return;
			case 'IfStatement':
			case 'ConditionalExpression': {
				const test = targetValue(node.test as AnyNode | undefined, state);
				if (!test.known) break;
				edits.push({ ...at(node.test as AnyNode), text: JSON.stringify(test.value) });
				visit((test.value ? node.consequent : node.alternate) as AnyNode | undefined);
				return;
			}
			case 'ExpressionStatement': {
				const expression = node.expression as AnyNode | undefined;
				const call =
					expression?.type === 'AwaitExpression'
						? (expression.argument as AnyNode | undefined)
						: expression;
				if (isDeviceCallOf(call, state)) {
					edits.push({ ...at(node), text: ';' });
					return;
				}
				break;
			}
			case 'Attribute':
			case 'JSXAttribute': {
				// An event handler's result is never used, so `onClick={() => haptics.tap()}` loses its call.
				const name = getIdentifierName(node.name as AnyNode | undefined);
				let handler = node.value as AnyNode | undefined;
				if (handler?.type === 'JSXExpressionContainer')
					handler = handler.expression as AnyNode | undefined;
				const body =
					handler?.type === 'ArrowFunctionExpression'
						? (handler.body as AnyNode | undefined)
						: undefined;
				if (
					name &&
					isEventAttribute(name) &&
					body &&
					body.type !== 'BlockStatement' &&
					isDeviceCallOf(body, state)
				) {
					edits.push({ ...at(body), text: 'void 0' });
					return;
				}
				break;
			}
			case 'MemberExpression':
			case 'CallExpression': {
				if (deviceExportOf(deviceRootOf(node), state) === null) break;
				const value = targetValue(node, state);
				if (value.known) {
					edits.push({ ...at(node), text: JSON.stringify(value.value) });
					return;
				}
				if (answers !== 'reject') refuseOnWeb(node, state);
				return;
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			if (Array.isArray(child)) for (const item of child) visit(item as AnyNode);
			else if (
				child &&
				typeof child === 'object' &&
				typeof (child as AnyNode).type === 'string'
			)
				visit(child as AnyNode);
		}
	};
	// Module functions run only when kept code names them (a component rendered from a kept arm); exported ones always.
	const functions = new Map<string, AnyNode>();
	for (const statement of (ast.body as AnyNode[] | undefined) ?? []) {
		const declaration = statement.type === 'FunctionDeclaration' ? statement : undefined;
		const name = (declaration?.id as AnyNode | undefined)?.name;
		if (typeof name === 'string') functions.set(name, statement);
		else visit(statement);
	}
	const visited = new Set<string>();
	for (let changed = true; changed;) {
		changed = false;
		for (const [name, declaration] of functions) {
			if (visited.has(name) || !(named.has(name) || exported(name, ast))) continue;
			visited.add(name);
			changed = true;
			visit(declaration);
		}
	}
	return edits;
}

function exported(name: string, ast: AnyNode): boolean {
	return ((ast.body as AnyNode[] | undefined) ?? []).some((statement) => {
		if (
			statement.type === 'ExportDefaultDeclaration' ||
			statement.type === 'ExportNamedDeclaration'
		) {
			const declaration = statement.declaration as AnyNode | undefined;
			if ((declaration?.id as AnyNode | undefined)?.name === name) return true;
			return ((statement.specifiers as AnyNode[] | undefined) ?? []).some(
				(specifier) => (specifier.local as AnyNode | undefined)?.name === name,
			);
		}
		return false;
	});
}

function armStatementsOf(node: AnyNode, arm: number): AnyNode[] {
	const body = ifChainOf(node).arms[arm];
	if (!body) return [];
	return body.type === 'BlockStatement' ? ((body.body as AnyNode[] | undefined) ?? []) : [body];
}

function refuseOnWeb(node: AnyNode, state: WalkState): void {
	const start = node.start as number;
	if (
		state.graph.diagnostics.some(
			(d) => d.code === 'MARKLESS_DEVICE_WEB_ABSENT' && d.primarySpan?.start === start,
		)
	)
		return;
	const root = deviceRootOf(node);
	const name = deviceExportOf(root, state) ?? 'a device feature';
	state.graph.diagnostics.push({
		code: 'MARKLESS_DEVICE_WEB_ABSENT',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'A device feature is absent on the web',
		message: `\`${expressionSource(node, state.source)}\` needs an answer from \`${name}\`, which a web build does not have; ${state.platformGuardsOnly ? 'put it inside a `platform` check, such as `@if (!platform.web)`' : `check \`${name}.supported\` first`}`,
		why: 'On the web, @markless/device features are absent: there is no value to show or wait for.',
		primarySpan: { filename: state.filename, start, end: node.end as number },
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Wrap it in @if (${name}.supported) { ... } in markup, or start the handler with if (!${name}.supported) return;`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_DEVICE_WEB_ABSENT',
	});
}

/**
 * Components this target never renders: not exported, never named by code the target keeps, and named by an arm the
 * target's constants removed. The analysis skips them, so no output carries their markup or code.
 */
export function componentsAbsentOnTarget(
	statements: ReadonlyArray<AnyNode>,
	state: WalkState,
): ReadonlySet<string> {
	const kept = new Set<string>();
	const removed = new Set<string>();
	const names = (node: AnyNode | undefined, into: Set<string>): void => {
		if (!node || typeof node !== 'object') return;
		if (
			(node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
			typeof node.name === 'string'
		)
			into.add(node.name);
		if (node.type === 'JSXIfExpression' && into === kept) {
			const folded = foldedIfArm(node, state);
			if (folded !== undefined) {
				const chain = ifChainOf(node);
				chain.arms.forEach((arm, index) => names(arm, index === folded ? kept : removed));
				for (const test of chain.tests) names(test, kept);
				return;
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			if (Array.isArray(child)) for (const item of child) names(item as AnyNode, into);
			else if (
				child &&
				typeof child === 'object' &&
				typeof (child as AnyNode).type === 'string'
			)
				names(child as AnyNode, into);
		}
	};
	const functions = new Map<string, AnyNode>();
	for (const statement of statements) {
		if (statement.type === 'ImportDeclaration') continue;
		const name =
			statement.type === 'FunctionDeclaration'
				? (statement.id as AnyNode | undefined)?.name
				: undefined;
		if (typeof name === 'string') functions.set(name, statement);
		else names(statement, kept);
	}
	const visited = new Set<string>();
	for (let changed = true; changed;) {
		changed = false;
		for (const [name, declaration] of functions)
			if (!visited.has(name) && kept.has(name)) {
				visited.add(name);
				changed = true;
				names(declaration, kept);
			}
	}
	return new Set([...functions.keys()].filter((name) => !visited.has(name) && removed.has(name)));
}

/** What a Node build passes as `deviceTargetFacts`; the browser's in-page compiler does not, so it never bundles this. */
export const DEVICE_TARGET_FACTS: DeviceTargetFacts = {
	foldedIfArm: foldedIfArm as DeviceTargetFacts['foldedIfArm'],
	foldedText: ((node: AnyNode, state: WalkState) => {
		const expression = node.expression as AnyNode | undefined;
		const value = targetValue(expression, state);
		return value.known && readsTargetConstant(expression, state)
			? value.value == null
				? ''
				: String(value.value)
			: undefined;
	}) as DeviceTargetFacts['foldedText'],
	componentsAbsentOnTarget:
		componentsAbsentOnTarget as DeviceTargetFacts['componentsAbsentOnTarget'],
	collectWebDeviceAbsence:
		collectWebDeviceAbsence as DeviceTargetFacts['collectWebDeviceAbsence'],
	deviceObjectOf: deviceObjectOf as DeviceTargetFacts['deviceObjectOf'],
	collectDeviceObjects: collectDeviceObjects as DeviceTargetFacts['collectDeviceObjects'],
};

/** A device object a component makes (`const cam = camera()`): owned by that component, never rebuilt by a handler. */
export type DeviceObjectFact = {
	readonly name: string;
	readonly componentName: string;
	/** The `@markless/device` export that made it: `camera`. */
	readonly device: string;
	readonly bindingStart: number;
};

/** The device export a declarator's initializer calls to make a device object, or null. */
export function deviceObjectOf(init: AnyNode | undefined, state: WalkState): string | null {
	if (init?.type !== 'CallExpression') return null;
	const callee = init.callee as AnyNode | undefined;
	return callee?.type === 'Identifier' ? deviceExportOf(callee, state) : null;
}

/** Every component's device objects, from its body's `const name = device()` declarations. */
export function collectDeviceObjects(statements: ReadonlyArray<AnyNode>, state: WalkState): DeviceObjectFact[] {
	const facts: DeviceObjectFact[] = [];
	for (const statement of statements) {
		const declaration = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
			? (statement.declaration as AnyNode | undefined)
			: statement;
		const componentName = (declaration?.id as AnyNode | undefined)?.name;
		const body = (declaration?.body as AnyNode | undefined)?.body as AnyNode[] | undefined;
		if (declaration?.type !== 'FunctionDeclaration' || typeof componentName !== 'string' || !body) continue;
		for (const inner of body) {
			if (inner.type !== 'VariableDeclaration' || inner.kind !== 'const') continue;
			for (const declarator of (inner.declarations as AnyNode[] | undefined) ?? []) {
				const id = declarator.id as AnyNode | undefined;
				const device = deviceObjectOf(declarator.init as AnyNode | undefined, state);
				if (device && id?.type === 'Identifier' && typeof id.name === 'string' && typeof id.start === 'number')
					facts.push({ name: id.name, componentName, device, bindingStart: id.start });
			}
		}
	}
	return facts;
}
