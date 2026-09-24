import { computed, state } from '@markless/core';

export function App() @{
	let reveals = state(0);
	let doubled = computed(() => reveals * 2);
	let snapshot = state(0);

	<main>
		<h1 onVisible={() => reveals++}>Above the fold</h1>
		<output>{reveals}</output>
		<button data-add onClick={() => (reveals += 10)}>Add ten</button>
		<button data-snapshot onClick={() => (snapshot = doubled)}>Snapshot doubled</button>
		<span data-snapshot-value>{snapshot}</span>
		@if (reveals) { <p data-seen>seen</p> } @else { <p data-unseen>unseen</p> }
		@if (reveals > 1) { <p data-many>many</p> }
		<div style="height: 3000px">spacer</div>
		<footer onVisible={() => reveals++}>Below the fold</footer>
	</main>
}
