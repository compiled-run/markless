import { state } from '@markless/core';

export default function TypoCount() @{
	let fixed = state(0);

	<button onClick={() => fixed++}>
		Typos fixed: {fixed}
		<style>
			button {
				padding: 0.5em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
			}

			button:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--cream));

				html.dark & {
					--ink: var(--on-accent);
					color: var(--on-accent);
				}
			}

			button:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--cream));

				html.dark & {
					--ink: var(--on-accent);
					color: var(--on-accent);
				}
			}

			button:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}
		</style>
	</button>
}
