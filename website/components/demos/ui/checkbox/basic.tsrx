import { state } from '@markless/core';
import { checkbox } from '@markless/ui';

export default function CheckboxBasic() @{
	let ticked = state(false);

	<checkbox.root
		class="row"
		name="terms"
		checked={ticked}
		onChange={(next) => {
			ticked = next === true;
		}}
	>
		<checkbox.trigger class="box">
			<checkbox.indicator class="tick">✓</checkbox.indicator>
		</checkbox.trigger>
		<checkbox.label class="label">I accept the terms</checkbox.label>
		<checkbox.description class="hint">Read them before you tick this.</checkbox.description>
		<p class="note">
			checked is <span class="code">{ticked ? 'true' : 'false'}</span>
		</p>
		<checkbox.field />

		<style>
			.row {
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 0.25em 0.75em;
				align-items: center;
				box-sizing: border-box;
				width: min(22rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
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

			.box[ui-checked] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.box:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.box:disabled {
				cursor: not-allowed;
			}

			.tick {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 1.15em;
				line-height: 1;
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
			}

			.row:has(:required) .label::after {
				content: ' (required)';
				color: var(--muted-ink);
				font-size: var(--step--1);
			}

			.row[ui-disabled] {
				opacity: 0.55;
			}

			.row[ui-disabled] .label {
				cursor: not-allowed;
			}

			.hint,
			.note {
				grid-column: 2;
				margin: 0;
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.code {
				color: var(--ink);
				font-family: var(--font-mono);
			}

			@media (prefers-reduced-motion: reduce) {
				.box {
					transition: none;
				}
			}
		</style>
	</checkbox.root>;
}
