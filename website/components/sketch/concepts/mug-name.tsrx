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
		<input
			aria-label="Mug name"
			value={name}
			onInput={(event) => {
				name = event.currentTarget.value;
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') name = '';
			}}
		/>
		<p>Printed: {printed}</p>
		<style>
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
				margin: 0.6rem 0 0;
				font-size: var(--step-1);
			}
		</style>
	</form>
}
