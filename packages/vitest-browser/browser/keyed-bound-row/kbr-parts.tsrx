import { state } from '@markless/core';

export function Frame({ children }) @{
	<section data-frame>{children}</section>
}

export function Mark({ value, onPick }) @{
	const mark = state({ value, hits: 0 });
	<button
		type="button"
		data-mark
		onClick={() => {
			mark.hits = mark.hits + mark.value;
			onPick?.(mark.value);
		}}
	>{mark.hits}</button>
}
