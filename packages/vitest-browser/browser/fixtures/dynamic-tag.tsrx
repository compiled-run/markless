import { state } from '@markless/core';

export function App() @{
	let tag = state('article');
	let chosen = state('');

	<section>
		<{tag} class="card">Hi</{tag}>
		<button type="button" data-go onClick={() => chosen = 'x'}>Go</button>
	</section>
}
