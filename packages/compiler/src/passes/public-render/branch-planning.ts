import { isEventAttribute } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import type {
	PublicRenderPlanBranchArmPart,
	SemanticGraphBinding,
} from '../../artifacts.ts';
import type { AssignedHosts } from './host-locators.ts';

export function scopeClassOf(collection: {
	readonly styleScopes: ReadonlyArray<{ readonly scopeId: string }>;
}): string | null {
	return collection.styleScopes[0]?.scopeId ?? null;
}

// Compiles a gated branch arm into render parts: static HTML text plus graph
// read slots. Bails (null) on anything beyond literal attributes, static
// text, and state-resolvable expressions, so unsupported shapes simply keep
// their static render (no symbol gets wired). Arm-scoped flip planning also
// allows keyed @for content (rows rebuild from a graph read at flip time)
// through the `repeats` option.
export function buildBranchArmParts(
	arm: ReadonlyArray<AnyNode>,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
	source: string,
	scopeClass: string | null,
	options?: {
		readonly repeats?: ReadonlyMap<AnyNode, { readonly itemName: string; readonly collectionSource: string }>;
	},
): ReadonlyArray<PublicRenderPlanBranchArmPart> | null {
	const parts: PublicRenderPlanBranchArmPart[] = [];
	const pushText = (text: string): void => {
		const last = parts[parts.length - 1];
		if (last && 'text' in last) {
			parts[parts.length - 1] = { text: last.text + text };
			return;
		}
		parts.push({ text });
	};

	// Static open/close tags share one builder between arm parts and repeat
	// row parts; only the expression handling differs per scope.
	const openTag = (node: AnyNode, tagName: string): string | null => {
		let open = `<${tagName}`;
		let classSeen = false;
		for (const attribute of getElementAttributes(node)) {
			if (isSpreadAttribute(attribute)) return null;
			const name = getIdentifierName(attribute.name as AnyNode | undefined);
			if (!name) return null;
			// Record attributes are runtime wiring, not HTML.
			if (isEventAttribute(name) || name === 'attach' || name === 'el') continue;
			const value = attribute.value as AnyNode | undefined;
			const expression = unwrapExpressionContainer(value);
			const literal = !value
				? ''
				: value.type === 'Literal' && typeof value.value !== 'object'
					? String(value.value)
					: expression?.type === 'Literal' && typeof expression.value !== 'object'
						? String(expression.value)
						: null;
			if (literal === null) return null;
			const scopeSuffix = name === 'class' && scopeClass ? ` ${scopeClass}` : '';
			if (scopeSuffix) classSeen = true;
			open += ` ${name}="${escapeAttribute(literal)}${scopeSuffix}"`;
		}
		if (scopeClass && !classSeen) open += ` class="${scopeClass}"`;
		return `${open}>`;
	};

	const visit = (node: AnyNode, lastChild: boolean): boolean => {
		if (isStaticTextNode(node)) {
			pushText(escapeHtml(trimmedStaticTextValue(node)));
			return true;
		}
		if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
			const expression = node.expression as AnyNode | undefined;
			if (!expression) return false;
			const graph = resolveGraphPath(expressionSource(expression, source), bindings, aliases);
			// State and computed reads both resolve through the live graph at
			// flip/settle time.
			if (!graph || (graph.binding.kind !== 'state' && graph.binding.kind !== 'computed')) {
				return false;
			}
			parts.push({ read: { graphNodeId: graph.binding.id, path: graph.path } });
			return true;
		}
		if (node.type === 'JSXForExpression' && options?.repeats?.has(node)) {
			// Rows repeat per item, so the repeat must be its parent's LAST
			// content child — a sibling after it could not keep a stable
			// arm-relative childNodes path once rows render.
			if (!lastChild || node.empty) return false;
			const repeatPart = buildRepeatPart(node, options.repeats.get(node)!, {
				bindings,
				aliases,
				source,
				openTag,
			});
			if (!repeatPart) return false;
			parts.push(repeatPart);
			return true;
		}
		if (node.type !== 'Element' && node.type !== 'JSXElement') return false;
		const tagName = getElementTagName(node);
		if (!tagName || !isHostTagName(tagName)) return false;
		const open = openTag(node, tagName);
		if (open === null) return false;
		pushText(open);
		const children = asNodes(node.children).filter((child) => !isIgnorableTextNode(child));
		for (const [index, child] of children.entries()) {
			if (!visit(child, index === children.length - 1)) return false;
		}
		pushText(`</${tagName}>`);
		return true;
	};

	const armNodes = arm.filter((node) => !isIgnorableTextNode(node));
	for (const [index, node] of armNodes.entries()) {
		if (!visit(node, index === armNodes.length - 1)) return null;
	}
	return parts;
}

