import { element } from '@markless/core';

// The handle carried inside an array of object literals instead of its own prop,
// read as a whole array. Its own module: a refused read attaches to every edge
// into the module it lives in, so a second part sharing this file is refused too.
export function SpotListWhole({ steps }) @{
	const rootEl = element<HTMLDivElement>();

	<div
		data-tg-list-whole
		el={rootEl}
		onClick={() => {
			const root = rootEl;
			root?.setAttribute('data-tg-probe', `${steps.length}`);
		}}
	>whole</div>
}
