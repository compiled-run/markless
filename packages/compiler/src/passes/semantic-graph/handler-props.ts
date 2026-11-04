import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import {
	getComponentFunction,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isSpreadAttribute,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import { resolveImportedChildComponent } from './collect-components.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { WalkState } from './types.ts';

/** Every prop: a handler that reads the props object whole, or hands it on, reads them all. */
export const EVERY_PROP = '*';

type Forward = {
	readonly childComponentName: string;
	readonly importSource?: string;
	readonly attributeName: string;
	readonly propNames: ReadonlySet<string>;
};

// Per compile: the analyzer's module is shared by compiles that differ in the interfaces they import.
const byCompile = new WeakMap<WalkState, ReadonlyMap<string, ReadonlySet<string>>>();

/**
 * The props each component of this module reads in an event handler, directly or
 * through a child it hands them to (in this module, or one whose interface
 * publishes the same answer). Read off the analyzer's captures, so a name a
 * handler shadows never counts.
 */
export function moduleHandlerProps(state: WalkState): ReadonlyMap<string, ReadonlySet<string>> {
	const semantic = state.semantic();
	const known = byCompile.get(state);
	if (known) return known;
	const own = new Map<string, Set<string>>();
	const forwards = new Map<string, Forward[]>();
	for (const statement of asNodes(semantic.ast.body as unknown)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const props = propBindings(component.node, semantic);
		const reads = new Set<string>();
		const passed: Forward[] = [];
		visitMarkup(component.node.body as AnyNode | undefined, (element) => {
			const tagName = getElementTagName(element);
			if (!tagName) return;
			const host = isHostTagName(tagName);
			const child = host ? undefined : childComponent(tagName, state);
			for (const attribute of getElementAttributes(element)) {
				if (isSpreadAttribute(attribute)) {
					// A spread hands the child every prop it carries, under the child's own names.
					const spread = propReadsIn(attribute.argument as AnyNode, props, semantic);
					if (child && spread.has(EVERY_PROP))
						passed.push({ ...childTarget(child), attributeName: EVERY_PROP, propNames: spread });
					continue;
				}
				const name = getIdentifierName(attribute.name as AnyNode | undefined);
				const value = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
				if (!name || !value) continue;
				if (host) {
					if (!/^on[A-Z]/.test(name)) continue;
					const handler = handlerFunction(value, semantic);
					const handled = handler
						? capturedProps(handler, props, semantic)
						: propReadsIn(value, props, semantic);
					for (const prop of handled) reads.add(prop);
					continue;
				}
				const propNames = propReadsIn(value, props, semantic);
				if (propNames.size > 0)
					passed.push({ ...childTarget(child!), attributeName: name, propNames });
			}
		});
		own.set(component.name, reads);
		forwards.set(component.name, passed);
	}
	for (let grew = true; grew; ) {
		grew = false;
		for (const [componentName, passed] of forwards)
			for (const forward of passed) {
				const childReads = forward.importSource
					? importedHandlerProps(state, forward.importSource, forward.childComponentName)
					: own.get(forward.childComponentName);
				if (!childReads?.size) continue;
				if (
					forward.attributeName !== EVERY_PROP &&
					!childReads.has(forward.attributeName) &&
					!childReads.has(EVERY_PROP)
				)
					continue;
				const reads = own.get(componentName)!;
				const gained = forward.attributeName === EVERY_PROP ? childReads : forward.propNames;
				for (const prop of gained)
					if (!reads.has(prop)) {
						reads.add(prop);
						grew = true;
					}
			}
	}
	byCompile.set(state, own);
	return own;
}

/** The props a component placed by `childComponentName` reads in a handler, as its own module published them. */
export function childHandlerProps(
	state: WalkState,
	childComponentName: string,
	importSource: string | undefined,
): ReadonlySet<string> | undefined {
	return importSource
		? importedHandlerProps(state, importSource, childComponentName)
		: moduleHandlerProps(state).get(childComponentName);
}

// A member tag off a local object names that object's component, as component edges resolve it.
function childComponent(tagName: string, state: WalkState) {
	return resolveImportedChildComponent(state.memberTagTargets.get(tagName) ?? tagName, state);
}

function childTarget(child: ReturnType<typeof childComponent>) {
	return {
		childComponentName: child.childComponentName,
		...(child.importSource.importSource ? { importSource: child.importSource.importSource } : {}),
	};
}

function importedHandlerProps(
	state: WalkState,
	importSource: string,
	componentName: string,
): ReadonlySet<string> | undefined {
	const props = state.importedModuleInterfaces[importSource]?.render.components.find(
		(component) => component.componentName === componentName,
	)?.handlerProps;
	return props ? new Set(props) : undefined;
}

// Each local the signature binds a prop to, with the prop it holds; the props object itself holds every prop.
function propBindings(component: AnyNode, semantic: ModuleSemantics): ReadonlyMap<number, string> {
	const bindings = new Map<number, string>();
	const parameter = asNodes(component.params)[0];
	const bind = (node: AnyNode | undefined, prop: string) => {
		const local = node?.type === 'AssignmentPattern' ? (node.left as AnyNode) : node;
		const binding = local?.type === 'Identifier' ? semantic.bindingOf(local as never) : null;
		if (binding) bindings.set(binding.id, prop);
	};
	if (parameter?.type !== 'ObjectPattern') {
		bind(parameter, EVERY_PROP);
		return bindings;
	}
	for (const property of asNodes(parameter.properties)) {
		if (property.type === 'RestElement') bind(property.argument as AnyNode, EVERY_PROP);
		else if (property.computed !== true)
			bind(property.value as AnyNode, getIdentifierName(property.key as AnyNode) ?? EVERY_PROP);
	}
	return bindings;
}

// Every markup element under a component body.
function visitMarkup(node: AnyNode | undefined, visit: (element: AnyNode) => void): void {
	if (!node) return;
	if (node.type === 'Element' || node.type === 'JSXElement') visit(node);
	for (const child of childNodes(node)) visitMarkup(child, visit);
}

// The function an `on*` attribute runs: written inline, or a local the body declares once.
function handlerFunction(value: AnyNode, semantic: ModuleSemantics): AnyNode | null {
	if (isFunction(value)) return value;
	if (value.type !== 'Identifier') return null;
	const binding = semantic.bindingOf(value as never);
	if (!binding || binding.declarations.length !== 1) return null;
	const declared = binding.declarations[0] as unknown as AnyNode;
	const parent = semantic.parentOf(declared as never) as unknown as AnyNode | null;
	if (parent?.type === 'FunctionDeclaration') return parent;
	const init = parent?.type === 'VariableDeclarator' ? (parent.init as AnyNode | undefined) : undefined;
	return init && isFunction(init) ? init : null;
}

function capturedProps(
	handler: AnyNode,
	props: ReadonlyMap<number, string>,
	semantic: ModuleSemantics,
): Set<string> {
	const names = new Set<string>();
	for (const capture of semantic.capturesOf(handler as never)) {
		const prop = props.get(capture.binding.id);
		if (prop === undefined) continue;
		for (const reference of capture.references)
			names.add(prop === EVERY_PROP ? memberRead(reference.node as unknown as AnyNode, semantic) : prop);
	}
	return names;
}

// The props an expression a parent hands its child reads.
function propReadsIn(
	value: AnyNode,
	props: ReadonlyMap<number, string>,
	semantic: ModuleSemantics,
): Set<string> {
	const names = new Set<string>();
	const visit = (node: AnyNode): void => {
		if (node.type === 'Identifier') {
			const binding = semantic.referenceOf(node as never)?.binding;
			const prop = binding ? props.get(binding.id) : undefined;
			if (prop !== undefined) names.add(prop === EVERY_PROP ? memberRead(node, semantic) : prop);
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(value);
	return names;
}

// `props.name` reads one prop; any other use of the props object reads them all.
function memberRead(reference: AnyNode, semantic: ModuleSemantics): string {
	const parent = semantic.parentOf(reference as never) as unknown as AnyNode | null;
	if (parent?.type !== 'MemberExpression' || parent.object !== reference || parent.computed === true)
		return EVERY_PROP;
	return getIdentifierName(parent.property as AnyNode | undefined) ?? EVERY_PROP;
}

function isFunction(node: AnyNode): boolean {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

/**
 * The first component a `@for` row renders that hands the row's item to a prop
 * its handlers read, as `Tag.prop`. Those rows need their collection on the
 * graph, or the handler reads the prop of a row resume never matched to an item.
 */
export function rowChildHandlerName(
	forNode: AnyNode,
	itemName: string,
	state: WalkState,
): string | null {
	const semantic = state.semantic();
	const rowSymbols = new Set(
		[forItemDeclaration(forNode, itemName), forNode.index as AnyNode | undefined].flatMap((node) => {
			const declared = typeof node?.start === 'number' ? semantic.nodeAt(node.start) : null;
			const binding = declared ? semantic.bindingOf(declared as never) : null;
			return binding ? [binding.id] : [];
		}),
	);
	if (rowSymbols.size === 0) return null;
	const readsRow = (node: AnyNode): boolean =>
		(node.type === 'Identifier' &&
			typeof node.start === 'number' &&
			rowSymbols.has(resolvedSymbolAt(semantic, node.start) ?? -1)) ||
		childNodes(node).some(readsRow);
	let found: string | null = null;
	visitMarkup(forNode.body as AnyNode | undefined, (element) => {
		const tagName = getElementTagName(element);
		if (found || !tagName || isHostTagName(tagName)) return;
		const child = childComponent(tagName, state);
		const reads = childHandlerProps(state, child.childComponentName, child.importSource.importSource);
		if (!reads) return;
		for (const attribute of getElementAttributes(element)) {
			if (isSpreadAttribute(attribute)) {
				if (reads.size > 0 && readsRow(attribute.argument as AnyNode)) found = `${tagName}.*`;
				if (found) return;
				continue;
			}
			const name = getIdentifierName(attribute.name as AnyNode | undefined);
			const value = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
			if (!name || !value || !(reads.has(name) || reads.has(EVERY_PROP)) || !readsRow(value)) continue;
			found = `${tagName}.${name}`;
			return;
		}
	});
	return found;
}

function forItemDeclaration(forNode: AnyNode, itemName: string): AnyNode | undefined {
	const left = forNode.left as AnyNode | undefined;
	if (left?.type !== 'VariableDeclaration') return getIdentifierName(left) === itemName ? left : undefined;
	const id = asNodes(left.declarations)[0]?.id as AnyNode | undefined;
	return getIdentifierName(id) === itemName ? id : undefined;
}
