import { state } from '@markless/core';

export function Rows() @{
	let selected = state('a');
	const items = [
		{ id: 'a', name: 'Ann' },
		{ id: 'b', name: 'Bo' },
	];

	<section>
		<button onClick={() => (selected = 'b')}>Pick b</button>
		<ul>
			@for (const item of items; key item.id) {
				const picked = item.id === selected;
				<li
					data-direct
					style={{ fontWeight: item.id === selected ? 700 : 400, color: picked ? 'red' : 'black' }}
				>
					{item.name}
				</li>
			}
		</ul>
	</section>
}
