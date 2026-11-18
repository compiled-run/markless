import type { NativeNode, NativeViewPayload } from '@markless/serializer';

/**
 * The reference meaning of text flow: what a host shows as one paragraph when no style export lays the page out. Among one
 * parent's children in one place (the page, an `@if` arm or a `@for` row), each run of text nodes and flowing elements
 * (`defaultStyle.flow`) is one paragraph, whose text is theirs in order: a flowing element's own children in order, `<br>`
 * a line break and `<q>` inside curly quotes. Anything else between them starts a new paragraph.
 */
export type NativeParagraph = {
	/** The paragraph's nodes in order; a host builds them as one text view. */
	readonly nodes: ReadonlyArray<string>;
};

/** A `<br>` among a paragraph's pieces of text. */
const LINE_BREAK = Symbol('br');
type Piece = string | typeof LINE_BREAK;

const flowOf = (node: NativeNode) =>
	node.kind === 'element' ? node.defaultStyle?.flow : undefined;

const placeKey = (node: NativeNode) =>
	`${node.parent ?? ''}\0${node.arm ? `${node.arm.branch}#${node.arm.index}` : ''}\0${node.row ?? ''}`;

/** The paragraphs of a payload, in document order; a run of one text node is a paragraph too. */
export function nativeParagraphs(payload: NativeViewPayload): NativeParagraph[] {
	const paragraphs: NativeParagraph[] = [];
	const open = new Map<string, string[]>();
	const inFlow = new Set<string>();
	for (const node of payload.nodes) {
		if (node.parent !== null && inFlow.has(node.parent)) {
			if (flowOf(node) || node.kind === 'text') inFlow.add(node.id);
			continue;
		}
		const key = placeKey(node);
		if (node.kind === 'text' || flowOf(node)) {
			if (node.kind === 'element') inFlow.add(node.id);
			let run = open.get(key);
			if (!run) {
				run = [];
				open.set(key, run);
				paragraphs.push({ nodes: run });
			}
			run.push(node.id);
		} else {
			open.delete(key);
			// A sibling in another place ends the runs of its parent's other places too: they are not adjacent.
			for (const other of open.keys())
				if (other.startsWith(`${node.parent ?? ''}\0`)) open.delete(other);
		}
	}
	return paragraphs;
}

/**
 * What a person reads, from the texts a host shows (`runtime.texts()`, instance ids, in order): each text in turn, except
 * that a text in a paragraph of several nodes reads as the whole paragraph, once, where its first shown text is.
 */
export function nativeShownTexts(
	payload: NativeViewPayload,
	texts: ReadonlyMap<string, string>,
): string[] {
	const byId = new Map(payload.nodes.map((node) => [node.id, node]));
	const children = new Map<string, NativeNode[]>();
	for (const node of payload.nodes)
		if (node.parent !== null)
			children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
	const paragraphOf = new Map<string, NativeParagraph>();
	for (const paragraph of nativeParagraphs(payload)) {
		const mark = (id: string) => {
			paragraphOf.set(id, paragraph);
			for (const child of children.get(id) ?? []) mark(child.id);
		};
		for (const id of paragraph.nodes) mark(id);
	}
	const piecesOf = (node: NativeNode, suffix: string): Piece[] | undefined => {
		if (node.kind === 'text') {
			const text = texts.get(node.id + suffix);
			return text === undefined ? undefined : [text];
		}
		if (node.kind !== 'element') return undefined;
		if (node.defaultStyle?.flow === 'break') return [LINE_BREAK];
		const inner: Piece[] = [];
		for (const child of children.get(node.id) ?? []) {
			const pieces = piecesOf(child, suffix);
			if (pieces === undefined) return undefined;
			inner.push(...pieces);
		}
		return node.defaultStyle?.quotes ? ['\u201c', ...inner, '\u201d'] : inner;
	};
	const preformatted = (id: string | null): boolean => {
		const node = id === null ? undefined : byId.get(id);
		if (!node) return false;
		return (
			(node.kind === 'element' && node.defaultStyle?.preformatted === true) ||
			preformatted(node.parent)
		);
	};
	const read = new Set<string>();
	const out: string[] = [];
	for (const [id, text] of texts) {
		const at = id.indexOf('@');
		const base = at < 0 ? id : id.slice(0, at);
		const suffix = at < 0 ? '' : id.slice(at);
		const paragraph = paragraphOf.get(base);
		const first = paragraph ? byId.get(paragraph.nodes[0]!)! : byId.get(base);
		const shape = (pieces: Piece[]) =>
			first && preformatted(first.parent)
				? pieces.map((piece) => (piece === LINE_BREAK ? '\n' : piece)).join('')
				: collapseWhitespace(pieces);
		if (
			!paragraph ||
			(paragraph.nodes.length === 1 && byId.get(paragraph.nodes[0]!)?.kind === 'text')
		) {
			out.push(shape([text]));
			continue;
		}
		const key = `${paragraph.nodes[0]}${suffix}`;
		if (read.has(key)) continue;
		read.add(key);
		out.push(shape(paragraph.nodes.flatMap((node) => piecesOf(byId.get(node)!, suffix) ?? [])));
	}
	return out;
}

/**
 * CSS `white-space: normal` on one paragraph: each run of spaces, tabs and newlines is one space, none at either end;
 * a `<br>`'s line break stays and takes the spaces around it.
 */
function collapseWhitespace(pieces: ReadonlyArray<Piece>): string {
	let out = '';
	let space = false;
	for (const char of pieces.flatMap((piece): Piece[] =>
		piece === LINE_BREAK ? [piece] : [...piece],
	)) {
		if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f') {
			space = true;
			continue;
		}
		if (char === LINE_BREAK) {
			out = (out.endsWith(' ') ? out.slice(0, -1) : out) + '\n';
			space = false;
			continue;
		}
		if (space && out.length > 0 && !out.endsWith('\n')) out += ' ';
		space = false;
		out += char;
	}
	return out;
}
