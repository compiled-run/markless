// Settle filler: turns ONE async boundary's arm/row/empty <template> elements
// plus its fill plan into live DOM for a settled value, and splices the result
// between the boundary's comment anchors.
//
// Constraints (T002 ruling section 3.5, T011 checkpoint):
//   - a leaf: no runtime, graph, protocol or DOM-library imports, because it
//     loads before anything else on a prerendered client-fetching page;
//   - data reaches the DOM through textContent/setAttribute ONLY. Never
//     innerHTML: settled values are server-controlled strings and the slot
//     model this replaces has no markup sink;
//   - it never evaluates an expression. A derived hole is a reference to a
//     COMPILED symbol; the caller loads and calls it, this module places the
//     result;
//   - anything it cannot place exactly throws before the splice, so the caller
//     falls back with the pending arm still on screen. Never half-render.
//
// Nearly every byte here executes at load, so failure reasons are short codes
// and the arm, row and empty paths share one filler instead of reading well
// three times over: T014 measured this module as the largest load-path item.

export const SETTLE_PLAN_UNSUPPORTED = 'MARKLESS_SETTLE_PLAN_UNSUPPORTED';

/** A value path into the settled value, or a reference to a compiled symbol. */
export type SettlePlanSource =
	| ReadonlyArray<string>
	| {
			readonly symbolId: string;
			readonly args?: ReadonlyArray<{
				readonly node: string;
				readonly path: ReadonlyArray<string>;
			}>;
	  };

export type SettlePlanHole = {
	readonly coordinate: number;
	readonly kind: 'text' | 'attribute';
	readonly name?: string;
	readonly from: SettlePlanSource;
};

export type SettlePlanBoundary = {
	readonly id: string;
	readonly arm: 'try';
	readonly holes: ReadonlyArray<SettlePlanHole>;
	readonly repeat?: {
		readonly id: string;
		readonly coordinate: number;
		readonly from: ReadonlyArray<string>;
		readonly holes: ReadonlyArray<SettlePlanHole>;
		readonly emptyHoles: ReadonlyArray<SettlePlanHole>;
	};
};

export type SettlePlanInput = {
	readonly plan: SettlePlanBoundary;
	readonly templates: {
		readonly arm: HTMLTemplateElement;
		readonly row?: HTMLTemplateElement | null;
		readonly empty?: HTMLTemplateElement | null;
	};
	/** The settled value. Path holes read from it; rows iterate it. */
	readonly value: unknown;
	/** The boundary's start and end comment anchors, in that order. */
	readonly anchors: readonly [Node, Node];
	/**
	 * Reads one derived-hole argument. The plan names arguments by graph node,
	 * so the caller — which knows the boundary's runner node and the document's
	 * initial state — owns the mapping; this module only orders the reads.
	 */
	readonly read?: (graphNodeId: string, path: ReadonlyArray<string>) => unknown;
	/** Calls one loaded compiled symbol with the resolved argument values. */
	readonly derive?: (symbolId: string, args: ReadonlyArray<unknown>) => unknown;
};

export function marklessApplySettlePlan(input: SettlePlanInput): void {
	const plan = input.plan;
	const fragment = clone(input.templates.arm);
	const holes = holeAnchors(fragment);
	for (const hole of plan.holes) fill(holes, hole, input.value, input);

	const repeat = plan.repeat;
	if (repeat) {
		const slot = take(holes, repeat.coordinate);
		const items = readPath(input.value, repeat.from);
		const rows = slot.ownerDocument!.createDocumentFragment();
		if (Array.isArray(items) && items.length > 0) {
			for (const item of items)
				rows.appendChild(filled(input.templates.row, repeat.holes, item, input));
		} else {
			rows.appendChild(filled(input.templates.empty, repeat.emptyHoles, input.value, input));
		}
		swap(slot, rows);
	}
	// A leftover anchor would shift the comment index the first gesture derives
	// its records from, so an unplaced hole is a failure, not a leftover.
	drained(holes);

	const start = input.anchors[0];
	const end = input.anchors[1];
	const parent = start.parentNode;
	if (!parent || end.parentNode !== parent) unsupported('anchors');
	for (let node = start.nextSibling; node && node !== end; node = start.nextSibling)
		parent.removeChild(node);
	parent.insertBefore(fragment, end);
}

// One template, its own hole set, its own scope: a repeat row and the @empty
// arm differ only in which of the three they are handed.
function filled(
	template: HTMLTemplateElement | null | undefined,
	holes: ReadonlyArray<SettlePlanHole>,
	scope: unknown,
	input: SettlePlanInput,
): DocumentFragment {
	const fragment = clone(template);
	const anchors = holeAnchors(fragment);
	for (const hole of holes) fill(anchors, hole, scope, input);
	drained(anchors);
	return fragment;
}

function fill(
	anchors: Map<number, Comment>,
	hole: SettlePlanHole,
	scope: unknown,
	input: SettlePlanInput,
): void {
	const anchor = take(anchors, hole.coordinate);
	const from = hole.from;
	let value: unknown;
	if (Array.isArray(from)) value = readPath(scope, from);
	else {
		const reference = from as Exclude<SettlePlanSource, ReadonlyArray<string>>;
		const read = input.read;
		const derive = input.derive;
		if (!derive || !read) unsupported('derive');
		value = derive(
			reference.symbolId,
			(reference.args ?? []).map((argument) => read(argument.node, argument.path)),
		);
	}
	const text = value == null ? '' : String(value);
	if (hole.kind === 'attribute') {
		// The anchor sits immediately before the owning element, because a
		// comment cannot live inside an attribute value.
		let owner = anchor.nextSibling;
		while (owner && owner.nodeType !== 1) owner = owner.nextSibling;
		if (!owner || !hole.name) unsupported('attr');
		(owner as Element).setAttribute(hole.name, text);
		anchor.parentNode!.removeChild(anchor);
		return;
	}
	swap(anchor, anchor.ownerDocument!.createTextNode(text));
}

function clone(template: HTMLTemplateElement | null | undefined): DocumentFragment {
	const content = template?.content;
	if (!content) unsupported('template');
	return content.cloneNode(true) as DocumentFragment;
}

function holeAnchors(root: DocumentFragment): Map<number, Comment> {
	const found = new Map<number, Comment>();
	// 128 = NodeFilter.SHOW_COMMENT. Reading it off the global would cost a
	// property lookup this module deliberately does not make.
	const walker = root.ownerDocument!.createTreeWalker(root, 128);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const match = /^mh:(\d+)$/.exec((node as Comment).data);
		if (match) found.set(+match[1]!, node as Comment);
	}
	return found;
}

function take(anchors: Map<number, Comment>, coordinate: number): Comment {
	const anchor = anchors.get(coordinate);
	if (!anchor) unsupported('hole');
	anchors.delete(coordinate);
	return anchor;
}

function drained(anchors: Map<number, Comment>): void {
	if (anchors.size > 0) unsupported('left');
}

function swap(anchor: Node, replacement: Node): void {
	const parent = anchor.parentNode;
	if (!parent) unsupported('orphan');
	parent.insertBefore(replacement, anchor);
	parent.removeChild(anchor);
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path)
		current = current == null ? undefined : (current as Record<string, unknown>)[segment];
	return current;
}

function unsupported(reason: string): never {
	throw Object.assign(new Error(`${SETTLE_PLAN_UNSUPPORTED}: ${reason}`), {
		code: SETTLE_PLAN_UNSUPPORTED,
	});
}
