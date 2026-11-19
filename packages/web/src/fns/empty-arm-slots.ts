import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeDomElement, ResumeDomNode, ResumeKeyedRepeatRecord } from '../resume-types.ts';
import {
	nodeAtPath,
	renderEmptyArm,
	repeatRuntimeError,
	writeAttribute,
	type AttributableNode,
	type MintingDocument,
	type ReplaceableNode,
} from './row-mint.ts';

// An @empty arm showing live values, filled as it is raised and kept current while it shows; only pages holding one load this.
export function marklessEmptyArmSlots() {
	return { renderEmptyArm: renderLiveEmptyArm };
}

let raisedArms = 0;

function renderLiveEmptyArm(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	// Absent where the served arm's shape is matched, which needs only the markup.
	graph?: RuntimeGraph,
	arm?: { readonly nodes: ReadonlyArray<ResumeDomNode> },
): ReadonlyArray<ResumeDomNode> {
	const nodes = renderEmptyArm(parent, repeat);
	if (!graph || !arm) return nodes;
	const { textSlots = [], attributeSlots = [] } = repeat.emptyArm!,
		slots = [...textSlots, ...attributeSlots],
		host = parent.ownerDocument as MintingDocument | undefined,
		// Every path is walked before any fill, as a row's are.
		markers = textSlots.map((slot) => nodeAtPath(nodes, slot.path) as ReplaceableNode | undefined),
		elements = attributeSlots.map(
			(slot) =>
				nodeAtPath(nodes, slot.path) as (AttributableNode & Record<string, unknown>) | undefined,
		);
	if (
		markers.some((marker) => !marker?.replaceWith) ||
		elements.some((element) => !element?.setAttribute) ||
		(markers.length > 0 && !host?.createTextNode)
	)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_EMPTY_ARM_SLOT_MISSING',
			'cannot find where its @empty arm markup shows a live value.',
		);
	const statics = elements.map((element, at) => element!.getAttribute?.(attributeSlots[at]!.name));
	const texts = markers.map((marker) => {
		const text = host!.createTextNode!('') as ResumeDomNode & { textContent?: string | null };
		marker!.replaceWith!(text);
		return text;
	});
	const shown = nodes.map((node) => texts[markers.indexOf(node)] ?? node);
	let values: ReadonlyArray<unknown> = [];
	const refresh = (): void => {
		const next = slots.map((slot) => graph.read(slot.graphNodeId, slot.graphPath));
		for (const [at, value] of next.entries()) {
			if (at < values.length && Object.is(value, values[at])) continue;
			if (at < texts.length) texts[at]!.textContent = String(value ?? '');
			else {
				const slot = at - texts.length;
				writeAttribute(elements[slot]!, attributeSlots[slot]!.name, value, statics[slot]);
			}
		}
		values = next;
	};
	refresh();
	// Released at the first write after the repeat took these nodes back out.
	const raised = raisedArms++;
	const releases = slots.map((slot, at) =>
		graph.subscribe({
			id: `keyed-repeat:${repeat.id}:empty:${raised}:${at}`,
			graphNodeId: slot.graphNodeId,
			path: slot.graphPath,
			run() {
				if (arm.nodes === shown) return refresh();
				for (const release of releases) release();
			},
		}),
	);
	return shown;
}
