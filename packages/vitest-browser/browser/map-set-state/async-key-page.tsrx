import { computed, state } from '@markless/core';

export function AsyncKeyPage() @{
	let ids = state(new Map([['a', 1], ['b', 2]]));
	let sel = state('a');
	const v = computed(async () => {
		const id = ids.get(sel);
		await new Promise((resolve) => setTimeout(resolve, 10));
		return 'user ' + id;
	});
	<div>
		@try { <output data-o>{v}</output> } @pending { <p>loading</p> } @catch { <p>err</p> }
		<button data-sel onClick={() => { sel = 'b'; }}>s</button>
		<button data-set onClick={() => { ids.set('b', 7); }}>m</button>
	</div>
}
