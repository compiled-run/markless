import { computed, state } from '@markless/core';

export default function Basket() @{
	let mugs = state(1);
	let coasters = state(0);
	const total = computed(
		() => mugs * 12 + coasters * 3,
	);

	<section>
		<p>Mugs: {mugs}</p>
		<p>Coasters: {coasters}</p>
		<p>Total: {total}</p>
		<button onClick={() => mugs++}>
			One more mug
		</button>
		<button onClick={() => coasters++}>
			One more coaster
		</button>
		<style>
			p {
				margin: 0 0 0.4rem;
				font-size: var(--step-1);
			}

			button {
				margin: 0.3rem 0.5rem 0 0;
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
