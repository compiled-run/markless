import { element, state } from '@markless/core';

export function App() @{
	let box = element();
	let status = state('idle');

	<section>
		<input data-box el={box} />
		<button type="button" data-focus onClick={() => { box.focus(); status = 'focused'; }}>
			Focus
		</button>
		<output data-status>{status}</output>
	</section>
}
