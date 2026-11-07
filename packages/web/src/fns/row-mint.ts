import { markupNodes, type MarkupParent } from '../markup-nodes.ts';
import type { ProtocolRowTemplateSlotValue } from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';
import { marklessAttributeValue, marklessWriteAttribute } from '../dom-attribute.ts';
import { pageNodes } from '../resume-anchor-census.ts';
import type {
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeRowRoot,
} from '../resume-types.ts';
import {
	PROTOCOL_ROW_END_COMMENT,
	PROTOCOL_ROW_START_COMMENT,
} from '../../../serializer/src/protocol-row-markers.ts';

/**
 * The nodes a resumed client BUILDS for a keyed repeat, and nothing else.
 *
 * A repeat that only reorders, removes and re-inserts served rows never reaches
 * this module: the two record fields that need it - `rowTemplate` (markup for a
 * key the server never sent) and `emptyArm` (markup for "nothing matches") - are
 * absent on such a record, and the compiler folds the demand for this module into
 * a keyed-repeat record only when one of them is present - so an app whose
 * repeats only reorder never writes this module's specifier and never emits its
 * chunk at all. Every helper below is therefore spelled locally: an
 * import from the repeat module would pull that module's whole closure back in
 * and there would be nothing left to gate. The value imports are leaves:
 * `dom-attribute`, the attribute presence rule every render path shares, and
 * `resume-anchor-census`, the page's own nodes in a container that is an author's
 * element - forking either rule would be worse than the handful of bytes it
 * costs. The other imports are types, which erase.
 */

/** The read half of the live graph, for a row's outside reads. */
export type RowMintGraph = Pick<RuntimeGraph, 'read'>;

/**
 * Build the `@empty` arm's nodes from the markup the payload carries.
 *
 * A detached template is the same construction `renderBranchHtml` uses for a
 * flipped `@if` arm; it is spelled here rather than threaded in because the
 * repeat runtime is reached from two call sites that hand it no renderer.
 */
export function renderEmptyArm(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
): ReadonlyArray<ResumeDomNode> {
	const template = parent.ownerDocument?.createElement?.('template');
	if (!template)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_EMPTY_ARM_RENDERER_MISSING',
			'has no document to render its @empty arm markup with.',
		);
	const nodes = markupNodes<ResumeDomNode>(
		template,
		repeat.emptyArm!.html,
		parent as MarkupParent,
	);
	if (nodes.length === 0)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_EMPTY_ARM_EMPTY',
			'rendered an @empty arm of no nodes, so nothing would speak for the emptied list.',
		);
	return nodes;
}

// The server painted the arm without markers, so its nodes are found by matching the arm's own markup at the row span.
export function servedEmptyArm(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	rangeEnd?: ResumeDomNode,
): ReadonlyArray<ResumeDomNode> {
	const shape = renderEmptyArm(parent, repeat),
		children = pageNodes(parent),
		elements = children.filter((node) => node.nodeType === 1),
		before = elements[(repeat.rowStartOffset ?? 0) - 1],
		after = repeat.rowEndOffset ? elements[elements.length - repeat.rowEndOffset] : undefined,
		start =
			repeat.rowEndOffset === undefined
				? before
					? children.indexOf(before) + 1
					: 0
				: (after ? children.indexOf(after) : children.length) - shape.length,
		served = children.slice(start, start + shape.length);
	if (
		served.length === shape.length &&
		served.every(
			(node, at) =>
				node !== rangeEnd &&
				node.nodeType === shape[at]!.nodeType &&
				(node as { tagName?: string; data?: string }).tagName ===
					(shape[at] as { tagName?: string }).tagName &&
				(node as { data?: string }).data === (shape[at] as { data?: string }).data,
		)
	)
		return served;
	throw repeatRuntimeError(
		repeat,
		'MARKLESS_REPEAT_EMPTY_ARM_UNMATCHED',
		'cannot find the @empty arm the server painted, so it cannot replace it with rows.',
	);
}

/**
 * Build one row for a key that was never served, from the markup the record
 * carries.
 *
 * The mint renders and fills; it wires nothing and starts nothing, and the
 * compiler ships `rowTemplate` only for a row that needs no more than that. Slot
 * coordinates are FRAGMENT-relative, one segment ahead of the ROW-ROOT-relative
 * `hostPath` a row event carries: `[0]` here is the row root.
 */
export function mintRow(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	item: unknown,
	graph?: RowMintGraph,
	values?: ReadonlyArray<unknown>,
): ResumeRowRoot {
	if (!repeat.rowRange) return mintRowNodes(parent, repeat, item, graph, values).rowRoot;
	// A row that is not one element is placed between its own row comments; text alone is a row too.
	return wrapRowRange(
		parent,
		buildRowNodes(parent, repeat, item, graph, values),
	)[0] as ResumeRowRoot;
}

