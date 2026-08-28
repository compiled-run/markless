/**
 * The DOM half of the tokenbox, written entirely in `Range` and `Selection`.
 *
 * Every function here takes elements the family BOUND — the surface handle and
 * the token roster — plus nodes the platform handed over (`Selection.focusNode`).
 * Nothing looks anything up: there is no selector, no `closest`, no parent walk
 * and no child access, which is what the package's DOM-access rule requires and
 * also what makes this survive a consumer wrapping the surface in their own
 * markup.
 *
 * The one predicate used is `surface.contains(node)`, on a handle the family
 * bound, asking whether a node the platform named sits inside the part.
 *
 * This is React Aria TokenField's `findText` trick, spelled for our handles: a
 * Range measures the same character space `token-walk.ts` computes over, so the
 * two halves meet on a number rather than on a node.
 */

import { fromParts } from './token-walk.ts';
import type { TokenBoxRect, TokenBoxSegment } from './tokenbox-types.ts';

/** One token as the DOM currently has it: what it is, and the offsets it occupies. */
export type PlacedToken = {
	readonly start: number;
	readonly end: number;
	readonly value: string;
	readonly label: string;
};

function documentOf(surface: HTMLElement): Document | undefined {
	return surface.ownerDocument ?? undefined;
}

/**
 * A run of the surface's text as a value, with the editor's own padding undone.
 *
 * Every engine stores a space that would collapse at the end of a line as U+00A0
 * instead. That is how a contenteditable renders, not what the person typed, so
 * it is normalised here — the one place the DOM's text becomes the value. The
 * substitution is one character for one, so every offset the caret is measured in
 * survives it.
 */
function asValueText(text: string): string {
	return text.replace(/ /g, ' ');
}

/**
 * Where each token sits in the surface's flattened text, in document order.
 *
 * The width is measured off the token element rather than assumed from its
 * label, so a consumer's CSS — or a browser's own whitespace handling — cannot
 * put the model's offsets out of step with the ones a caret is measured in.
 */
export function placedTokens(
	surface: HTMLElement,
	tokens: readonly HTMLElement[] | undefined,
): readonly PlacedToken[] {
	const doc = documentOf(surface);
	// A plural handle reads back undefined until the repeat has bound one.
	if (!doc || tokens === undefined) return [];

	const placed: PlacedToken[] = [];
	for (const token of tokens) {
		if (!surface.contains(token)) continue;
		const upTo = doc.createRange();
		upTo.selectNodeContents(surface);
		upTo.setEndBefore(token);
		const own = doc.createRange();
		own.selectNode(token);
		const rendered = asValueText(own.toString());
		placed.push({
			start: upTo.toString().length,
			end: upTo.toString().length + rendered.length,
			value: token.getAttribute('ui-value') ?? '',
			label: rendered,
		});
	}
	return [...placed].sort((left, right) => left.start - right.start);
}

/** Everything the surface currently reads as, tokens included. */
export function surfaceText(surface: HTMLElement): string {
	const doc = documentOf(surface);
	if (!doc) return asValueText(surface.textContent ?? '');
	const whole = doc.createRange();
	whole.selectNodeContents(surface);
	return asValueText(whole.toString());
}

function selectionIn(surface: HTMLElement): Selection | undefined {
	return surface.ownerDocument?.defaultView?.getSelection() ?? undefined;
}

/**
 * The caret as one offset in the surface's flattened text, or `undefined` when
 * the caret is not in this surface at all.
 *
 * The focus end is used rather than the anchor: with a range selected, the caret
 * a person is extending from is the one an autocomplete should follow.
 */
export function caretOffset(surface: HTMLElement): number | undefined {
	const doc = documentOf(surface);
	const selection = selectionIn(surface);
	const node = selection?.focusNode ?? undefined;
	if (!doc || !selection || !node || !surface.contains(node)) return undefined;

	const upTo = doc.createRange();
	upTo.selectNodeContents(surface);
	try {
		upTo.setEnd(node, selection.focusOffset);
	} catch {
		return undefined;
	}
	return upTo.toString().length;
}

/**
 * The value the surface is currently showing — the derivation half of the v1
 * bet. The browser edited the text; this turns what it left behind back into
 * segments without asking the DOM what its children are.
 */
