import { state } from '@markless/core';

export default function MugName() @{
	let name = state('');
	let printed = state('nothing yet');

	<form
		onSubmit={(event) => {
			event.preventDefault();
			printed = name;
		}}
	>
		<label>
			Name for the mug
			<input
				value={name}
				onInput={(event) => {
					name = event.currentTarget.value;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Escape') name = '';
				}}
			/>
		</label>
		<p>Printed: {printed}</p>
		<style>
			form {
				display: grid;
				gap: 0.7em;
			}

			label {
				display: grid;
				gap: 0.3em;
				font-size: var(--step--1);
			}

			input {
				box-sizing: border-box;
				width: min(14rem, 100%);
				padding: 0.4em 0.6em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-size: var(--step-0);
			}

			input:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			p {
				margin: 0;
				font-size: var(--step-0);
			}
		</style>
	</form>
}
