import { state } from '@markless/core';

export function App() @{
	let label = state('Hi');

	<section class="card" data-styled-host>
		<style>
			.card {
				color: red;
			}
		</style>
		<p>{label}</p>
	</section>
}
