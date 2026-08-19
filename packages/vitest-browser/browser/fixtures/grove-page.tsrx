import { state } from '@markless/core';
import { GrovePanel } from './grove-panel.tsrx';

// A page whose only async boundary belongs to the composed <GrovePanel>, so
// every record the boundary commits lives under the child's c<N>: instance path.
export function App() @{
	let visits = state(0);

	<main>
		<button type="button" data-grove-visit onClick={() => visits++}>{visits}</button>
		<GrovePanel />
	</main>
}
