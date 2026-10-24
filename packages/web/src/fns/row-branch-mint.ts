import type { ProtocolRowTemplateSlotValue } from '@markless/serializer';
import { markupNodes, type MarkupParent } from '../markup-nodes.ts';
import { marklessElementAt } from '../resume-anchor-census.ts';
import { spliceCensus } from '../resume-census.ts';
import type { ResumeDomElement, ResumeDomNode, ResumeKeyedRepeatRecord } from '../resume-types.ts';
import {
	marklessInstallRowBranches,
	nodeAtPath,
	slotValue,
	writeAttribute,
	type AttributableNode,
	type MintingDocument,
	type ReplaceableNode,
	type RowMintGraph,
} from './row-mint.ts';

// An @if/@switch in a keyed row, flipped per row from its row template; only pages whose rows hold one load this.
export function marklessRowBranches() {
	marklessInstallRowBranches({ mint: mintBranches, patch: patchBranches });
	return { branchValues, armEventHost, dropRow };
}

type Template = NonNullable<ResumeKeyedRepeatRecord['rowTemplate']>;
type BranchSlot = NonNullable<Template['branchSlots']>[number];
type Arm = BranchSlot['arms'][number];
type RowSlotReader = (source: string, item: unknown, index: number) => unknown;
type ArmRange = {
	readonly childNodes: ReadonlyArray<ResumeDomNode>;
	/** The arm's closing anchor; absent when the arm is the row root itself. */
	readonly end?: ResumeDomNode;
};

/** Per branch in the row: the arm it shows, then that arm's slot values, text slots first. */
function branchValues(
	repeat: ResumeKeyedRepeatRecord,
	item: unknown,
	index: number,
	graph?: RowMintGraph,
	read?: RowSlotReader,
): unknown[][] {
	return repeat.rowTemplate!.branchSlots!.map((branch) =>
		branchValue(branch, item, index, graph, read),
	);
}

function branchValue(
	branch: BranchSlot,
	item: unknown,
	index: number,
	graph?: RowMintGraph,
	read?: RowSlotReader,
): unknown[] {
	const value = (slot: ProtocolRowTemplateSlotValue) =>
		'source' in slot ? read?.(slot.source, item, index) : slotValue(slot, item, graph);
	const test = value(branch),
		tests = branch.armTests;
	let arm = tests ? tests.findIndex((one) => one !== null && one === test) : test ? 0 : 1;
	if (tests && arm < 0) arm = tests.indexOf(null);
	const shown = branch.arms[arm];
	return [arm, ...[...(shown?.textSlots ?? []), ...(shown?.attributeSlots ?? [])].map(value)];
}

const flatCount = (template: Template) =>
	(template.textSlots?.length ?? 0) + (template.attributeSlots?.length ?? 0);

// The row's whole markup is the one branch: its shown arm is the row root, so a flip is a new row.
function rowIsBranch(template: Template): boolean {
	return (
		template.branchSlots?.length === 1 &&
		template.html.replace(/<!--markless-slot:\d+-->/g, '').trim() === ''
	);
}

// Composition prefixes a record's id and its branch's id alike.
function anchorId(repeat: ResumeKeyedRepeatRecord, branch: BranchSlot): string {
	return repeat.id.slice(0, repeat.id.lastIndexOf('repeat:')) + branch.branchId;
}

