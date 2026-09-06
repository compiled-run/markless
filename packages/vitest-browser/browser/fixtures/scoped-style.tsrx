import { state } from '@markless/core';

export function App() @{
	let label = state('Hi');

	<section class="card">
		<style>
			.card { color: rgb(200, 0, 0); }
			.title { font-weight: 700; }
			.title::after { content: '\2605'; }
			@media (min-width: 1px) { .card > .title { letter-spacing: 2px; } }
			@KEYFRAMES markless-fade { from { opacity: 0.5; } to { opacity: 1; } }
		</style>
		<h2 class="title">{label}</h2>
	</section>
}