/**
 * The same mint, answering with the whole fragment as well as the row root.
 *
 * A row element that WRAPS a child component is minted here and finished by the
 * component bridge, which needs the fragment to walk `rowComponent.slotPath` to
 * the marker the child's nodes replace.
 */
export function mintRowNodes(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	item: unknown,
	graph?: RowMintGraph,
	// Text slots first, then attribute slots, as the repeat runtime reads them.
	values?: ReadonlyArray<unknown>,
): { readonly rowRoot: ResumeDomElement; readonly nodes: ReadonlyArray<ResumeDomNode> } {
	const built = buildRowNodes(parent, repeat, item, graph, values);
	const rowRoot = built.find((node) => node.nodeType === 1) as ResumeDomElement | undefined;
	if (!rowRoot) throw emptyRowError(repeat);
	return { rowRoot, nodes: built };
}

function emptyRowError(repeat: ResumeKeyedRepeatRecord): Error {
	return repeatRuntimeError(
		repeat,
		'MARKLESS_REPEAT_ROW_MINT_EMPTY',
		'built no row from its markup, and half a row is worse than none.',
	);
}

function buildRowNodes(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	item: unknown,
	graph?: RowMintGraph,
	values?: ReadonlyArray<unknown>,
): ReadonlyArray<ResumeDomNode> {
	const rowTemplate = repeat.rowTemplate!,
		host = parent.ownerDocument as MintingDocument | undefined,
		template = host?.createElement?.('template');
	if (!template || !host?.createTextNode)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_ROW_MINT_RENDERER_MISSING',
			'has no document to build a row for an unserved key with.',
		);
	const nodes = markupNodes<ResumeDomNode>(template, rowTemplate.html, parent as MarkupParent);
	// Every path is walked before any fill: replacing a marker rewrites the
	// childNodes a later path would have counted through.
	const slots = rowTemplate.textSlots ?? [],
		anchors = slots.map((slot) => nodeAtPath(nodes, slot.path) as ReplaceableNode | undefined),
		attributeSlots = rowTemplate.attributeSlots ?? [],
		hosts = attributeSlots.map(
			(slot) => nodeAtPath(nodes, slot.path) as AttributableNode | undefined,
		);
	if (
		anchors.some((anchor) => !anchor?.replaceWith) ||
		hosts.some((element) => !element?.setAttribute)
	)
		throw emptyRowError(repeat);
	const valueAt = (at: number, slot: ProtocolRowTemplateSlotValue) =>
		values ? values[at] : slotValue(slot, item, graph);
	for (const [at, slot] of attributeSlots.entries())
		writeAttribute(
			hosts[at]!,
			slot.name,
			valueAt(slots.length + at, slot),
			hosts[at]!.getAttribute?.(slot.name),
		);
	// A ranged row's own text can stand at its top level, so the list names the text that replaced its marker.
	const filled = new Map<ResumeDomNode, ResumeDomNode>();
	for (const [at, slot] of slots.entries()) {
		const text = host.createTextNode(String(valueAt(at, slot) ?? ''));
		anchors[at]!.replaceWith!(text);
		filled.set(anchors[at]!, text);
	}
	const built = nodes.map((node) => filled.get(node) ?? node);
	// A filled text slot is one node for one marker, so a branch marker's path still holds.
	return rowTemplate.branchSlots
		? rowBranches!.mint(parent, repeat, built, item, graph, values)
		: built;
}

/** What an `@if` in a row adds to the mint, installed by `fns/row-branch-mint` on a page whose rows hold one. */
export type RowBranchHooks = {
	readonly mint: (
		parent: ResumeDomElement,
		repeat: ResumeKeyedRepeatRecord,
		nodes: ReadonlyArray<ResumeDomNode>,
		item: unknown,
		graph: RowMintGraph | undefined,
		values: ReadonlyArray<unknown> | undefined,
	) => ReadonlyArray<ResumeDomNode>;
	readonly patch: typeof patchRow;
};
let rowBranches: RowBranchHooks | undefined;
export function marklessInstallRowBranches(hooks: RowBranchHooks): void {
	rowBranches = hooks;
}

