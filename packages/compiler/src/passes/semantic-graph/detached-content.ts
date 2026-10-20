import { isEventAttribute } from '../../ast/events.ts';
import {
	PROTOCOL_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE,
	PROTOCOL_RAW_TEXT_TAGS,
	PROTOCOL_TEMPLATE_CONTENT_TAG,
} from '@markless/serializer/protocol';
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import {
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isConstantTextNode,
	isHostTagName,
	isSpreadAttribute,
	isStaticTextNode,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import { detachedContentDynamicDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

/**
 * Which children of a `<tagName>` the parser keeps out of document order: all of a
 * `<template>`'s, or the element children of a raw-text element, whose text stays
 * the element's own. Null for every other element.
 */
export function detachedContentMode(tagName: string): 'all' | 'elements' | null {
	const lower = tagName.toLowerCase();
	if (lower === PROTOCOL_TEMPLATE_CONTENT_TAG) return 'all';
	return PROTOCOL_RAW_TEXT_TAGS.has(lower) ? 'elements' : null;
}

/** `<template shadowrootmode>`: the parser turns it into a shadow root, so the element never reaches the DOM. */
export function isDeclarativeShadowRoot(node: AnyNode, tagName: string): boolean {
	return (
		tagName.toLowerCase() === PROTOCOL_TEMPLATE_CONTENT_TAG &&
		getElementAttributes(node).some(
			(attribute) =>
				!isSpreadAttribute(attribute) &&
				getIdentifierName(attribute.name as AnyNode | undefined)?.toLowerCase() ===
					PROTOCOL_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE,
		)
	);
}

export function isDetachedChild(mode: 'all' | 'elements', child: AnyNode): boolean {
	if (mode === 'all') return true;
	return child.type === 'Element' || child.type === 'JSXElement' || child.type === 'JSXFragment';
}

/**
 * Refuses whatever inside detached content would need the page to find it again:
 * a handler, a binding, a component, control flow, or a value that is not a
 * literal. Static markup passes, and nothing inside gets a host.
 */
export function refuseDynamicDetachedContent(
	node: AnyNode,
	ownerTagName: string,
	state: WalkState,
): void {
	if (isStaticTextNode(node) || isConstantTextNode(node)) return;
	if (node.type === 'JSXFragment') {
		for (const child of asNodes(node.children))
			refuseDynamicDetachedContent(child, ownerTagName, state);
		return;
	}
	const tagName =
		node.type === 'Element' || node.type === 'JSXElement' ? getElementTagName(node) : null;
	if (!tagName || getDynamicTagExpression(node) || !isHostTagName(tagName)) {
		refuse(node, ownerTagName, state);
		return;
	}
	for (const attribute of getElementAttributes(node)) {
		if (isSpreadAttribute(attribute)) {
			refuse(attribute, ownerTagName, state);
			continue;
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const literal =
			!expression ||
			expression.type === 'Literal' ||
			(expression.type === 'TemplateLiteral' && asNodes(expression.expressions).length === 0);
		if (
			!name ||
			isEventAttribute(name) ||
			name === 'attach' ||
			name === 'el' ||
			name === 'overlay' ||
			!literal
		)
			refuse(attribute, ownerTagName, state);
	}
	for (const child of asNodes(node.children))
		refuseDynamicDetachedContent(child, ownerTagName, state);
}

function refuse(node: AnyNode, ownerTagName: string, state: WalkState): void {
	state.graph.diagnostics.push(detachedContentDynamicDiagnostic(node, ownerTagName, state));
}
