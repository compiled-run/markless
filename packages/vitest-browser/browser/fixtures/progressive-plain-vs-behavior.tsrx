import { state } from '@markless/core';

export function App() @{
	let label = state('idle');
	let behaviorTaps = state(0);

	<section class="behavior-check">
		<p
			data-isolated-behavior
			attach={(element) => { element.setAttribute('data-isolated-ready', 'yes'); }}
			onClick={() => behaviorTaps++}
		>
			Behavior surface {behaviorTaps}
		</p>
		<button type="button" data-plain-action onClick={() => label = 'plain'}>Plain action</button>
		<output data-plain-label>{label}</output>
	</section>
}
