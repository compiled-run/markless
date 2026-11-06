import { asNodes, type AnyNode } from '../../ast/nodes.ts';

/**
 * One `@if ... @else if ... @else` chain, read off the parser's nesting: the
 * parser hands `@else if` back as a JSXIfExpression in the previous link's
 * `alternate`. The chain is ONE branch site with one arm per link plus the
 * final `@else` (an empty arm when there is none), never a site nested in an arm.
 */
export type IfChain = {
	readonly tests: ReadonlyArray<AnyNode>;
	// `tests.length + 1` entries; the last is the final @else or undefined.
	readonly arms: ReadonlyArray<AnyNode | undefined>;
	// The nested JSXIfExpression links, which are not branch sites of their own.
	readonly links: ReadonlyArray<AnyNode>;
};

export function isElseIfLink(alternate: AnyNode | undefined): boolean {
	return alternate?.type === 'JSXIfExpression';
}

export function ifChainOf(node: AnyNode): IfChain {
	const tests: AnyNode[] = [];
	const arms: Array<AnyNode | undefined> = [];
	const links: AnyNode[] = [];
	let link: AnyNode | undefined = node;
	while (link) {
		if (link !== node) links.push(link);
		tests.push(link.test as AnyNode);
		arms.push(link.consequent as AnyNode | undefined);
		const alternate = link.alternate as AnyNode | undefined;
		if (!isElseIfLink(alternate)) {
			arms.push(alternate);
			break;
		}
		link = alternate;
	}
	return { tests, arms, links };
}

/** An arm body's statements: a block's body, or the one node the arm is. */
export function armStatements(arm: AnyNode | undefined): AnyNode[] {
	if (!arm) return [];
	return arm.type === 'BlockStatement' ? asNodes(arm.body) : [arm];
}
