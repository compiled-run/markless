import type { RuntimeGraph } from '@markless/runtime';
import { readKeyedRepeatCollection } from './resume-keyed-repeats.ts';
import type {
	ResumeBranchArmEntry,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
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
): { readonly showing: () => boolean; readonly end: () => ResumeDomNode | undefined } | undefined {
	const shown = branchArmEntry(parent, repeat, input.root);
	if (!shown) return undefined;
	const showing = () => shown.arm === repeat.branchArm!.arm;
	const paint = () => {
		const nodes = showing() ? nodesBetween(parent, shown) : [],
			items = nodes.length ? readKeyedRepeatCollection(input.graph, repeat) : [];
		arm.mounted = nodes.length > 0 && items.length === 0;
		arm.nodes = arm.mounted ? nodes : [];
		adopt(arm.mounted ? [] : nodes, items);
	};
	shown.listeners.add(paint);
	input.storeContainerSubscription(() => shown.listeners.delete(paint));
	paint();
	return { showing, end: () => shown.end };
}

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

function nodesBetween(parent: ResumeDomElement, shown: ResumeBranchArmEntry): ResumeDomNode[] {
	const children = Array.from(parent.childNodes ?? []);
	const from = children.indexOf(shown.start!),
		to = children.indexOf(shown.end!);
	return from < 0 || to < from ? [] : children.slice(from + 1, to);
}
