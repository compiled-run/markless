import type { Children } from '@markless/core';
import { shared, state } from '@markless/core';

export const tally = shared(
	() => {
		const box = state({ count: 0 });
		return { ...box, increment() { box.count++; } };
	},
	{ scope: 'page' },
);

export function Tally({ label, children }: { label: string; children?: Children }) @{
	const t = tally();

	<p>
		{label}: {children} <button onClick={() => t.increment()}>Add one</button>
		<style>
			p {
				position: relative;
				display: grid;
				justify-items: center;
				gap: 0.4em;
				min-width: 8.5em;
				margin: 0;
				padding: 0.9em 1.2em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
			}

			button {
				padding: 0.3em 0.9em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
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
	</p>
}

export function Badge() @{
	const t = tally();

	<output>
		{t.count}
		<style>
			output {
				font-size: var(--step-2);
				font-weight: 700;
				line-height: 1.1;
			}
		</style>
	</output>
}
