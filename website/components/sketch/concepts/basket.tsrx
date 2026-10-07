import { computed, state } from '@markless/core';

export default function Basket() @{
	let mugs = state(1);
	let coasters = state(0);
	const total = computed(() => mugs * 12 + coasters * 3);

	<section>
		<p>Mugs: {mugs}</p>
		<p>Coasters: {coasters}</p>
		<p>Total: {total}</p>
		<button onClick={() => mugs++}>One more mug</button>
		<button onClick={() => coasters++}>One more coaster</button>
		<style>
			section {
				display: flex;
				flex-wrap: wrap;
				gap: 0.7em;
			}

			p {
				flex-basis: 100%;
			}

			p {
				margin: 0;
				font-size: var(--step-0);
			}

			button {
				padding: 0.45em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				white-space: nowrap;
				cursor: pointer;
				transition: background 140ms ease;
			}

			button:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			button:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			button:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			@media (prefers-reduced-motion: reduce) {
				button {
					transition: none;
				}
			}
		</style>
	</section>
}
