import { state } from '@markless/core';
import { Deck } from './nt-deck.tsrx';

export function App() @{
	let round = state(0);

	<main>
		<button type="button" data-refresh onClick={() => round = round + 1}>Next round</button>
		<Deck round={round} />
	</main>
}
