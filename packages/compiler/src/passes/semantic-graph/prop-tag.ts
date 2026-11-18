import type { AnyNode } from '../../ast/nodes.ts';
import { sourceBindingId } from './collect-aliases.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { WalkState } from './types.ts';

/** The prop of the component being walked that a tag's name resolves to, through the analyzer's binding for that name. */
export function tagRenderedProp(
	tag: AnyNode | undefined,
	state: WalkState,
): ReadonlyArray<string> | undefined {
	if (tag?.type !== 'JSXIdentifier' && tag?.type !== 'Identifier') return undefined;
	if (typeof tag.start !== 'number') return undefined;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, tag.start);
	if (symbolId === null) return undefined;
	const [declaration] = semantic.bindings[symbolId]!.declarations;
	if (typeof declaration?.start !== 'number' || typeof declaration.end !== 'number') return undefined;
	const bindingId = sourceBindingId({ start: declaration.start, end: declaration.end });
	return state.graph.componentPropBindings.find(
		(binding) =>
			binding.componentName === state.currentComponentName && binding.bindingId === bindingId,
	)?.propPath;
}
