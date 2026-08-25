import { marklessAttributeValue } from '../dom-attribute.ts';
import type { ResumeDomElement, ResumeDomNode, ResumeKeyedRepeatRecord } from '../resume-types.ts';

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
 * and there would be nothing left to gate. The one import is `dom-attribute`, a
 * leaf holding the attribute presence rule every render path shares - forking
 * that rule would be worse than the handful of bytes it costs.
 */

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
	template.innerHTML = repeat.emptyArm!.html;
	const nodes = Array.from(template.content?.childNodes ?? []) as ReadonlyArray<ResumeDomNode>;
	if (nodes.length === 0)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_EMPTY_ARM_EMPTY',
			'rendered an @empty arm of no nodes, so nothing would speak for the emptied list.',
		);
	return nodes;
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
): ResumeDomElement {
	const rowTemplate = repeat.rowTemplate!,
		host = parent.ownerDocument as MintingDocument | undefined,
		template = host?.createElement?.('template');
	if (!template || !host?.createTextNode)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_ROW_MINT_RENDERER_MISSING',
			'has no document to build a row for an unserved key with.',
		);
	template.innerHTML = rowTemplate.html;
	const nodes = Array.from(template.content?.childNodes ?? []) as ReadonlyArray<ResumeDomNode>;
	// Every path is walked before any fill: replacing a marker rewrites the
	// childNodes a later path would have counted through.
	const rowRoot = nodes.find((node) => node.nodeType === 1) as ResumeDomElement | undefined,
		slots = rowTemplate.textSlots ?? [],
		anchors = slots.map((slot) => nodeAtPath(nodes, slot.path) as ReplaceableNode | undefined),
		attributeSlots = rowTemplate.attributeSlots ?? [],
		hosts = attributeSlots.map(
			(slot) => nodeAtPath(nodes, slot.path) as AttributableNode | undefined,
		);
	if (
		!rowRoot ||
		anchors.some((anchor) => !anchor?.replaceWith) ||
		hosts.some((element) => !element?.setAttribute)
	)
		throw repeatRuntimeError(
			repeat,
			'MARKLESS_REPEAT_ROW_MINT_EMPTY',
			'built no row from its markup, and half a row is worse than none.',
		);
	for (const [at, slot] of attributeSlots.entries()) {
		const value = marklessAttributeValue(slot.name, readPath(item, slot.itemPath));
		if (value === null) hosts[at]!.removeAttribute?.(slot.name);
		else hosts[at]!.setAttribute!(slot.name, value);
	}
	for (const [at, slot] of slots.entries())
		anchors[at]!.replaceWith!(host.createTextNode(String(readPath(item, slot.itemPath) ?? '')));
	return rowRoot;
}

// A local copy of fns/direct's walk, for the reason this whole module is local:
// importing that module pulls it into this on-demand module's static closure,
// which the leanness guard measures.
function nodeAtPath(
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
type MintingDocument = NonNullable<ResumeDomElement['ownerDocument']> & {
	readonly createTextNode?: (data: string) => ResumeDomNode;
};
type ReplaceableNode = ResumeDomNode & { readonly replaceWith?: (node: ResumeDomNode) => void };
type AttributableNode = ResumeDomNode & {
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
function repeatRuntimeError(
	repeat: ResumeKeyedRepeatRecord,
	code: string,
	detail: string,
): Error {
	const error = new Error(`${code}: ${repeat.id} ${detail}`) as Error & Record<string, unknown>;
	error.name = 'KeyedRepeatRuntimeError';
	error.code = code;
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeat.id;
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}
