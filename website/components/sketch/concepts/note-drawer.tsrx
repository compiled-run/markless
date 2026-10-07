import { state } from '@markless/core';

export default function NoteDrawer() @{
	let open = state(false);
	let note = state('');

	<section>
		<button onClick={() => (open = !open)}>
			Show or hide
		</button>
		@if (open) {
			<input
				aria-label="Note"
				value={note}
				onInput={(event) => {
					note = event.currentTarget.value;
				}}
			/>
		}
		<p>Saved: {note}</p>
		<style>
			section {
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				gap: 0.6rem;
			}

			button {
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

			input {
				font: inherit;
				font-size: var(--step-0);
				width: min(14rem, 100%);
				padding: 0.25em 0.5em;
				color: var(--ink);
				background: var(--paper);
				border: 2px solid var(--ink);
				border-radius: 2px;
			}

			p {
				margin: 0;
				font-size: var(--step-1);
			}
		</style>
	</section>
}