function mintBranches(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	nodes: ReadonlyArray<ResumeDomNode>,
	item: unknown,
	graph: RowMintGraph | undefined,
	values: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<ResumeDomNode> {
	const template = repeat.rowTemplate!,
		host = parent.ownerDocument as MintingDocument & {
			readonly createComment?: (data: string) => ResumeDomNode;
		},
		flat = flatCount(template),
		// A filled text slot is one node for one marker, so the branch markers' paths still hold.
		marks = template.branchSlots!.map((branch) => nodeAtPath(nodes, branch.path) as ReplaceableNode);
	let built = nodes;
	for (const [at, branch] of template.branchSlots!.entries()) {
		const arm = mintArm(
			parent,
			branch,
			(values?.[flat + at] as ReadonlyArray<unknown> | undefined) ??
				branchValue(branch, item, 0, graph),
		);
		if (rowIsBranch(template)) built = arm;
		else {
			const id = anchorId(repeat, branch);
			marks[at]!.replaceWith!(
				host.createComment!(`markless:branch:${id}`),
				...arm,
				host.createComment!(`/markless:branch:${id}`),
			);
		}
	}
	return built;
}

function mintArm(
	parent: ResumeDomElement,
	branch: BranchSlot,
	values: ReadonlyArray<unknown>,
): ResumeDomNode[] {
	const arm = branch.arms[values[0] as number];
	if (!arm) return [];
	const host = parent.ownerDocument as MintingDocument,
		nodes = markupNodes<ResumeDomNode>(host.createElement!('template'), arm.html, parent as MarkupParent),
		holder = (nodes[0] as { readonly parentNode?: ResumeDomNode | null } | undefined)?.parentNode;
	const texts = arm.textSlots ?? [],
		attributes = arm.attributeSlots ?? [],
		anchors = texts.map((slot) => nodeAtPath(nodes, slot.path) as ReplaceableNode | undefined),
		hosts = attributes.map((slot) => nodeAtPath(nodes, slot.path) as AttributableNode | undefined);
	if (anchors.some((anchor) => !anchor?.replaceWith) || hosts.some((element) => !element?.setAttribute))
		throw new Error(`MARKLESS_REPEAT_ROW_MINT_EMPTY: ${branch.branchId} arm ${String(values[0])}`);
	for (const [at, slot] of attributes.entries())
		writeAttribute(
			hosts[at] as AttributableNode & Record<string, unknown>,
			slot.name,
			values[1 + texts.length + at],
			hosts[at]!.getAttribute?.(slot.name),
		);
	// An empty text at the arm's top level is no node, as the server leaves it.
	for (const [at, slot] of texts.entries()) {
		const text = String(values[1 + at] ?? '');
		if (text || slot.path.length > 1) anchors[at]!.replaceWith!(host.createTextNode!(text));
		else anchors[at]!.remove?.();
	}
	return Array.from(holder?.childNodes ?? []);
}

type Holder = { readonly childNodes: ReadonlyArray<ResumeDomNode> };
type Target = readonly [ReadonlyArray<number>, AttributableNode] | undefined;

// The writes for the values that moved in [from, to), or undefined when one cannot be written in place.
function slotWrites(
	holder: Holder,
	owner: Template | Arm,
	targets: ReadonlyArray<Target>,
	before: ReadonlyArray<unknown>,
	after: ReadonlyArray<unknown>,
	from: number,
	to: number,
): Array<() => void> | undefined {
	const texts = owner.textSlots?.length ?? 0,
		writes: Array<() => void> = [];
	for (let at = from; at < to; at++) {
		const value = after[at];
		if (Object.is(value, before[at])) continue;
		const [address, source] = targets[at - from] ?? [];
		const element = address && (marklessElementAt(holder, address) as (AttributableNode & Record<string, unknown>) | undefined);
		if (!element) return;
		if (at - from < texts) {
			if (Array.from(element.childNodes ?? []).some((kid, index) => index || kid.nodeType !== 3))
				return;
			writes.push(() => (element.textContent = String(value ?? '')));
		} else {
			const name = owner.attributeSlots![at - from - texts]!.name;
			writes.push(() => writeAttribute(element, name, value, source!.getAttribute?.(name)));
		}
	}
	return writes;
}

// Per slot: its element's address, with each branch marker counted as the block it becomes, and the template element; a text slot must be its element's only child.
const targetsByOwner = new WeakMap<object, ReadonlyArray<Target>>();
function slotTargets(owner: Template | Arm, sample: ResumeDomNode): ReadonlyArray<Target> {
	let targets = targetsByOwner.get(owner);
	if (targets) return targets;
	const nodes = parse(owner.html, sample),
		blocks = markerBlocks(owner, nodes),
		texts = owner.textSlots ?? [];
	targets = [...texts, ...(owner.attributeSlots ?? [])].map((slot, at) => {
		const path = at < texts.length ? slot.path.slice(0, -1) : slot.path,
			element = nodeAtPath(nodes, path) as AttributableNode | undefined,
			address = templateAddress(nodes, path, blocks);
		return element?.nodeType === 1 && address && (at >= texts.length || element.childNodes?.length === 1)
			? ([address, element] as const)
			: undefined;
	});
	targetsByOwner.set(owner, targets);
	return targets;
}

function parse(html: string, sample: ResumeDomNode): ReadonlyArray<ResumeDomNode> {
	const host = (sample as ResumeDomElement).ownerDocument!.createElement!('template');
	return markupNodes<ResumeDomNode>(host, html, (sample as { readonly parentNode?: MarkupParent }).parentNode);
}

function markerBlocks(owner: Template | Arm, nodes: ReadonlyArray<ResumeDomNode>): ReadonlySet<ResumeDomNode> {
	return new Set(
		('branchSlots' in owner ? (owner.branchSlots ?? []) : []).flatMap((branch) => {
			const marker = nodeAtPath(nodes, branch.path);
			return marker ? [marker] : [];
		}),
	);
}

// The ProtocolElementAddress a template node path names, from the fragment's top level.
function templateAddress(
	nodes: ReadonlyArray<ResumeDomNode>,
	path: ReadonlyArray<number>,
	blocks: ReadonlySet<ResumeDomNode>,
): number[] | undefined {
	const address: number[] = [];
	let siblings = nodes;
	for (const index of path) {
		const node = siblings[index];
		if (node?.nodeType !== 1) return;
		address.push(siblings.slice(0, index).filter((sibling) => sibling.nodeType === 1 || blocks.has(sibling)).length);
		siblings = Array.from(node.childNodes ?? []);
	}
	return address;
}

function patchBranches(
	row: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	before: ReadonlyArray<unknown>,
	after: ReadonlyArray<unknown>,
	rewire?: () => void,
): boolean {
	const template = repeat.rowTemplate!,
		flat = flatCount(template),
		writes = slotWrites({ childNodes: [row] }, template, slotTargets(template, row), before, after, 0, flat);
	if (!writes) return false;
	let flipped = false;
	for (const [at, branch] of template.branchSlots!.entries()) {
		const was = before[flat + at] as ReadonlyArray<unknown> | undefined,
			now = after[flat + at] as ReadonlyArray<unknown>;
		if (was && now.every((value, index) => Object.is(value, was[index]))) continue;
		const range = armRange(row, repeat, branch);
		if (!range) return false;
		const arm = branch.arms[now[0] as number];
		const moved =
			was?.[0] !== now[0]
				? undefined
				: arm && range.childNodes.length
					? slotWrites(range, arm, slotTargets(arm, range.childNodes[0]!), was!, now, 1, now.length)
					: [];
		if (moved) {
			writes.push(...moved);
			continue;
		}
		// The row root is the arm, so showing another arm is another row.
		if (!range.end) return false;
		flipped = true;
		writes.push(() => replaceArm(row, range, mintArm(row, branch, now)));
	}
	for (const write of writes) write();
	if (flipped) rewire?.();
	return true;
}

// Where a branch's shown arm stands in a live row: between its anchor pair in the marker's element, or the row itself.
function armRange(
	row: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	branch: BranchSlot,
): ArmRange | undefined {
	const template = repeat.rowTemplate!;
	if (rowIsBranch(template)) return { childNodes: [row] };
	let address = markerParents.get(branch);
	if (!address) {
		const nodes = parse(template.html, row);
		address = templateAddress(nodes, branch.path.slice(0, -1), markerBlocks(template, nodes));
		if (!address) return;
		markerParents.set(branch, address);
	}
	const id = anchorId(repeat, branch),
		children = Array.from(marklessElementAt({ childNodes: [row] }, address)?.childNodes ?? []),
		start = children.findIndex((node) => isAnchor(node, `markless:branch:${id}`)),
		end = children.findIndex((node, at) => at > start && isAnchor(node, `/markless:branch:${id}`));
	if (start < 0 || end < 0) return;
	return { childNodes: children.slice(start + 1, end), end: children[end] };
}

const markerParents = new WeakMap<object, number[]>();

function isAnchor(node: ResumeDomNode, data: string): boolean {
	return node.nodeType === 8 && (node as { readonly data?: string }).data === data;
}

function replaceArm(row: ResumeDomElement, range: ArmRange, nodes: ReadonlyArray<ResumeDomNode>): void {
	type Mutable = ResumeDomNode & { remove?: () => void; before?: (...nodes: ResumeDomNode[]) => void };
	for (const node of range.childNodes) (node as Mutable).remove?.();
	(range.end as Mutable).before?.(...nodes);
	for (let node: ResumeDomElement | null | undefined = row; node; node = node.parentElement)
		if (node.__marklessCensus) {
			spliceCensus(node.__marklessCensus, range.childNodes, nodes);
			break;
		}
}

/** A served row that IS a branch leaves with its anchor pair; a built row never had one. */
function dropRow(row: ResumeDomElement, repeat: ResumeKeyedRepeatRecord): void {
	const template = repeat.rowTemplate;
	if (!template || !rowIsBranch(template)) return;
	type Sibling = ResumeDomNode & {
		readonly previousSibling?: Sibling | null;
		readonly nextSibling?: Sibling | null;
		remove?: () => void;
	};
	const id = anchorId(repeat, template.branchSlots![0]!),
		before = (row as Sibling).previousSibling,
		after = (row as Sibling).nextSibling;
	if (before && isAnchor(before, `markless:branch:${id}`)) before.remove?.();
	if (after && isAnchor(after, `/markless:branch:${id}`)) after.remove?.();
}

/** The live element a row event inside a branch arm names, while the row shows that arm. */
function armEventHost(
	row: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	rowEvent: ResumeKeyedRepeatRecord['rowEvents'][number],
	values: ReadonlyArray<unknown> | undefined,
): ResumeDomElement | undefined {
	const template = repeat.rowTemplate!,
		shown = values?.[flatCount(template) + rowEvent.arm!.slot] as ReadonlyArray<unknown> | undefined,
		branch = template.branchSlots?.[rowEvent.arm!.slot];
	if (!branch || shown?.[0] !== rowEvent.arm!.arm) return;
	const range = armRange(row, repeat, branch);
	return range && marklessElementAt(range, rowEvent.hostPath);
}
