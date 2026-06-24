import { asNodes, getIdentifierName, type AnyNode } from './nodes.ts';

export function getElementTagName(node: AnyNode): string | null {
	return (
		getIdentifierName(node.id as AnyNode | undefined) ??
		getIdentifierName((node.openingElement as AnyNode | undefined)?.name as AnyNode | undefined)
	);
}

export function getElementAttributes(node: AnyNode): AnyNode[] {
	const directAttributes = asNodes(node.attributes);
	if (directAttributes.length > 0) return directAttributes;

	return asNodes((node.openingElement as AnyNode | undefined)?.attributes);
}

export function unwrapExpressionContainer(node: AnyNode | undefined): AnyNode | undefined {
	if (node?.type === 'JSXExpressionContainer' || node?.type === 'TSRXExpression') {
		return node.expression as AnyNode | undefined;
	}

	return node;
}

export function isHostTagName(name: string): boolean {
	return name.length > 0 && name[0] === name[0].toLowerCase();
}

export function isStaticTextNode(node: AnyNode): boolean {
	return node.type === 'JSXText' || node.type === 'Literal';
}

export function staticTextValue(node: AnyNode): string {
	const value = typeof node.value === 'string' ? node.value : '';
	const normalized = value.replace(/\s+/g, ' ');
	return normalized.trim() ? normalized : '';
}

export function trimmedStaticTextValue(node: AnyNode): string {
	return staticTextValue(node).trim();
}

export function isIgnorableStaticTextNode(node: AnyNode): boolean {
	return isStaticTextNode(node) && !staticTextValue(node);
}

export function isIgnorableJsxTextNode(node: AnyNode): boolean {
	return node.type === 'JSXText' && typeof node.value === 'string' && node.value.trim() === '';
}

export function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', '&quot;');
}