// One repeat part: the collection resolves through the graph at flip time and
// each row rebuilds from static text, item-path reads, and graph reads. Row
// content must stay record-free — per-row events cannot ride arm-relative
// host paths (rows repeat), so their presence bails the whole flip plan.
function buildRepeatPart(
	node: AnyNode,
	repeat: { readonly itemName: string; readonly collectionSource: string },
	context: {
		readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
		readonly aliases: ReturnType<typeof semanticAliasMap>;
		readonly source: string;
		readonly openTag: (node: AnyNode, tagName: string) => string | null;
	},
): Extract<PublicRenderPlanBranchArmPart, { repeat: unknown }> | null {
	const collection = resolveGraphPath(repeat.collectionSource, context.bindings, context.aliases);
	if (!collection || (collection.binding.kind !== 'state' && collection.binding.kind !== 'computed')) {
		return null;
	}

	type RowPart = Extract<PublicRenderPlanBranchArmPart, { repeat: unknown }>['repeat']['rowParts'][number];
	const rowParts: RowPart[] = [];
	const pushRowText = (text: string): void => {
		const last = rowParts[rowParts.length - 1];
		if (last && 'text' in last) {
			rowParts[rowParts.length - 1] = { text: last.text + text };
			return;
		}
		rowParts.push({ text });
	};
	const visitRow = (rowNode: AnyNode): boolean => {
		if (isStaticTextNode(rowNode)) {
			pushRowText(escapeHtml(trimmedStaticTextValue(rowNode)));
			return true;
		}
		if (rowNode.type === 'JSXExpressionContainer' || rowNode.type === 'TSRXExpression') {
			const expression = rowNode.expression as AnyNode | undefined;
			if (!expression) return false;
			const expressionText = expressionSource(expression, context.source);
			if (expressionText === repeat.itemName) {
				rowParts.push({ itemPath: [] });
				return true;
			}
			if (expressionText.startsWith(`${repeat.itemName}.`)) {
				const itemPath = expressionText.slice(repeat.itemName.length + 1).split('.');
				if (itemPath.every((segment) => /^[A-Za-z_$][\w$]*$/.test(segment))) {
					rowParts.push({ itemPath });
					return true;
				}
				return false;
			}
			const graph = resolveGraphPath(expressionText, context.bindings, context.aliases);
			if (!graph || (graph.binding.kind !== 'state' && graph.binding.kind !== 'computed')) {
				return false;
			}
			rowParts.push({ read: { graphNodeId: graph.binding.id, path: graph.path } });
			return true;
		}
		if (rowNode.type !== 'Element' && rowNode.type !== 'JSXElement') return false;
		const tagName = getElementTagName(rowNode);
		if (!tagName || !isHostTagName(tagName)) return false;
		for (const attribute of getElementAttributes(rowNode)) {
			if (isSpreadAttribute(attribute)) return false;
			const name = getIdentifierName(attribute.name as AnyNode | undefined);
			if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return false;
		}
		const open = context.openTag(rowNode, tagName);
		if (open === null) return false;
		pushRowText(open);
		for (const child of asNodes(rowNode.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (!visitRow(child)) return false;
		}
		pushRowText(`</${tagName}>`);
		return true;
	};

	for (const rowNode of asNodes((node.body as AnyNode | undefined)?.body)) {
		if (isIgnorableTextNode(rowNode)) continue;
		if (!visitRow(rowNode)) return null;
	}
	if (rowParts.length === 0) return null;
	return {
		repeat: {
			read: { graphNodeId: collection.binding.id, path: collection.path },
			rowParts,
		},
	};
}

export type BranchSiteNode = {
	readonly node: AnyNode;
	readonly nested: boolean;
	containsNested: boolean;
	readonly conditional: boolean;
	// Inside an @try/@pending/@catch arm: the arm re-renders on every async
	// settle, so the branch renders as a plain re-evaluated ternary (no flip
	// wiring) — dashboard-migration need 8. T104 upgrades non-nested sites to
	// real flips (armFlip) when their content is parts-buildable.
	readonly insideTryArm?: boolean;
	// Inside a @for row: anchors would repeat per row, so no flip plan.
	readonly insideRepeat?: boolean;
};

// Branch sites gate like async boundaries: reactive flipping needs anchors
// that always materialize, so only top-level, non-nested sites with
// record-free plain-host arms (graph-resolvable expressions only) qualify.
export function collectBranchSiteNodes(root: AnyNode): BranchSiteNode[] {
	const found: BranchSiteNode[] = [];
	const branchStack: BranchSiteNode[] = [];

	const visit = (node: AnyNode, conditional: boolean, insideTryArm = false, insideRepeat = false): void => {
		if (node.type === 'JSXIfExpression' || node.type === 'JSXSwitchExpression') {
			const entry: BranchSiteNode = {
				node,
				nested: branchStack.length > 0,
				containsNested: false,
				conditional,
				insideTryArm,
				insideRepeat,
			};
			for (const outer of branchStack) outer.containsNested = true;
			found.push(entry);
			branchStack.push(entry);
			for (const child of childNodes(node)) visit(child, conditional, insideTryArm, insideRepeat);
			branchStack.pop();
			return;
		}
		const entersControlFlow =
			node.type === 'JSXForExpression' || node.type === 'JSXTryExpression';
		for (const child of childNodes(node)) {
			visit(
				child,
				conditional || entersControlFlow,
				insideTryArm || node.type === 'JSXTryExpression',
				insideRepeat || node.type === 'JSXForExpression',
			);
		}
	};

	visit(root, false);
	return found;
}

// Literal case-test values per switch arm (null marks @default); any
// non-literal test disqualifies the site from flip wiring.
export function switchArmTests(node: AnyNode): unknown[] | null {
	const tests: unknown[] = [];
	for (const switchCase of asNodes(node.cases)) {
		const test = switchCase.test as AnyNode | undefined;
		if (!test) {
			tests.push(null);
			continue;
		}
		if (test.type !== 'Literal' || typeof test.value === 'object') return null;
		tests.push(test.value);
	}
	return tests;
}

// Arm hosts are addressed by arm-relative raw childNodes paths (the same
// convention keyed repeat rows use): arms render compact, so every
// non-ignorable child occupies one childNodes slot.
export function collectArmHosts(
	arm: ReadonlyArray<AnyNode>,
	assignedHosts: AssignedHosts,
): ReadonlyArray<{ readonly hostPath: ReadonlyArray<number>; readonly hostNodeId: string }> {
	const hosts: Array<{ hostPath: ReadonlyArray<number>; hostNodeId: string }> = [];
	const visit = (node: AnyNode, path: ReadonlyArray<number>): void => {
		if (node.type !== 'Element' && node.type !== 'JSXElement') return;
		const hostNodeId = assignedHosts.hostIdByNode.get(node);
		if (hostNodeId) hosts.push({ hostPath: path, hostNodeId });
		let childIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			visit(child, [...path, childIndex]);
			childIndex++;
		}
	};
	let index = 0;
	for (const node of arm) {
		if (isIgnorableTextNode(node)) continue;
		visit(node, [index]);
		index++;
	}
	return hosts;
}

