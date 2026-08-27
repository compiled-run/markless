import { element } from '@markless/core';

// The shape the element-handle refusal actually names: a handle reached through
// a nested object prop rather than passed as its own. Fetched inside the test,
// because it does not compile.
function NestedSpot({ config }) @{
	<div data-tg-nested-spot el={config.target}>measure</div>
}

export default function TourNestedHandlePage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-nested-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<NestedSpot config={{ target }} />
	</section>
}
