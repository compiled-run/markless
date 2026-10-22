import { state } from '@markless/core';

export function Basket() @{
	let items = state([{ id: 1, name: 'pear', qty: 2 }]);
	let picked = state('');
	<main>
		<button type="button" data-add onClick={() => (items = [...items, { id: 2, name: 'fig', qty: 5 }])}>add</button>
		<ul>
			@for (const item of items; key item.id) {
				const label = `${item.name} x${item.qty}`;
				<li title={label} onClick={() => (picked = label)}>{label}</li>
			}
		</ul>
		<output>{picked}</output>
	</main>
}
