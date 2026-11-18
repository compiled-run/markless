// The source the compiler figure starts from, and the fixed rows its source sheet and slips share.
export const START_SOURCE = `import { state } from '@markless/core';

export default function Chat() @{
	let draft = state('Hi');

	<>
		<p>Typing: {draft}</p>
		<input
			onInput={(e) => (draft = e.target.value)}
		/>
	</>
}`;

export const LINE_SLOTS = 12;
export const PIECE_SLOTS = 4;

/** Where slip `index` of `count` sits on the sheet, in source rows: its top, its height and its middle. */
export function slipRows(index: number, count: number) {
	const per = LINE_SLOTS / Math.max(3, Math.min(count, PIECE_SLOTS));
	const height = per - 0.7;
	const top = index * per + 0.35;
	return { top, height, middle: top + height / 2 };
}

/** A thin curve across the gutter from the middle of source row `line` to the middle of slip `index`, in a 40-wide box ten units per row. */
export function connector(line: number, index: number, count: number) {
	const from = (line + 0.5) * 10;
	const to = slipRows(index, count).middle * 10;
	return `M1 ${from.toFixed(1)}C22 ${from.toFixed(1)} 18 ${to.toFixed(1)} 39 ${to.toFixed(1)}`;
}
