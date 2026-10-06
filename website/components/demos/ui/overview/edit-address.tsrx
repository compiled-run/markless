import { modal } from '@markless/ui';

export default function EditAddress() @{
	<modal.root>
		<modal.trigger class="open">Edit address</modal.trigger>
		<modal.backdrop class="backdrop">
			<modal.content class="dialog">
				<modal.title class="title">Edit delivery address</modal.title>
				<modal.description>We will send your order here.</modal.description>
				<modal.close class="close">Cancel</modal.close>
			</modal.content>
		</modal.backdrop>

		<style>
			.open,
			.close {
				padding: 0.5em 0.9em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-weight: 700;
				cursor: pointer;
			}

			.open[ui-open] {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.backdrop:not([hidden]) {
				position: fixed;
				inset: 0;
				z-index: 50;
				display: grid;
				place-items: center;
				padding: 1rem;
				background: color-mix(in oklch, var(--ink) 45%, transparent);
			}

			.dialog {
				display: grid;
				gap: 0.75em;
				justify-items: start;
				box-sizing: border-box;
				width: min(24rem, 100%);
				padding: 1.25em;
				border: 2px solid var(--ink);
				border-radius: 8px;
				background: var(--paper);
				color: var(--ink);
			}

			.title {
				margin: 0;
				font-size: var(--step-1);
				text-shadow: none;
			}
		</style>
	</modal.root>
}
