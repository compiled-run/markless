import { state } from '@markless/core';

export default function RolledOnce() @{
	let count = state(0);
	const roll = Math.floor(Math.random() * 6) + 1;

	<section>
		<style>
			section {
				display: flex;
				flex-direction: column;
				gap: var(--space-xs);
			}

			p {
				margin: 0;
				font-size: var(--step-1);
			}
		</style>
		<p>Rolled when the component ran: {roll}</p>
		<button onClick={() => count++}>Count {count}</button>
	</section>
}
