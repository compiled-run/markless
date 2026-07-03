import { state } from '@markless/core';

export function App() @{
	let taps = state(0);

	<section>
		<p
			data-host
			attach={(element) => { element.setAttribute('data-behavior', 'on'); }}
			onClick={() => taps++}
		>
			Host
		</p>
		<output data-taps>{taps}</output>
	</section>
}
