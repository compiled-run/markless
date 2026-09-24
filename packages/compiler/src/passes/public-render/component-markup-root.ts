import { childNodes, type AnyNode } from '../../ast/nodes.ts';
import { implicitFragmentRoot } from './template.ts';

// The one markup root per component: markup collection, scope-class minting,
// and style shipping must all agree on it or a component's CSS goes nowhere.
export function componentMarkupRoot(component: AnyNode): AnyNode | null {
	const implicit = implicitFragmentRoot(component);
	if (implicit) return implicit;
	const body = component.body as AnyNode | undefined;
	for (const node of body ? childNodes(body) : []) {
		if (
			node.type === 'Element' ||
			node.type === 'JSXElement' ||
			node.type === 'Fragment' ||
			node.type === 'JSXFragment' ||
			node.type === 'JSXIfExpression' ||
			node.type === 'JSXSwitchExpression' ||
			node.type === 'JSXForExpression' ||
			node.type === 'JSXTryExpression'
		)
			return node;
		if (node.type === 'ReturnStatement') {
			const argument = node.argument as AnyNode | undefined;
			if (argument) return argument;
		}
	}
	return null;
}
