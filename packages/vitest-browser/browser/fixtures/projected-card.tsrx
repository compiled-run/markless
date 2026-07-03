import { state } from '@markless/core';
import { Card } from './card.tsrx';

export function App() @{
	let note = state('none');

	<main>
		<Card>
			<p class="projected">Projected content</p>
		</Card>
		<button onClick={() => note = 'clicked'}>Go</button>
		<output>{note}</output>
	</main>
}
