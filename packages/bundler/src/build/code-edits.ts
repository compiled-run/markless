/**
 * A replacement of `code.slice(start, end)`, at a range a parse or the build's facts gave. An edit that keeps part
 * of its range writes `before`, then that part with the edits inside it applied, then `after`.
 */
export type CodeEdit =
	| { readonly start: number; readonly end: number; readonly text: string }
	| {
			readonly start: number;
			readonly end: number;
			readonly before: string;
			readonly keep: { readonly start: number; readonly end: number };
			readonly after: string;
	  };

/**
 * Applies edits by range. An edit may sit inside the part another keeps; undefined when two edits overlap any other
 * way, so no edit lands on text another moved or dropped.
 */
export function applyCodeEdits(code: string, edits: readonly CodeEdit[]): string | undefined {
	const ordered = [...edits].sort(
		(left, right) => left.start - right.start || right.end - left.end,
	);
	let failed = false;
	const render = (from: number, to: number, inside: readonly CodeEdit[]): string => {
		let next = '';
		let cursor = from;
		for (let index = 0; index < inside.length; index++) {
			const edit = inside[index]!;
			let last = index;
			while (last + 1 < inside.length && inside[last + 1]!.start < edit.end) last++;
			const nested = inside.slice(index + 1, last + 1);
			index = last;
			if ('text' in edit) {
				if (nested.length) failed = true;
				next += code.slice(cursor, edit.start) + edit.text;
			} else {
				if (nested.some((item) => item.start < edit.keep.start || item.end > edit.keep.end))
					failed = true;
				next +=
					code.slice(cursor, edit.start) +
					edit.before +
					render(edit.keep.start, edit.keep.end, nested) +
					edit.after;
			}
			cursor = edit.end;
		}
		return next + code.slice(cursor, to);
	};
	const next = render(0, code.length, ordered);
	return failed ? undefined : next;
}
