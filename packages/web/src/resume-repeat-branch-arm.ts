import type { RuntimeGraph } from '@markless/runtime';
import { readKeyedRepeatCollection } from './resume-keyed-repeats.ts';
import type {
	ResumeBranchArmEntry,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeRowRoot,
} from './resume-types.ts';

// Rows written straight into an arm share their parent with the other arm, so they follow the arm the branch painted.
export function followBranchArm(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	input: {
		readonly graph: Pick<RuntimeGraph, 'read'>;
		readonly root?: ResumeDomElement;
		readonly storeContainerSubscription: (release: () => void) => void;
	},
	arm: { mounted: boolean; nodes: ReadonlyArray<ResumeDomNode> },
	adopt: (rows: ReadonlyArray<ResumeDomNode>, items: ReadonlyArray<unknown>) => void,
): {
	readonly showing: (rows?: ReadonlyMap<unknown, ResumeRowRoot>) => boolean;
	readonly end: () => ResumeDomNode | undefined;
} | undefined {
	const shown = branchArmEntry(parent, repeat, input.root);
	if (!shown) return undefined;
	// Rows a re-commit of the arm replaced belong to the repeat it wired in their place; rows this repeat took out itself carry their parent.
	const replaced = (rows: ReadonlyArray<ResumeDomElement & { __marklessRowParent?: unknown }>) =>
		!rows.some((row) => row.parentElement === parent) &&
		rows.some((row) => row.__marklessRowParent !== parent);
	// A list straight in an arm never has ranged rows: the compiler keeps those to one element.
	const showing = (rows?: ReadonlyMap<unknown, ResumeRowRoot>) =>
		shown.arm === repeat.branchArm!.arm &&
		!(rows?.size && replaced([...rows.values()] as ResumeDomElement[]));
	// The arm's first own element after the rows: new rows go in front of it.
	let tail: ResumeDomNode | undefined;
	// A refresh marks the rows busy, as it marks a list host inside the arm.
	const source = {
		graphNodeId: repeat.collectionGraphNodeId,
		rows: () => {
			if (!showing()) return [];
			const rows = rowNodes(parent, shown, repeat).filter((node) => node.nodeType === 1);
			const at = tail ? rows.indexOf(tail) : -1;
			return at < 0 ? rows : rows.slice(0, at);
		},
	};
	const sources = ((shown as { rowSources?: Set<typeof source> }).rowSources ??= new Set()).add(source);
	const paint = () => {
		if (shown.start) (shown.start as ArmRowsAnchor).__marklessArmRows = sources;
		const nodes = showing() ? rowNodes(parent, shown, repeat) : [],
			items = nodes.length ? readKeyedRepeatCollection(input.graph, repeat) : [],
			rows = nodes.filter((node) => node.nodeType === 1);
		arm.mounted = nodes.length > 0 && items.length === 0;
		arm.nodes = arm.mounted ? nodes : [];
		tail = arm.mounted ? undefined : rows[items.length];
		adopt(arm.mounted ? [] : rows.slice(0, items.length), items);
	};
	shown.listeners.add(paint);
	input.storeContainerSubscription(() => (shown.listeners.delete(paint), sources.delete(source)));
	paint();
	return { showing, end: () => tail ?? shown.end };
}

export type ArmRowsAnchor = {
	__marklessArmRows?: ReadonlySet<{
		readonly graphNodeId?: string;
		readonly rows: () => ReadonlyArray<ResumeDomNode>;
	}>;
};

export function hiddenBranchArm(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
): boolean {
	const shown = branchArmEntry(parent, repeat);
	return shown?.arm !== undefined && shown.arm !== repeat.branchArm!.arm;
}

// Composition prefixes a record's id and its branch's id alike.
function branchArmEntry(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	root?: ResumeDomElement,
): ResumeBranchArmEntry | undefined {
	const branchId =
		repeat.id.slice(0, repeat.id.lastIndexOf('repeat:')) + repeat.branchArm!.branchId;
	let arms: Map<string, ResumeBranchArmEntry> | undefined;
	for (
		let node: ResumeDomElement | null | undefined = parent;
		node && !arms;
		node = node.parentElement
	)
		arms = node.__marklessBranchArms;
	if (!arms && root) arms = root.__marklessBranchArms ??= new Map();
	let shown = arms?.get(branchId);
	if (arms && !shown) arms.set(branchId, (shown = { listeners: new Set() }));
	return shown;
}

// The record counts rows from the parent's first element, so the arm's own elements in front of them come off first.
function rowNodes(
	parent: ResumeDomElement,
	shown: ResumeBranchArmEntry,
	repeat: ResumeKeyedRepeatRecord,
): ResumeDomNode[] {
	const children = Array.from(parent.childNodes ?? []);
	const from = children.indexOf(shown.start!),
		to = children.indexOf(shown.end!);
	if (from < 0 || to < from) return [];
	let lead =
		repeat.rowEndOffset === undefined
			? (repeat.rowStartOffset ?? 0) - children.slice(0, from).filter((node) => node.nodeType === 1).length
			: 0,
		at = from + 1;
	while (lead > 0 && at < to) if (children[at++]!.nodeType === 1) lead--;
	return children.slice(at, to);
}
