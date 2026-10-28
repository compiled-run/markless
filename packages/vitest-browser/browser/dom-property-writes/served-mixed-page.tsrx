import { state } from '@markless/core';

// A checkbox that is "mixed" before anything happens on the page.
export default function ServedMixedPage() @{
	let mixed = state(true);
	<label>
		<input id="all" type="checkbox" indeterminate={mixed} onChange={() => (mixed = false)} />
		All files
	</label>
}
