import { state } from '@markless/core';

export function App() @{
	let tag = state('article');
	let _chosen = state('');

	<section>
		<{tag} class="card">Hi</{tag}>
		<button type="button" data-go onClick={() => _chosen = 'x'}>Go</button>
	</section>
}
