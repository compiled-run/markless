import type { TokenBoxSegment, TokenBoxTrigger } from './tokenbox-types.ts';

/**
 * The tokenbox's value arithmetic, held on its own.
 *
 * Nothing here touches the DOM and nothing here reads the family's instance.
 * Every function takes the segment array and gives back a new one, or takes the
 * array and a character offset and gives back a fact about it.
 *
 * The character space is the whole idea: a tokenbox value flattens to a string
 * in which a token occupies exactly as many characters as its label renders, and
 * every operation — the caret, the trigger, an insertion, a paste — is stated as
 * an offset or a range in that string. That is the same space a DOM `Range`
 * measures (`token-range.ts`), which is what lets the two halves meet without
 * either one walking a tree.
 */

/** A token's value, or '' for a text run. Lets markup read the union without narrowing. */
export function valueOf(segment: TokenBoxSegment): string {
	return segment.kind === 'token' ? segment.value : '';
}

/** What one segment renders as text: its own text, or a token's label. */
export function textOf(segment: TokenBoxSegment): string {
	return segment.kind === 'text' ? segment.text : segment.label;
}

/** The whole value as the one string a caret offset is measured against. */
export function flatten(segments: readonly TokenBoxSegment[]): string {
	return segments.map(textOf).join('');
}

/**
 * Where each segment sits in the flattened string, in order. `end` is exclusive,
 * so segment `i` covers `[start, end)` and `spans[i].end === spans[i + 1].start`.
 */
export function spans(
	segments: readonly TokenBoxSegment[],
): ReadonlyArray<{ readonly start: number; readonly end: number }> {
	const out: Array<{ start: number; end: number }> = [];
	let at = 0;
	for (const segment of segments) {
		const width = textOf(segment).length;
		out.push({ start: at, end: at + width });
		at += width;
	}
	return out;
}

/**
 * The tokens in the value, with the offsets they occupy. This is what a consumer
 * needs to say "the caret is right after Alice" without re-deriving the flatten.
 */
export function tokenSpans(
	segments: readonly TokenBoxSegment[],
): ReadonlyArray<{ readonly value: string; readonly start: number; readonly end: number }> {
	const at = spans(segments);
	const out: Array<{ value: string; start: number; end: number }> = [];
	segments.forEach((segment, index) => {
		if (segment.kind !== 'token') return;
		const span = at[index];
		if (span) out.push({ value: segment.value, start: span.start, end: span.end });
	});
	return out;
}

/**
 * A splice's result: the new value, and the index of the segment the caret
 * belongs at the end of. `at` is `-1` when the replacement was empty, which is
 * how a caller knows to leave the caret alone.
 */
export type TokenBoxEdit = {
	readonly segments: readonly TokenBoxSegment[];
	readonly at: number;
};

/**
 * The value with the characters `[start, end)` replaced by `replacement`.
 *
 * Tokens are atomic here as everywhere: a range that touches any part of a token
 * takes the whole token with it, because half a token is not a value this model
 * can hold. Empty text runs are dropped, and adjacent text runs are left
 * separate — the derivation from the DOM merges them on the next read.
 *
 * `at` names the LAST replacement segment, because that is where the caret goes.
 */
export function splice(
	segments: readonly TokenBoxSegment[],
	start: number,
	end: number,
	replacement: readonly TokenBoxSegment[],
): TokenBoxEdit {
	const from = Math.max(0, Math.min(start, end));
	const to = Math.max(start, end);
	const at = spans(segments);
	const before: TokenBoxSegment[] = [];
	const after: TokenBoxSegment[] = [];

	segments.forEach((segment, index) => {
		const span = at[index];
		if (!span) return;
		if (span.end <= from) {
			before.push(segment);
			return;
		}
		if (span.start >= to) {
			after.push(segment);
			return;
		}
		if (segment.kind === 'token') return;
		const head = segment.text.slice(0, Math.max(0, from - span.start));
		const tail = segment.text.slice(Math.max(0, to - span.start));
		if (head !== '') before.push({ kind: 'text', text: head });
		if (tail !== '') after.push({ kind: 'text', text: tail });
	});

	const kept = before.filter(carries);
	const added = replacement.filter(carries);
	return {
		segments: [...kept, ...added, ...after.filter(carries)],
		at: added.length === 0 ? -1 : kept.length + added.length - 1,
	};
}

function carries(segment: TokenBoxSegment): boolean {
	return segment.kind === 'token' || segment.text !== '';
}

/**
 * The value with a token standing where `[start, end)` used to be, plus the
 * single space that follows it.
 *
 * The space is deliberate and it is behaviour, not decoration: a caret parked
 * between a `contenteditable="false"` island and the end of the host is a
 * well-known dead spot in every engine, so the family always leaves a text run
 * for the caret to land in. It is also what a person typing a mention expects —
 * `@alice ` and keep going.
 */
export function insertToken(
	segments: readonly TokenBoxSegment[],
	start: number,
	end: number,
	value: string,
	label: string,
): TokenBoxEdit {
	return splice(segments, start, end, [
		{ kind: 'token', value, label },
		{ kind: 'text', text: ' ' },
	]);
}

