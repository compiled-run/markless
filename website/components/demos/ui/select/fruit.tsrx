import { state } from '@markless/core';
import { select } from '@markless/ui';

export default function Fruit() @{
	let shown = state('Choose a fruit');

	<select.root
		class="picker"
		name="fruit"
		onChange={(value: string) => {
			shown = value;
		}}
	>
		<select.label class="label">Favourite fruit</select.label>
		<select.trigger class="trigger"><span>{shown}</span></select.trigger>
		<select.content class="list">
			<select.item class="option" value="Apple">
				<select.itemlabel>Apple</select.itemlabel>
				<select.itemindicator class="mark">✓</select.itemindicator>
			</select.item>
			<select.item class="option" value="Banana">
				<select.itemlabel>Banana</select.itemlabel>
				<select.itemindicator class="mark">✓</select.itemindicator>
			</select.item>
			<select.item class="option" value="Cherry" disabled>
				<select.itemlabel>Cherry</select.itemlabel>
				<select.itemindicator class="mark">✓</select.itemindicator>
			</select.item>
		</select.content>
		<select.field />

		<style>
			.picker {
				display: grid;
				gap: 0.4em;
				width: min(16rem, 100%);
			}

			.label {
				font-weight: 700;
			}

			.trigger {
				padding: 0.5em 0.9em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				text-align: start;
				cursor: pointer;
			}

			.trigger[ui-open] {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.list:not([hidden]) {
				display: grid;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				overflow: clip;
			}

			.option {
				display: flex;
				justify-content: space-between;
				padding: 0.45em 0.9em;
				cursor: pointer;
			}

			.option:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -4px;
			}

			.option[ui-selected] {
				font-weight: 700;
			}

			.option[ui-disabled] {
				opacity: 0.5;
				cursor: not-allowed;
			}

			.mark[ui-hidden] {
				visibility: hidden;
			}
		</style>
	</select.root>
}
