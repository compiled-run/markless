import { state } from '@markless/core';

export function Steps() @{
	let steps = state([{ id: 1, name: 'one' }]);
	<main>
		<button type="button" onClick={() => (steps = [...steps, { id: steps.length + 1, name: 'more' }])}>add</button>
		<ol>
			@for (const step of steps; index i; key step.id) {
				<li>{i + 1}: {step.name}</li>
			}
		</ol>
	</main>
}
