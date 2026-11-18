import { state } from '@markless/core';
import { Tally } from './tally.tsrx';

export function Menu({ items }: { readonly items: ReadonlyArray<string> }) @{
	const picked = state({ value: '' });
	<nav>
		<output data-picked>{picked.value}</output>
		@for (const item of items; key item) {
			<button type="button" data-item={item} onClick={() => { picked.value = item; }}>{item}</button>
		}
		<Tally items={items} />
	</nav>
}
