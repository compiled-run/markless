import { state } from '@markless/core';

export default function CountTabs({ items }: { items: Array<string> }) @{
	let tab = state('a');

	<div>
		<button data-tab onClick={() => (tab = tab === 'a' ? 'b' : 'a')}>Tab</button>
		@if (tab === 'a') {
			<p data-first>{items.length}</p>
		} @else {
			<p data-other>other</p>
		}
	</div>
}
