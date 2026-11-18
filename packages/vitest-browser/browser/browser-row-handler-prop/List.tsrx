import { state } from '@markless/core';
import Row from './Row.tsrx';

export default function List() @{
	let items = state([{ id: 'ada' }]);
	let picked = state('');

	<section>
		<button class="add" onClick={() => (items = [...items, { id: `n${items.length}` }])}>add</button>
		<span class="picked">{picked}</span>
		<ul>
			@for (const item of items; key item.id) {
				<li data-item={item.id}>
					<button class="pick" onClick={() => (picked = item.id)}>pick</button>
					<Row id={item.id} />
				</li>
			}
		</ul>
	</section>
}
