import { state } from '@markless/core';
import { textbox } from '@markless/ui';

export default function Username() @{
	let name = state('');

	<section class="frame">
		<textbox.root
			class="field"
			name="username"
			required
			onChange={(value: string) => {
				name = value;
			}}
		>
			<textbox.label class="label">Username</textbox.label>
			<textbox.input class="input" />
			<textbox.description class="help">Letters and numbers, no spaces.</textbox.description>
		</textbox.root>
		<p class="echo">You typed: {name}</p>

		<style>
			.frame {
				display: grid;
				gap: 0.6em;
				width: min(20rem, 100%);
			}

			.field {
				display: grid;
				gap: 0.3em;
			}

			.label {
				font-weight: 700;
			}

			.input {
				padding: 0.45em 0.7em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
			}

			.field[ui-empty] .input {
				border-style: dashed;
			}

			.help {
				font-size: var(--step--1);
			}

			.echo {
				margin: 0;
				font-size: var(--step--1);
			}
		</style>
	</section>
}
