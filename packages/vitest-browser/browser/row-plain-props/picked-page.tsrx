import { state } from '@markless/core';
import Row from './row.tsrx';

export default function PickedPage() @{
	let picked = state('a');
	let items = state([{ id: 'a' }, { id: 'b' }]);

	<main>
		<ul>
			@for (const item of items; key item.id) {
				<Row id={item.id} picked={picked} />
			}
		</ul>
		<button data-pick onClick={() => (picked = 'b')}>Pick b</button>
	</main>
}
