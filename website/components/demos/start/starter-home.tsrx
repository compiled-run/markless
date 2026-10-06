import { state } from '@markless/core';

export default function Home() @{
	let count = state(0);

	<main>
		<style>
			main {
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				gap: var(--space-xs);
			}

			h1 {
				margin: 0;
				font-size: var(--step-2);
			}
		</style>
		<h1>Markless Router</h1>
		<button onClick={() => count++}>Count {count}</button>
	</main>
}
