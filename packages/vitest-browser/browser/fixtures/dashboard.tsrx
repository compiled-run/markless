import { state } from '@markless/core';
import { StatusBadge } from './status-badge.tsrx';

export function App() @{
	let streaming = state(true);

	<main>
		<button onClick={() => streaming = !streaming}>Toggle</button>
		<StatusBadge active={streaming} />
	</main>
}
