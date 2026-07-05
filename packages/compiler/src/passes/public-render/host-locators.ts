import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import {
	childrenOpacityDiagnostic,
	conditionalComponentRootDiagnostic,
	noRenderableRootDiagnostic,
	repeatRowStateScopeUnsupportedDiagnostic,
	undeclaredTemplateReadDiagnostic,
	unsupportedRenderBodyDiagnostic,
	unsupportedRenderConstructDiagnostic,
	unsupportedRenderRootDiagnostic,
} from './diagnostics.ts';
import { collectStyleScopes } from './style-scopes.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	PublicRenderPlanAsyncBoundaryGate,
	PublicRenderPlanBranchArmPart,
	PublicRenderPlanBranchGate,
	PublicRenderPlanClassWrite,
	PublicRenderPlanEventControl,
	PublicRenderPlanInput,
	PublicRenderPlanKeyedRepeat,
	PublicRenderPlanRepeatGate,
	PublicRenderPlanStaticEventControl,
	PublicRenderPlanStaticTextWrite,
	PublicRenderPlanTextWrite,
	PublicRenderPlanUnsupportedReason,
	SemanticGraphBinding,
	SemanticKeyedRepeat,
} from '../../artifacts.ts';

export type AssignedHosts = {
	readonly hostIdByNode: ReadonlyMap<AnyNode, string>;
	readonly nodeByHostId: ReadonlyMap<string, AnyNode>;
};

export function assignHostIds(root: AnyNode, hostNodeIds: ReadonlyArray<string>): AssignedHosts {
	const hostIdByNode = new Map<AnyNode, string>();
	const nodeByHostId = new Map<string, AnyNode>();
	let index = 0;

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;

		if (node.type === 'Element' || node.type === 'JSXElement') {
			const tagName = getElementTagName(node);
			const isHost = tagName ? isHostTagName(tagName) : !!getDynamicTagExpression(node);
			if (isHost) {
				const hostNodeId = hostNodeIds[index++];
				if (hostNodeId) {
					hostIdByNode.set(node, hostNodeId);
					nodeByHostId.set(hostNodeId, node);
				}
			}
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return { hostIdByNode, nodeByHostId };
}

export function collectHostPaths(
	root: AnyNode,
	assignedHosts: AssignedHosts,
): ReadonlyMap<string, ReadonlyArray<number>> {
	const hostPathById = new Map<string, ReadonlyArray<number>>();

	const visit = (node: AnyNode | null | undefined, path: ReadonlyArray<number>): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type !== 'Element' && node.type !== 'JSXElement') return;

		const hostNodeId = assignedHosts.hostIdByNode.get(node);
		if (hostNodeId) hostPathById.set(hostNodeId, path);

		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (child.type === 'JSXIfExpression') {
				for (const branchRoot of sameHostConditionalBranchRoots(child)) {
					const branchHostNodeId = assignedHosts.hostIdByNode.get(branchRoot);
					if (branchHostNodeId)
						hostPathById.set(branchHostNodeId, [...path, childDomIndex]);
				}
				childDomIndex++;
				continue;
			}
			if (child.type === 'Element' || child.type === 'JSXElement') {
				visit(child, [...path, childDomIndex]);
				childDomIndex++;
				continue;
			}
			childDomIndex++;
		}
	};

	if (root.type === 'Fragment' || root.type === 'JSXFragment') {
		let rootDomIndex = 0;
		for (const child of asNodes(root.children)) {
			if (isIgnorableTextNode(child)) continue;
			visit(child, [rootDomIndex]);
			rootDomIndex++;
		}
		return hostPathById;
	}

	visit(root, []);
	return hostPathById;
}

function sameHostConditionalBranchRoots(node: AnyNode): ReadonlyArray<AnyNode> {
	const consequent = conditionalStaticTextBranchRoot(node.consequent as AnyNode | undefined);
	const alternate = conditionalStaticTextBranchRoot(node.alternate as AnyNode | undefined);
	if (!consequent || !alternate) return [];
	if (consequent.tagName !== alternate.tagName) return [];
	if (consequent.staticAttributesKey !== alternate.staticAttributesKey) return [];
	return [consequent.node, alternate.node];
}

function conditionalStaticTextBranchRoot(node: AnyNode | undefined): {
	readonly node: AnyNode;
	readonly tagName: string;
	readonly staticAttributesKey: string;
} | null {
	const root = branchSingleOutput(node);
	if (!root || (root.type !== 'Element' && root.type !== 'JSXElement')) return null;
	const tagName = getElementTagName(root);
	if (!tagName || !isHostTagName(tagName)) return null;
	if (singleStaticTextChild(root) === null) return null;
	const staticAttributesKey = staticAttributeKey(root);
	if (staticAttributesKey === null) return null;
	return { node: root, tagName, staticAttributesKey };
}

function branchSingleOutput(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'BlockStatement') {
		const outputs = asNodes(node.body).filter((child) => !isIgnorableTextNode(child));
		return outputs.length === 1 ? branchSingleOutput(outputs[0]) : null;
	}
	if (node.type === 'ExpressionStatement') {
		return branchSingleOutput(node.expression as AnyNode | undefined);
	}
	return node;
}

function singleStaticTextChild(node: AnyNode): string | null {
	const children = asNodes(node.children).filter((child) => !isIgnorableTextNode(child));
	if (children.length !== 1) return null;
	const child = children[0]!;
	if (!isStaticTextNode(child)) return null;
	const value = typeof child.value === 'string' ? child.value : '';
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized === '' ? null : normalized;
}

function staticAttributeKey(node: AnyNode): string | null {
	const attributes: Array<readonly [string, string]> = [];
	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return null;

		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		if (!value) {
			attributes.push([name, 'true']);
			continue;
		}
		if (value.type === 'Literal' && typeof value.value !== 'object') {
			attributes.push([name, String(value.value)]);
			continue;
		}
		if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
			attributes.push([name, String(expression.value)]);
			continue;
		}
		return null;
	}
	return JSON.stringify(attributes);
}

export function collectStaticHostNodeIds(
	root: AnyNode,
	assignedHosts: AssignedHosts,
): ReadonlyArray<string> {
	const hostNodeIds: string[] = [];

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'JSXForExpression') return;

		const hostNodeId = assignedHosts.hostIdByNode.get(node);
		if (hostNodeId) hostNodeIds.push(hostNodeId);

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return hostNodeIds;
}

export function collectStaticEventControls(input: {
	readonly hostPaths: ReadonlyMap<string, ReadonlyArray<number>>;
	readonly payloadEvents: PublicRenderPlanInput['payloadArena']['view']['events'];
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): ReadonlyArray<PublicRenderPlanStaticEventControl> {
	return input.payloadEvents.flatMap((event): PublicRenderPlanStaticEventControl[] => {
		const hostPath = input.hostPaths.get(event.hostNodeId);
		if (!hostPath) return [];

		const symbolIds: string[] = [];
		for (const symbol of input.symbols) {
			if (
				symbol.kind !== 'event-handler' ||
				symbol.hostNodeId !== event.hostNodeId ||
				symbol.eventName !== event.eventName
			) {
				continue;
			}
			symbolIds[symbol.order] = symbol.id;
		}

		return symbolIds.length > 0
			? [
					{
						eventName: event.eventName,
						hostNodeId: event.hostNodeId,
						hostPath,
						symbolIds,
					},
				]
			: [];
	});
}

export function keyedRepeatNodes(root: AnyNode): AnyNode[] {
	const repeats: AnyNode[] = [];
	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'JSXForExpression') repeats.push(node);
		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return repeats;
}