/** Writes moved slot values onto the live row, keeping its elements and focus; false (nothing written) means rebuild. */
export function patchRow(
	row: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	before: ReadonlyArray<unknown>,
	after: ReadonlyArray<unknown>,
	// Called once an arm flipped, so the arm's events are registered on its new nodes.
	rewire?: () => void,
): boolean {
	// Its arms stand between the row's elements, so a row with an @if is patched by the code that counts them.
	if (repeat.rowTemplate!.branchSlots)
		return rowBranches!.patch(row, repeat, before, after, rewire);
	const template = repeat.rowTemplate!,
		texts = template.textSlots ?? [],
		writes: Array<() => void> = [];
	let targets = slotTargets.get(template);
	if (!targets) {
		const host = row.ownerDocument?.createElement?.('template');
		if (!host) return false;
		const nodes = markupNodes<ResumeDomNode>(
			host,
			template.html,
			(row as { readonly parentNode?: MarkupParent }).parentNode,
		);
		targets = [...texts, ...(template.attributeSlots ?? [])].map((slot, at) =>
			slotTarget(nodes, slot.path, at < texts.length, slot.fromEnd),
		);
		slotTargets.set(template, targets);
	}
	for (const [at, value] of after.entries()) {
		if (Object.is(value, before[at])) continue;
		const [path, source] = targets[at] ?? [];
		let node: ResumeDomNode | undefined = path && row;
		for (const index of path ?? []) node = childElements(node).at(index);
		const element = node as (AttributableNode & Record<string, unknown>) | undefined;
		if (!element) return false;
		if (at < texts.length) {
			if (Array.from(element.childNodes ?? []).some((kid, at) => at || kid.nodeType !== 3))
				return false;
			writes.push(() => (element.textContent = String(value ?? '')));
		} else {
			const name = template.attributeSlots![at - texts.length]!.name;
			writes.push(() => writeAttribute(element, name, value, source!.getAttribute?.(name)));
		}
	}
	for (const write of writes) write();
	return true;
}

// Per slot: element indexes under the row root (negative counts from the parent's end), and the template element holding the slot's static part.
const slotTargets = new WeakMap<
	object,
	ReadonlyArray<readonly [number[], AttributableNode] | undefined>
>();

// A text slot must be its element's only child.
function slotTarget(
	nodes: ReadonlyArray<ResumeDomNode>,
	path: ReadonlyArray<number>,
	text: boolean,
	fromEnd: ReadonlyArray<number> = [],
): readonly [number[], AttributableNode] | undefined {
	let node = nodes[path[0]!];
	if (node !== nodes.find((root) => root.nodeType === 1)) return;
	const indexes: number[] = [];
	for (const [depth, index] of path.slice(1, text ? -1 : undefined).entries()) {
		const child: ResumeDomNode | undefined = node?.childNodes?.[index];
		if (child?.nodeType !== 1) return;
		const kids = childElements(node);
		indexes.push(kids.indexOf(child) - (fromEnd.includes(depth + 1) ? kids.length : 0));
		node = child;
	}
	return node?.nodeType === 1 && (!text || node.childNodes?.length === 1)
		? [indexes, node]
		: undefined;
}

// An always-present attribute is already in the html, a scoped class with its scope class; a live control's state is its property.
export function writeAttribute(
	element: AttributableNode & Record<string, unknown>,
	name: string,
	value: unknown,
	rest: string | null | undefined,
): void {
	const text = marklessAttributeValue(name, value);
	marklessWriteAttribute(
		element,
		name,
		rest == null && text === null
			? null
			: rest?.endsWith(' ')
				? rest + (text ?? '')
				: (text ?? '') + (rest ?? ''),
	);
	if ((name === 'checked' || name === 'selected' || name === 'value') && name in element)
		element[name] = name === 'value' ? (text ?? '') : text !== null;
}

/** Where focus sits inside a row about to be rebuilt, as element indexes under the row root. */
export function focusPath(row: ResumeDomElement): number[] | undefined {
	let node: ResumeDomElement | null | undefined = (
		row.ownerDocument as { readonly activeElement?: ResumeDomElement } | undefined
	)?.activeElement;
	if (!node || !row.contains?.(node)) return;
	const path: number[] = [];
	for (; node && node !== row; node = node.parentElement)
		path.unshift(childElements(node.parentElement).indexOf(node));
	return path;
}

// Element indexes, since a served row and a minted one differ in the text and comments between.
function childElements(node: ResumeDomNode | null | undefined): ResumeDomNode[] {
	return Array.from(node?.childNodes ?? []).filter((child) => child.nodeType === 1);
}

const awaitingFocus = new WeakMap<ResumeDomElement, ReadonlyArray<number>>();

/** Focuses where each rebuilt row held it, or once that row's own later-minted rows are placed. */
export function refocus(
	parent: ResumeDomElement,
	focused: ReadonlyArray<readonly [ResumeDomElement, ReadonlyArray<number>]>,
): void {
	for (const [row, path] of focused) if (!focusAt(row, path)) awaitingFocus.set(row, path);
	for (let node: ResumeDomElement | null | undefined = parent; node; node = node.parentElement) {
		const path = awaitingFocus.get(node);
		if (!path) continue;
		const document = node.ownerDocument as
			| { readonly activeElement?: unknown; readonly body?: unknown }
			| undefined;
		// Focus the user moved in the meantime is theirs to keep.
		const moved = document?.activeElement && document.activeElement !== document.body;
		if (moved || focusAt(node, path)) awaitingFocus.delete(node);
		return;
	}
}

