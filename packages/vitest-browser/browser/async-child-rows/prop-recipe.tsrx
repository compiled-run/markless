import { state } from '@markless/core';
import { Shelf } from './shelf.tsrx';

export default function PropRecipe() @{
	let version = state(0);
	let lists = state([
		{ id: 1, tag: 'a' },
		{ id: 2, tag: 'b' },
	]);

	<main>
		<button data-refetch onClick={() => version++}>Refetch</button>
		@for (const list of lists; key list.id) {
			<section data-list>
				<Shelf tag={list.tag} version={version} />
			</section>
		}
	</main>
}
