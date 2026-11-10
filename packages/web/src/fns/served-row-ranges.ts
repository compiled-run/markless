import { PROTOCOL_ROW_COMMENT } from '../../../serializer/src/protocol-page-markers.ts';
import { pageNodes } from '../resume-anchor-census.ts';
import type {
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
} from '../resume-types.ts';

// Loaded only by a page with a list whose rows are not one element each.

const ROW_END = `/${PROTOCOL_ROW_COMMENT}`;

type Sibling = ResumeDomNode & { readonly nextSibling?: Sibling | null; readonly data?: string };

/** The row's nodes in order, both of its comments included. */
export function rowRangeNodes(start: ResumeDomNode): ResumeDomNode[] {
	const nodes: ResumeDomNode[] = [start];
	let depth = 0;
	for (let at = (start as Sibling).nextSibling; at; at = at.nextSibling) {
		nodes.push(at);
		if (at.nodeType !== 8) continue;
		if (at.data === PROTOCOL_ROW_COMMENT) depth++;
		else if (at.data === ROW_END && !depth--) break;
	}
	return nodes;
}

/** What the row renders between its comments, shaped as the parent an element address walks from. */
export function rowRangeContent(start: ResumeDomNode): {
	readonly childNodes: ReadonlyArray<ResumeDomNode>;
} {
	return { childNodes: rowRangeNodes(start).slice(1, -1) };
}

/** The served rows of a repeat whose rows are ranges, by start comment, found from the elements around them. */
export function servedRowRanges(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	count: number,
): ResumeDomComment[] {
	const starts: Array<readonly [ResumeDomComment, number]> = [];
	let elements = 0,
		depth = 0;
	for (const node of pageNodes(parent)) {
		const data = node.nodeType === 8 ? (node as ResumeDomComment).data : undefined;
		if (data === PROTOCOL_ROW_COMMENT) {
			if (depth++ === 0) starts.push([node as ResumeDomComment, elements]);
		} else if (data === ROW_END) depth--;
		else if (depth === 0 && node.nodeType === 1) elements++;
	}
	const placed =
		repeat.rowEndOffset === undefined
			? starts.filter(([, before]) => before >= (repeat.rowStartOffset ?? 0))
			: starts.filter(([, before]) => elements - before >= repeat.rowEndOffset!);
	return (
		repeat.rowEndOffset === undefined
			? placed.slice(0, count)
			: placed.slice(placed.length - count)
	).map(([start]) => start);
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
		document.createComment!(PROTOCOL_ROW_COMMENT),
		...nodes,
		document.createComment!(ROW_END),
	];
	document.createDocumentFragment!().append(...wrapped);
	return wrapped;
}
