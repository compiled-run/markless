import { state } from '@markless/core';
import { Pane } from './pane.tsrx';

export default function App() @{
	let selected = state<number | null>(1);
	<main>
		<button data-pick onClick={() => (selected = 2)}>Two</button>
		<Pane id={(selected as number)} />
	</main>
}
