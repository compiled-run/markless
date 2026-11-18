import { state } from '@markless/core';
import { Shelf } from './shelf.tsrx';

export default function RowsAdded() @{
	let lists = state([
		{ id: 1, tag: 'a' },
		{ id: 2, tag: 'b' },
	]);

	<main>
		<button data-add onClick={() => (lists = [...lists, { id: lists.length + 1, tag: 'new' }])}>Add list</button>
		@for (const list of lists; key list.id) {
			<section data-list>
				<Shelf tag={list.tag} version={0} />
			</section>
		}
	</main>
}
