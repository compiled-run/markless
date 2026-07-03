import { state } from '@markless/core';

export function App() @{
	let label = state('Hi');

	<section class="card">
		<style>
			.card { color: rgb(200, 0, 0); }
			.title { font-weight: 700; }
		</style>
		<h2 class="title">{label}</h2>
	</section>
}
