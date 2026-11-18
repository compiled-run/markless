import { state } from '@markless/core';

// website/components/figures/async/board-anatomy.tsrx:74 and five more figures: a handler that asks the page.
export function App() @{
	let motion = state('unknown');
	let taps = state(0);
	<main>
		<p>{`Motion ${motion}`}</p>
		<button
			onClick={() => {
				motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
			}}
		>
			Ask the page
		</button>
		<button onClick={() => taps++}>{`Taps ${taps}`}</button>
	</main>
}