export function branchArms(node: AnyNode): AnyNode[][] {
	if (node.type === 'JSXIfExpression') {
		return [node.consequent, node.alternate].map((arm) => {
			const armNode = arm as AnyNode | undefined;
			if (!armNode) return [];
			const children = armNode.type === 'BlockStatement' ? asNodes(armNode.body) : [armNode];
			return children.filter((child) => !isIgnorableTextNode(child));
		});
	}
	return asNodes(node.cases).map((switchCase) =>
		asNodes(switchCase.consequent).filter((child) => !isIgnorableTextNode(child)),
	);
}

export function branchArmSupported(
	arm: ReadonlyArray<AnyNode>,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
	source: string,
): boolean {
	return arm.every(
		(child) =>
			isPlainHostTemplateNode(child) &&
			armNodeRecordFreeAndResolvable(child, bindings, aliases, source),
	);
}

function armNodeRecordFreeAndResolvable(
	node: AnyNode,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
	source: string,
): boolean {
	if (isStaticTextNode(node)) return true;
	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		const expression = node.expression as AnyNode | undefined;
		if (!expression) return false;
		const graph = resolveGraphPath(expressionSource(expression, source), bindings, aliases);
		return !!graph && graph.binding.kind === 'state';
	}
	if (node.type !== 'Element' && node.type !== 'JSXElement') return false;
	// Events, attach behaviors, and element handles are allowed since L4:
	// their records ride the branch record as arm-relative host paths and the
	// resume runtime rewires them on flip. Spreads still disqualify.
	for (const attribute of getElementAttributes(node)) {
		if (isSpreadAttribute(attribute)) return false;
	}
	return asNodes(node.children).every(
		(child) =>
			isIgnorableTextNode(child) ||
			armNodeRecordFreeAndResolvable(child, bindings, aliases, source),
	);
}

// Boundary anchors use flat document-order comment indexes, so a boundary is
// only renderable when its anchors always materialize: top-level (no nesting,
// no conditional control flow) with a statically known @pending shape.