function focusAt(row: ResumeDomElement, path: ReadonlyArray<number>): boolean {
	let node: ResumeDomNode | undefined = row;
	for (const index of path) node = childElements(node)[index];
	(node as { readonly focus?: () => void } | undefined)?.focus?.();
	return (node as { readonly focus?: () => void } | undefined)?.focus !== undefined;
}

// A slot value when the repeat runtime handed none; a write to what it reads rebuilds the row.
// While the collection refreshes, its rows read the inputs it was fetched with as the rows on screen show them; false holds them.
export function shownRowGraph(
	graph: RuntimeGraph,
	repeat: ResumeKeyedRepeatRecord,
	reads: ReadonlyArray<{ readonly graphNodeId: string; readonly path?: ReadonlyArray<string> }>,
): RuntimeGraph | false {
	const read = graph.shownRead?.([
		{ graphNodeId: repeat.collectionGraphNodeId!, path: repeat.collectionPath },
		...reads,
	]);
	return read === false ? false : read ? { ...graph, read } : graph;
}

export function slotValue(
	slot: ProtocolRowTemplateSlotValue,
	item: unknown,
	graph: RowMintGraph | undefined,
): unknown {
	return 'itemPath' in slot
		? readPath(item, slot.itemPath)
		: 'graphNodeId' in slot
			? graph?.read(slot.graphNodeId, slot.graphPath)
			: undefined;
}

// A local copy of fns/direct's walk, for the reason this whole module is local:
// importing that module pulls it into this on-demand module's static closure,
// which the leanness guard measures.
export function nodeAtPath(
	nodes: ReadonlyArray<ResumeDomNode>,
	path: ReadonlyArray<number>,
): ResumeDomNode | undefined {
	let siblings: ReadonlyArray<ResumeDomNode> = nodes,
		node: ResumeDomNode | undefined;
	for (const index of path) {
		node = siblings[index];
		if (!node) return undefined;
		siblings = node.childNodes ?? [];
	}
	return node;
}
export type MintingDocument = NonNullable<ResumeDomElement['ownerDocument']> & {
	readonly createTextNode?: (data: string) => ResumeDomNode;
};
export type ReplaceableNode = ResumeDomNode & {
	readonly replaceWith?: (...nodes: ResumeDomNode[]) => void;
	readonly remove?: () => void;
};
export type AttributableNode = ResumeDomNode & {
	readonly getAttribute?: (name: string) => string | null;
	readonly setAttribute?: (name: string, value: string) => void;
	readonly removeAttribute?: (name: string) => void;
};
function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}
function repeatRuntimeError(repeat: ResumeKeyedRepeatRecord, code: string, detail: string): Error {
	const error = new Error(`${code}: ${repeat.id} ${detail}`) as Error & Record<string, unknown>;
	error.name = 'KeyedRepeatRuntimeError';
	error.code = code;
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeat.id;
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}

// A keyed row that is not one element lives between two row comments and is named by its start comment.
type RowSibling = ResumeDomNode & {
	readonly nextSibling?: RowSibling | null;
	readonly data?: string;
};

/** The row's nodes in order, both of its comments included. */
export function rowRangeNodes(start: ResumeDomNode): ResumeDomNode[] {
	const nodes: ResumeDomNode[] = [start];
	let depth = 0;
	for (let at = (start as RowSibling).nextSibling; at; at = at.nextSibling) {
		nodes.push(at);
		if (at.nodeType !== 8) continue;
		if (at.data === PROTOCOL_ROW_START_COMMENT) depth++;
		else if (at.data === PROTOCOL_ROW_END_COMMENT && !depth--) break;
	}
	return nodes;
}

/** A built row's nodes between a fresh pair of row comments, siblings in a fragment until the row is placed. */
export function wrapRowRange(
	parent: ResumeDomElement,
	nodes: ReadonlyArray<ResumeDomNode>,
): ResumeDomNode[] {
	const document = parent.ownerDocument as {
		createComment?: (data: string) => ResumeDomNode;
		createDocumentFragment?: () => { append: (...nodes: ResumeDomNode[]) => void };
	};
	const wrapped = [
		document.createComment!(PROTOCOL_ROW_START_COMMENT),
		...nodes,
		document.createComment!(PROTOCOL_ROW_END_COMMENT),
	];
	document.createDocumentFragment!().append(...wrapped);
	return wrapped;
}
