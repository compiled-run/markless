import { state } from '@markless/core';

export function App() @{
	let label = state('idle');

	<section class="behavior-check">
		<p
			data-isolated-behavior
			attach={(element) => { element.setAttribute('data-isolated-ready', 'yes'); }}
		>
			Behavior surface
		</p>
		<button type="button" data-plain-action onClick={() => label = 'plain'}>Plain action</button>
		<output data-plain-label>{label}</output>
	</section>
}
