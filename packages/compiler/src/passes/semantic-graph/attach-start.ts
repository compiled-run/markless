import { isEventAttribute } from '../../ast/events.ts';
import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isSpreadAttribute,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import { PROJECTION_PROP_NAME } from '../public-render/shared-seed-pass.ts';
import { attachNoStartTriggerDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

// A component, a spread or projected children inside could carry the starting handler, so each keeps this quiet.
export function collectAttachStartDiagnostic(
	node: AnyNode,
	tagName: string,
	state: WalkState,
): void {
	const attach = getElementAttributes(node).find(
		(attribute) =>
			!isSpreadAttribute(attribute) &&
			getIdentifierName(attribute.name as AnyNode | undefined) === 'attach',
	);
	const value = unwrapExpressionContainer(attach?.value as AnyNode | undefined);
	// A row the browser mints starts its attach on insert, so rows are left alone.
	if (!value || state.currentKeyedRepeatScopeIds.length > 0 || mayStartAttach(node)) return;
	state.graph.diagnostics.push(attachNoStartTriggerDiagnostic(tagName, value, state));
}

function mayStartAttach(root: AnyNode): boolean {
	let starts = false;
	walkNode(root, (node) => {
		if (starts) return;
		if (node.type === 'JSXExpressionContainer') {
			starts = isProjectedChildren(node.expression as AnyNode | undefined);
			return;
		}
		if (node.type !== 'Element' && node.type !== 'JSXElement') return;
		const tagName = getElementTagName(node);
		if (tagName && !isHostTagName(tagName)) {
			starts = true;
			return;
		}
		starts = asNodes(getElementAttributes(node)).some((attribute) => {
			if (isSpreadAttribute(attribute)) return true;
			const name = getIdentifierName(attribute.name as AnyNode | undefined);
			return !!name && isEventAttribute(name);
		});
	});
	return starts;
}

export function isProjectedChildren(value: AnyNode | undefined): boolean {
	if (!value) return false;
	if (getIdentifierName(value) === PROJECTION_PROP_NAME) return true;
	return (
		value.type === 'MemberExpression' &&
		getIdentifierName(value.property as AnyNode | undefined) === PROJECTION_PROP_NAME
	);
}
