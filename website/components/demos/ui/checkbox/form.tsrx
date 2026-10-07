import { state } from '@markless/core';
import { checkbox, textbox } from '@markless/ui';

export default function CheckboxForm() @{
	let sent = state('Nothing sent yet.');

	<form
		class="form"
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.target as HTMLFormElement);
			sent = `Sent email=${String(data.get('email'))} newsletter=${String(data.get('newsletter'))}`;
		}}
	>
		<textbox.root class="field" name="email" value="ada@example.com">
			<textbox.label class="label">Email</textbox.label>
			<textbox.input class="input" />
		</textbox.root>
		<checkbox.root class="row" required name="newsletter" value="weekly">
			<checkbox.field />
			<checkbox.trigger class="box">
				<checkbox.indicator class="tick">✓</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label class="label">Send me the weekly digest</checkbox.label>
			<checkbox.description class="hint">Required. One email each Monday.</checkbox.description>
		</checkbox.root>
		<button class="save" type="submit">Save</button>
		<p class="note">{sent}</p>

		<style>
			.form {
				display: grid;
				gap: 0.8em;
				justify-items: start;
				width: min(22rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.field {
				display: grid;
				gap: 0.3em;
				width: 100%;
			}

			.input {
				box-sizing: border-box;
				width: 100%;
				padding: 0.45em 0.7em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.input:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.row {
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 0.2em 0.75em;
				align-items: center;
			}

			.hint {
				grid-column: 2;
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.save {
				padding: 0.45em 0.9em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.save:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.save:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.save:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.note {
				margin: 0;
				color: var(--muted-ink);
				font-family: var(--font-mono);
			}

			.box {
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 1.75em;
				height: 1.75em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.box:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.box[ui-checked],
			.box[ui-mixed] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.box:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.tick {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 1.15em;
				line-height: 1;
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			@media (prefers-reduced-motion: reduce) {
				.box,
				.save {
					transition: none;
				}
			}
		</style>
	</form>;
}
