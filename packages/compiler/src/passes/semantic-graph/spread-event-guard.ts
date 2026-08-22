// Guard `spread-event-shadow`: an element that carries both a props spread and
// its own handler for some event must destructure that event prop out of the
// props signature. Otherwise the consumer's handler for that event arrives
// inside the spread object and the element's own handler silently stands in its
// place. The check is syntactic: it reads the component signature and the
// element's attributes, and needs no type information.
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isSpreadAttribute,
} from '../../ast/tsrx.ts';
import { isEventAttribute } from 'yuku-tsrx';
import type { SemanticGraphDiagnostic } from '../../artifacts.ts';
import { spreadEventShadowDiagnostic } from './diagnostics.ts';

/**
 * The props signature a spread can carry consumer props through: the component's
 * first parameter written as an object pattern with a rest binding. The rest
 * name is what an element spreads, and the named properties are what the author
 * already took out of it.
 */
export type PropsRestSignature = {
	readonly restName: string;
	readonly destructuredNames: ReadonlySet<string>;
};

export function propsRestSignature(component: AnyNode): PropsRestSignature | undefined {
	const firstParam = asNodes(component.params)[0];
	if (!firstParam || firstParam.type !== 'ObjectPattern') return undefined;

	const destructuredNames = new Set<string>();
	let restName: string | undefined;
	for (const property of asNodes(firstParam.properties)) {
		if (property.type === 'RestElement') {
			const name = getIdentifierName(property.argument as AnyNode | undefined);
			if (name) restName = name;
			continue;
		}
		const name = getIdentifierName(property.key as AnyNode | undefined);
		if (name) destructuredNames.add(name);
	}
	return restName ? { restName, destructuredNames } : undefined;
}

export function collectSpreadEventShadowDiagnostics(input: {
	readonly component: AnyNode;
	readonly componentName: string;
	readonly filename: string;
}): ReadonlyArray<SemanticGraphDiagnostic> {
	const signature = propsRestSignature(input.component);
	if (!signature) return [];

	const diagnostics: SemanticGraphDiagnostic[] = [];
	const visit = (node: AnyNode): void => {
		for (const child of childNodes(node)) visit(child);
		const tagName = getElementTagName(node);
		if (!tagName || !isHostTagName(tagName)) return;

		const attributes = getElementAttributes(node);
		// Only a spread of the props rest binding can carry consumer props; any
		// other object is the author's own and shadows nothing they did not write.
		const spread = attributes.find(
			(attribute) =>
				isSpreadAttribute(attribute) &&
				getIdentifierName(
					(attribute.argument ?? attribute.value) as AnyNode | undefined,
				) === signature.restName,
		);
		if (!spread) return;

		for (const attribute of attributes) {
			if (isSpreadAttribute(attribute)) continue;
			const name = getIdentifierName(attribute.name as AnyNode | undefined);
			if (!name || !isEventAttribute(name)) continue;
			if (signature.destructuredNames.has(name)) continue;
			diagnostics.push(
				spreadEventShadowDiagnostic({
					componentName: input.componentName,
					eventPropName: name,
					restName: signature.restName,
					tagName,
					span: sourceSpan(attribute, input.filename),
					filename: input.filename,
				}),
			);
		}
	};

	visit(input.component.body as AnyNode);
	return diagnostics;
}