export function readValue(
	surface: HTMLElement,
	tokens: readonly HTMLElement[] | undefined,
): readonly TokenBoxSegment[] {
	return fromParts(surfaceText(surface), placedTokens(surface, tokens));
}

/**
 * The element at a position in a roster the family bound.
 *
 * The indexing happens here rather than at the call site because a graph read
 * path has to be statically resolvable: `roster[someExpression]` cannot be
 * recorded as a subscription, so the whole roster is handed over and a plain
 * module picks from it — the same shape taglist's `elementForValue` uses.
 */
export function elementAt(
	elements: readonly HTMLElement[] | undefined,
	index: number,
): HTMLElement | undefined {
	if (elements === undefined || index < 0) return undefined;
	return elements[index];
}

/**
 * The selected range as two offsets in the flattened text, collapsed to the same
 * number when nothing is selected. `undefined` when the selection is not in this
 * surface.
 */
export function selectionRange(
	surface: HTMLElement,
): { readonly start: number; readonly end: number } | undefined {
	const doc = documentOf(surface);
	const selection = selectionIn(surface);
	const focus = selection?.focusNode ?? undefined;
	const anchor = selection?.anchorNode ?? undefined;
	if (!doc || !selection || !focus || !anchor) return undefined;
	if (!surface.contains(focus) || !surface.contains(anchor)) return undefined;

	const upToFocus = doc.createRange();
	const upToAnchor = doc.createRange();
	upToFocus.selectNodeContents(surface);
	upToAnchor.selectNodeContents(surface);
	try {
		upToFocus.setEnd(focus, selection.focusOffset);
		upToAnchor.setEnd(anchor, selection.anchorOffset);
	} catch {
		return undefined;
	}
	const one = upToFocus.toString().length;
	const other = upToAnchor.toString().length;
	return { start: Math.min(one, other), end: Math.max(one, other) };
}

/**
 * Where a run of the surface's own text sits on screen, for anchoring a popover.
 *
 * `back` is how many characters before the caret the run starts — a trigger's
 * `end - start`. When the caret's own node holds that many characters the rect
 * spans the whole run; when it does not, the collapsed caret rect is returned
 * instead, which is a worse anchor but never a wrong one. A collapsed range
 * still reports a rect in every engine that ships anchor positioning.
 */
export function rectBehindCaret(
	surface: HTMLElement,
	back: number,
): TokenBoxRect | undefined {
	const doc = documentOf(surface);
	const selection = selectionIn(surface);
	const node = selection?.focusNode ?? undefined;
	if (!doc || !selection || !node || !surface.contains(node)) return undefined;

	const run = doc.createRange();
	try {
		run.setEnd(node, selection.focusOffset);
		const reach = Math.max(0, Math.min(back, selection.focusOffset));
		run.setStart(node, selection.focusOffset - reach);
	} catch {
		return undefined;
	}
	const box = run.getBoundingClientRect();
	// Plain numbers: this rides in a graph cell, and a DOMRect does not serialize.
	return {
		top: box.top,
		left: box.left,
		width: box.width,
		height: box.height,
		bottom: box.bottom,
		right: box.right,
	};
}

/**
 * Put the caret at the end of what this element renders.
 *
 * A node boundary, not a character offset: `selectNodeContents` plus a collapse
 * addresses "after everything in here" without naming a text node, so it holds
 * whatever the browser did to the element's interior.
 */
export function caretToEndOf(element: HTMLElement): void {
	const doc = element.ownerDocument ?? undefined;
	const selection = doc?.defaultView?.getSelection() ?? undefined;
	if (!doc || !selection) return;

	const at = doc.createRange();
	at.selectNodeContents(element);
	at.collapse(false);
	selection.removeAllRanges();
	selection.addRange(at);
}

/** Put the caret immediately after this element, which is where a fresh token leaves it. */
export function caretAfter(element: HTMLElement): void {
	const doc = element.ownerDocument ?? undefined;
	const selection = doc?.defaultView?.getSelection() ?? undefined;
	if (!doc || !selection) return;

	const at = doc.createRange();
	at.setStartAfter(element);
	at.collapse(true);
	selection.removeAllRanges();
	selection.addRange(at);
}
