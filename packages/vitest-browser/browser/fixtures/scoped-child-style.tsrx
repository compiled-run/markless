import { state } from '@markless/core';

export function App() @{
	let count = state(3);

	<section class="page">
		<style>
			.page { display: flex; }
		</style>
		<Badge value={count} />
		<button type="button" data-bump onClick={() => count = count + 1}>bump</button>
	</section>
}

function Badge({ value }) @{
	<article class="badge" data-badge>
		<style>
			.badge { color: rgb(0, 128, 0); }
			.badge strong { font-weight: 700; }
		</style>
		<strong data-count>{value}</strong>
	</article>
}
