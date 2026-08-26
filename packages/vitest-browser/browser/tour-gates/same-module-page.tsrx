import { element } from '@markless/core';

// The control for the cross-module edge: the identical bare handle prop, with
// the part declared in the SAME module as the consumer. Reached through fetch in
// the test, because it does not compile.
function SameSpot({ target }) @{
	const rootEl = element<HTMLDivElement>();

	<div
		data-tg-same-spot
		el={rootEl}
		onClick={() => {
			const root = rootEl;
			root?.setAttribute('data-tg-probe', typeof target);
		}}
	>measure</div>
}

export default function TourSameModulePage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-same-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<SameSpot target={target} />
	</section>
}
