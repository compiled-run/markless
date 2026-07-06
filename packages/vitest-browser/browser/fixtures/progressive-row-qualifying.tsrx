import { state } from '@markless/core';

export function App() @{
	let chosen = state('none');
	let cards = state([
		{ key: 'north', caption: 'North panel' },
		{ key: 'south', caption: 'South panel' },
	]);

	<section class="row-board">
		<section class="row-list">
			@for (const card of cards; key card.key) {
				<article data-row>
					<h3>{card.caption}</h3>
					<button type="button" onClick={() => chosen = card.key}>Mark</button>
				</article>
			}
		</section>
		<output data-choice>{chosen}</output>
	</section>
}
