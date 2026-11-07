import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeDomElement, ResumeDomNode, ResumeViewRecord } from '../resume-types.ts';
import {
	PROTOCOL_ROW_END_COMMENT,
	PROTOCOL_ROW_START_COMMENT,
} from '../../../serializer/src/protocol-page-markers.ts';

// The items of the keyed rows an element sits in, for a callback a row passed the component it renders.
export function marklessRowLocals(
	input: {
		readonly graph: Pick<RuntimeGraph, 'read'>;
		readonly view: Pick<ResumeViewRecord, 'keyedRepeats'>;
		readonly elementsByHostId: Map<string, ResumeDomElement>;
	},
	element: ResumeDomElement,
): Record<string, unknown> | undefined {
	const served = new Map<ResumeDomElement, Record<string, unknown>>();
	for (const repeat of input.view.keyedRepeats ?? []) {
		const parent = input.elementsByHostId.get(repeat.parentHostNodeId);
		let child: ResumeDomElement | null | undefined = element;
		while (child && child.parentElement !== parent) child = child.parentElement;
		if (!parent || !child || !repeat.collectionGraphNodeId || repeat.rowRange) continue;
		const rows = Array.from(parent.childNodes ?? []).filter((node) => node.nodeType === 1);
		const items = Array.from(
			(input.graph.read(repeat.collectionGraphNodeId, repeat.collectionPath) ??
				[]) as Iterable<unknown>,
		);
		// Each row is one root element among the parent's element children, as resume-keyed-repeats places them.
		const first =
			repeat.rowEndOffset === undefined
				? (repeat.rowStartOffset ?? 0)
				: rows.length - repeat.rowEndOffset - items.length;
		const position = rows.indexOf(child) - first;
		const item = position < 0 ? undefined : items[position];
		if (item !== undefined) served.set(child, { ...served.get(child), [repeat.itemName]: item });
	}
	// A row a repeat wired names its own items, including a repeat built in the browser that the page view never listed.
	let locals: Record<string, unknown> = {};
	for (let row: ResumeDomElement | null | undefined = element; row; row = row.parentElement)
		locals = { ...served.get(row), ...row.__marklessRowLocals?.(), ...rangeLocals(row), ...locals };
	return Object.keys(locals).length ? locals : undefined;
}

type Sibling = ResumeDomNode & {
	readonly previousSibling?: Sibling | null;
	readonly data?: string;
	readonly __marklessRowLocals?: () => Record<string, unknown>;
};
// A ranged row tags its start comment, which the row's top-level nodes reach walking back past whole sibling rows.
function rangeLocals(node: ResumeDomNode): Record<string, unknown> | undefined {
	let depth = 0;
	for (let at = (node as Sibling).previousSibling; at; at = at.previousSibling) {
		const data = at.nodeType === 8 ? at.data : undefined;
		if (data === PROTOCOL_ROW_END_COMMENT) depth++;
		else if (data === PROTOCOL_ROW_START_COMMENT && !depth--) return at.__marklessRowLocals?.();
	}
	return undefined;
}
