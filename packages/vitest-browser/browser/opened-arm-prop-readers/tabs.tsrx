import { state } from '@markless/core';
import Reader from './reader.tsrx';

export default function Tabs({ items }: { items: Array<number> }) @{
	let open = state(false);

	<div>
		<button data-switch onClick={() => (open = true)}>switch</button>
		@if (open) {
			<section>
				<Reader items={items} tag="a" />
				<Reader items={items} tag="b" />
			</section>
		} @else {
			<p>other tab</p>
		}
	</div>
}
