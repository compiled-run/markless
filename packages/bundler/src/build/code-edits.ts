/** A replacement of `code.slice(start, end)`, at a range a parse or the build's facts gave. */
export type CodeEdit = { readonly start: number; readonly end: number; readonly text: string };

/** Applies edits by range; undefined when two of them overlap, so no edit lands on text another moved. */
export function applyCodeEdits(code: string, edits: readonly CodeEdit[]): string | undefined {
	const ordered = [...edits].sort((left, right) => left.start - right.start);
	for (let index = 1; index < ordered.length; index++)
		if (ordered[index]!.start < ordered[index - 1]!.end) return undefined;
	let next = '';
	let cursor = 0;
	for (const edit of ordered) {
		next += code.slice(cursor, edit.start) + edit.text;
		cursor = edit.end;
	}
	return next + code.slice(cursor);
}
