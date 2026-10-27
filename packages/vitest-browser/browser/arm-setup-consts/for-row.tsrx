import { state } from '@markless/core';

export function Rows() @{
	let marked = state('b');
	const items = [
		{ id: 'a', name: 'Ann' },
		{ id: 'b', name: 'Bo' },
	];

	<section>
		<button onClick={() => (marked = 'a')}>Mark a</button>
		<ul>
			@for (const item of items; key item.id) {
				const current = item.id === marked;
				<li aria-current={current}>{item.name}</li>
			}
		</ul>
	</section>
}
