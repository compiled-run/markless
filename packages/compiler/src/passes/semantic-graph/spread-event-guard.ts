// The props-rest signature reader: which parameter name an element spreads, and
// which props the author already took out of that rest binding. Read by the
// markup collector to describe a spread host on the module graph interface.
//
// This file used to also refuse a part that spreads its props AND writes its own
// handler for the same event (`MARKLESS_EVENT_SPREAD_SHADOWED`). It no longer
// does: a spread-carried handler MERGES with the part's own, which is what two
// listeners on one element do on the platform. See mergeForwardedEvents in
// passes/protocol-view.ts.
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';

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
