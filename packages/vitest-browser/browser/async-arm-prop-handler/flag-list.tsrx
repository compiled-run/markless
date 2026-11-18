import { state } from '@markless/core';

// A handler plus an @if over the async value this component got as a prop.
export default function FlagList({ items }: { items: Array<string> }) @{
	let clicks = state(0);

	<div data-flag-list>
		<button data-click onClick={() => clicks++}>Click</button>
		<span data-handled>{clicks}</span>
		@if (items.length > 1) {
			<p data-many>many</p>
		}
	</div>
}
