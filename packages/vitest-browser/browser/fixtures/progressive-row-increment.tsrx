import { state } from '@markless/core';

export function App() @{
	let picks = state(0);
	let cards = state([
		{ key: 'north', caption: 'North panel' },
		{ key: 'south', caption: 'South panel' },
	]);

	<section class="row-board">
		<section class="row-list">
			@for (const card of cards; key card.key) {
				<article data-row>
					<h3>{card.caption}</h3>
					<button type="button" data-row-increment onClick={() => picks++}>Pick</button>
				</article>
			}
		</section>
		<output data-picks>Picks {picks}</output>
	</section>
}
