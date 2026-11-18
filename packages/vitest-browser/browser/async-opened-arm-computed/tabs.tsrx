import { state } from '@markless/core';
import Derived from './derived.tsrx';

export default function Tabs({ items }: { items: Array<number> }) @{
	let open = state(false);

	<div>
		<button data-switch onClick={() => (open = true)}>switch</button>
		@if (open) {
			<Derived items={items} />
		} @else {
			<p>other tab</p>
		}
	</div>
}
