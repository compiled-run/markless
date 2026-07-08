import { state } from '@markless/core';
import { HarvestPanel } from './harvest-panel.tsrx';

// Composed-boundary page WITHOUT a boundary of its own: the only async
// boundary on the page belongs to the composed <HarvestPanel>.
export function App() @{
	let visits = state(0);

	<main>
		<h1 data-title>Orchard</h1>
		<button type="button" data-visit onClick={() => visits++}>{visits}</button>
		<HarvestPanel />
	</main>
}
