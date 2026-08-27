import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { getElementAttributes, unwrapExpressionContainer } from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import { repeatRowBindsName } from './collect-repeat.ts';
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { pureCompositeReadSources } from './composite-reads.ts';
import type { WalkState } from './types.ts';

export type ReactiveRowRead = {
	readonly source: string;
	readonly kind: 'state' | 'computed' | 'prop';
};

// The read set is the one `mintTemplateExpressionComputed` decomposes, so a row
// counts as reactive exactly when the compiler would have minted a reactive
// route for the same expression somewhere the graph can reach it.
const ROW_READ_OPTIONS = { methodCalls: true, unaryOperators: true } as const;

/**
 * The first read inside a `@for` row that a later write can move: a state cell,
 * a computed, a shared-instance member, or a component prop.
 *
 * Only render positions are asked. A handler body runs after the render and its
 * reads are live whatever the rows do, so a function is walked past rather than
 * into; the row's own item and index, and those of any enclosing or nested
 * repeat, are per-row bindings and never count.
 */
export function firstReactiveRowRead(
	forNode: AnyNode,
	state: WalkState,
	rowNames: ReadonlySet<string>,
): ReactiveRowRead | null {
	const scan: Scan = {
		state,
		bindings: graphBindingMap(state.graph, state.currentSharedDefinitionId ?? null),
		aliases: semanticAliasMap(state.graph, state.currentSharedDefinitionId ?? null),
		found: null,
	};
	scanRowNode(forNode.body as AnyNode | undefined, rowNames, scan);
	scanRowNode(forNode.empty as AnyNode | undefined, rowNames, scan);
	return scan.found;
}

/** The names a row owns: the item and the index this `@for` declares. */
export function repeatRowNames(itemName: string, indexName: string | null): ReadonlySet<string> {
	return new Set(indexName ? [itemName, indexName] : [itemName]);
}

type Scan = {
	readonly state: WalkState;
	readonly bindings: ReturnType<typeof graphBindingMap>;
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	found: ReactiveRowRead | null;
};

function scanRowNode(node: AnyNode | undefined, rowNames: ReadonlySet<string>, scan: Scan): void {
	if (!node || scan.found) return;

	switch (node.type) {
		// A handler runs after the render that placed it, so its reads are live
		// however the rows around it were built.
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'FunctionDeclaration':
			return;
		case 'Element':
		case 'JSXElement': {
			for (const attribute of getElementAttributes(node)) {
				scanAttribute(attribute, rowNames, scan);
			}
			for (const child of asNodes(node.children)) scanRowNode(child, rowNames, scan);
			return;
		}
		case 'TSRXExpression':
		case 'JSXExpressionContainer':
			scanRowNode(node.expression as AnyNode | undefined, rowNames, scan);
			return;
		case 'JSXForExpression': {
			// The nested collection is read by the row around it, so the outer names
			// still bind there; only the nested body sees the nested item.
			scanRowNode(node.right as AnyNode | undefined, rowNames, scan);
			const nested = new Set(rowNames);
			for (const name of [nestedItemName(node), getIdentifierName(node.index as AnyNode)]) {
				if (name) nested.add(name);
			}
			scanRowNode(node.body as AnyNode | undefined, nested, scan);
			scanRowNode(node.empty as AnyNode | undefined, nested, scan);
			return;
		}
	}

	const sources = pureCompositeReadSources(node, scan.state, ROW_READ_OPTIONS);
	if (sources) {
		for (const source of sources) classifyRowRead(source, rowNames, scan);
		return;
	}

	for (const child of childNodes(node)) {
		// A property name is not a read of anything.
		if (isPropertyKey(node, child)) continue;
		scanRowNode(child, rowNames, scan);
	}
}

function scanAttribute(attribute: AnyNode, rowNames: ReadonlySet<string>, scan: Scan): void {
	const name = getIdentifierName(attribute.name as AnyNode | undefined);
	if (name && /^on[A-Za-z]/.test(name)) return;

	const value = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
	scanRowNode(value ?? (attribute.argument as AnyNode | undefined), rowNames, scan);
}

function classifyRowRead(source: string, rowNames: ReadonlySet<string>, scan: Scan): void {
	if (scan.found || !source) return;

	const [rootName] = splitStaticGraphPath(source);
	if (rootName && rowNames.has(rootName)) return;
	if (repeatRowBindsName(source, scan.state)) return;

	const resolved =
		resolveGraphPath(source, scan.bindings, scan.aliases) ??
		resolveSharedInstanceGraphPath(source, scan.state.graph, scan.state.currentComponentName);
	const kind = resolved?.binding.kind;
	if (kind !== 'state' && kind !== 'computed' && kind !== 'prop') return;

	scan.found = { source, kind };
}

function nestedItemName(node: AnyNode): string | null {
	const left = node.left as AnyNode | undefined;
	if (!left) return null;
	if (left.type !== 'VariableDeclaration') return getIdentifierName(left);

	const [declaration] = asNodes(left.declarations);
	return getIdentifierName(declaration?.id as AnyNode | undefined);
}

function isPropertyKey(parent: AnyNode, child: AnyNode): boolean {
	return (
		(parent.type === 'Property' || parent.type === 'ObjectProperty') &&
		parent.computed !== true &&
		child === (parent.key as AnyNode | undefined)
	);
}
