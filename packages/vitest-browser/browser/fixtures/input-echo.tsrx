import { state } from '@markless/core';

export function App() @{
	let name = state('start');

	<section>
		<input data-name value={name} onInput={(event) => name = event.currentTarget.value} />
		<button type="button" data-reset onClick={() => name = 'reset'}>Reset</button>
		<output data-echo>{name}</output>
	</section>
}
