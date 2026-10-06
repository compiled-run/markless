import { state } from '@markless/core';

export default function Pour() @{
	let cups = state(0);
	const drawn = Math.ceil(Math.random() * 99);

	<section>
		<p>Cups today: {cups}</p>
		<p>Drawn once: {drawn}</p>
		<button onClick={() => cups++}>Pour one</button>
		<style>
			p {
				margin: 0 0 0.4rem;
				font-size: var(--step-1);
			}

			button {
				margin-top: 0.3rem;
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}
		</style>
	</section>
}
