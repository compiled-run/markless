import { select } from '@markless/ui';

export default function StyledPicker() @{
	<section class="frame">
		<select.root class="picker">
			<select.label class="label">Theme</select.label>
			<select.trigger class="trigger">Choose a theme</select.trigger>
			<select.content class="list">
				<select.item class="option" value="paper">
					<select.itemlabel>Paper</select.itemlabel>
					<select.itemindicator class="mark">✓</select.itemindicator>
				</select.item>
				<select.item class="option" value="ink">
					<select.itemlabel>Ink</select.itemlabel>
					<select.itemindicator class="mark">✓</select.itemindicator>
				</select.item>
				<select.item class="option" value="neon" disabled>
					<select.itemlabel>Neon</select.itemlabel>
					<select.itemindicator class="mark">✓</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>

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

			.picker[ui-open] .trigger {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.list:not([hidden]) {
				display: grid;
				border: 2px solid var(--ink);
				border-radius: 6px;
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
	</section>
}
