import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function DependentE() @{
	let items = state({ a1: 'apple', b2: 'banana' } as Record<string, string>);
	const pick = computed(async ({ signal }) => {
		note('pick');
		return await load('pick', 'a1', signal);
	});
	const chosen = computed(() => items[pick]);
	<div>
		@try { <output data-o>{chosen}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-rename onClick={() => { items.a1 = 'apricot'; }}>r</button>
		<button data-other onClick={() => { items.b2 = 'blueberry'; }}>o</button>
	</div>
}
