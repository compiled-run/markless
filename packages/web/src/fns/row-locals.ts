import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeDomElement, ResumeViewRecord } from '../resume-types.ts';

// The items of the keyed rows an element sits in, for a callback a row passed the component it renders.
export function marklessRowLocals(
	input: {
		readonly graph: Pick<RuntimeGraph, 'read'>;
		readonly view: Pick<ResumeViewRecord, 'keyedRepeats'>;
		readonly elementsByHostId: Map<string, ResumeDomElement>;
	},
	element: ResumeDomElement,
): Record<string, unknown> | undefined {
	let locals: Record<string, unknown> | undefined;
	for (const repeat of input.view.keyedRepeats ?? []) {
		const parent = input.elementsByHostId.get(repeat.parentHostNodeId);
		let child: ResumeDomElement | null | undefined = element;
		while (child && child.parentElement !== parent) child = child.parentElement;
		if (!parent || !child || !repeat.collectionGraphNodeId) continue;
		const rows = Array.from(parent.childNodes ?? []).filter((node) => node.nodeType === 1);
		const position = rows.indexOf(child) - (repeat.rowStartOffset ?? 0);
		const items = Array.from(
			(input.graph.read(repeat.collectionGraphNodeId, repeat.collectionPath) ??
				[]) as Iterable<unknown>,
		);
		const item =
			position < 0
				? undefined
				: items[Math.floor(position / Math.max(repeat.rowElementCount, 1))];
		if (item !== undefined) (locals ??= {})[repeat.itemName] = item;
	}
	return locals;
}
