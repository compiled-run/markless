import { element } from '@markless/core';

// The same array prop, read one leaf at a time.
export function SpotListIndexed({ steps }) @{
	const indexedEl = element<HTMLDivElement>();

	<div
		data-tg-list-indexed
		el={indexedEl}
		onClick={() => {
			const root = indexedEl;
			const first = steps[0]?.target;
			const label = steps[0]?.label;
			root?.setAttribute('data-tg-probe', `${typeof first}|${label}`);
		}}
	>indexed</div>
}
