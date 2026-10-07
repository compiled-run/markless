import { state } from '@markless/core';

function Picker({ name, onPick }: { name: string; onPick: (name: string) => void }) @{
	<button onClick={() => onPick(name)}>
		Pick {name}
		<style>
			button {
				display: grid;
				gap: 0.35em;
				justify-items: start;
				padding: 0.7em 1em 0.8em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				text-align: start;
				cursor: pointer;
				transition: background 140ms ease;
			}

			button::before {
				content: 'child: Picker' / '';
				color: var(--muted-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
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
	</button>
}

export default function NamePicker() @{
	let picked = state('nobody');

	<section>
		<p>Picked: <strong>{picked}</strong></p>
		<Picker name="Ada" onPick={(name) => (picked = name)} />
		<Picker name="Grace" onPick={(name) => (picked = name)} />
		<style>
			section {
				position: relative;
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 0.7em;
				width: min(31rem, 100%);
				box-sizing: border-box;
				padding: 2.4em 1em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
			}

			section::before {
				content: 'parent: NamePicker' / '';
				position: absolute;
				inset-block-start: 0.7em;
				inset-inline-start: 1em;
				color: var(--muted-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
			}

			p {
				grid-column: 1 / -1;
				margin: 0 0 0.3em;
				font-size: var(--step-0);
			}

			strong {
				padding: 0 0.25em;
				border-radius: 3px;
				background: var(--mark);
				font-weight: 700;
			}

		</style>
	</section>
}