/** The value with `text` standing where `[start, end)` used to be. */
export function insertText(
	segments: readonly TokenBoxSegment[],
	start: number,
	end: number,
	text: string,
): TokenBoxEdit {
	return splice(segments, start, end, text === '' ? [] : [{ kind: 'text', text }]);
}

/**
 * How many segments of the same kind stand before `index` — which IS that
 * segment's position in the matching `element()` roster, because the surface
 * renders text runs and tokens in model order and a roster reads back in
 * document order. This is how the family reaches the element for a segment
 * without ever giving one an identity attribute to be found by.
 */
export function rosterIndex(segments: readonly TokenBoxSegment[], index: number): number {
	const kind = segments[index]?.kind;
	if (kind === undefined) return -1;
	let seen = 0;
	for (let scan = 0; scan < index; scan++) {
		if (segments[scan]?.kind === kind) seen += 1;
	}
	return seen;
}

/** The value with every token carrying `value` taken out of it. */
export function removeToken(
	segments: readonly TokenBoxSegment[],
	value: string,
): readonly TokenBoxSegment[] {
	const kept = segments.filter((segment) => segment.kind !== 'token' || segment.value !== value);
	return kept.length === segments.length ? segments : kept.filter(carries);
}

/**
 * The trigger context under a caret, or `undefined` when there is none.
 *
 * The rules, stated once: the trigger is ONE character from `triggers`; it sits
 * in the same text run as the caret; it is at the start of that run or right
 * after whitespace; and nothing between it and the caret is whitespace. A run
 * starts fresh after a token, so `@` immediately following a token is a trigger.
 *
 * `@ali ce` therefore stops being a trigger at the space — which is the
 * behaviour a mention popover wants, because the person has moved on.
 */
export function triggerAt(
	segments: readonly TokenBoxSegment[],
	caret: number,
	triggers: readonly string[],
): Omit<TokenBoxTrigger, 'rect'> | undefined {
	if (triggers.length === 0) return undefined;
	const at = spans(segments);

	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index];
		const span = at[index];
		if (!segment || !span || segment.kind !== 'text') continue;
		// A caret exactly on a boundary belongs to the run that ENDS there: that is
		// the run the next character would be typed into.
		if (caret <= span.start || caret > span.end) continue;

		const local = caret - span.start;
		for (let scan = local - 1; scan >= 0; scan--) {
			const char = segment.text[scan] ?? '';
			if (isBlank(char)) return undefined;
			if (!triggers.includes(char)) continue;
			const preceding = scan === 0 ? '' : (segment.text[scan - 1] ?? '');
			if (preceding !== '' && !isBlank(preceding)) return undefined;
			return {
				char,
				query: segment.text.slice(scan + 1, local),
				start: span.start + scan,
				end: caret,
			};
		}
		return undefined;
	}

	return undefined;
}

function isBlank(char: string): boolean {
	return char === '' ? false : char.trim() === '';
}

/**
 * The value as the hidden form field carries it: the segment array as JSON, keys
 * omitted. Documented on `TokenBoxFieldProps`; `parse` is its inverse.
 */
export function serialize(segments: readonly TokenBoxSegment[]): string {
	return JSON.stringify(
		segments.map((segment) =>
			segment.kind === 'text'
				? { kind: 'text', text: segment.text }
				: { kind: 'token', value: segment.value, label: segment.label },
		),
	);
}

/**
 * A serialized value back as segments. Anything that is not the shape this
 * family writes is dropped rather than guessed at, so a mangled field gives an
 * empty box instead of a half-parsed one.
 */
export function parse(text: string): readonly TokenBoxSegment[] {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return [];
	}
	if (!Array.isArray(raw)) return [];

	const out: TokenBoxSegment[] = [];
	for (const entry of raw) {
		if (typeof entry !== 'object' || entry === null) continue;
		const one = entry as Record<string, unknown>;
		if (one.kind === 'text' && typeof one.text === 'string') {
			out.push({ kind: 'text', text: one.text });
			continue;
		}
		if (one.kind === 'token' && typeof one.value === 'string' && typeof one.label === 'string') {
			out.push({ kind: 'token', value: one.value, label: one.label });
		}
	}
	return out.filter(carries);
}

/**
 * The segments the DOM is currently showing, rebuilt from one flattened string
 * and the offsets its tokens occupy.
 *
 * This is the derivation half of the v1 bet: the browser edited the text, and
 * this turns what it left behind back into a value without ever asking the DOM
 * what its children are. `token-range.ts` supplies the two arguments.
 */
export function fromParts(
	text: string,
	tokens: ReadonlyArray<{
		readonly start: number;
		readonly end: number;
		readonly value: string;
		readonly label: string;
	}>,
): readonly TokenBoxSegment[] {
	const out: TokenBoxSegment[] = [];
	let at = 0;
	for (const token of tokens) {
		if (token.start < at) continue;
		const between = text.slice(at, token.start);
		if (between !== '') out.push({ kind: 'text', text: between });
		out.push({ kind: 'token', value: token.value, label: token.label });
		at = token.end;
	}
	const tail = text.slice(at);
	if (tail !== '') out.push({ kind: 'text', text: tail });
	return out;
}

/** Whether two values hold the same text and the same tokens in the same order. */
export function same(
	left: readonly TokenBoxSegment[],
	right: readonly TokenBoxSegment[],
): boolean {
	return serialize(left) === serialize(right);
}
