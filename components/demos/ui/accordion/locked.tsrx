import { accordion } from '@markless/ui';

export default function AccordionLocked() @{
	<accordion.root class="accordion" value="ship" collapsible={false}>
		<accordion.item class="section" value="ship">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">Standard delivery</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Two working days, no charge over twenty pounds.</accordion.itemcontent>
		</accordion.item>
		<accordion.item class="section" value="express">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">Express delivery</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Next working day if you order before noon.</accordion.itemcontent>
		</accordion.item>

		<style>
			.accordion {
				display: grid;
				gap: 0.5em;
				width: min(32rem, 100%);
			}

			.section {
				border: 2px solid var(--code-edge);
				border-radius: 6px;
				background: var(--paper);
				overflow: clip;
			}

			.section[ui-open] {
				border-color: var(--pink);
			}

			.heading {
				margin: 0;
				font-size: var(--step-0);
			}

			.trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				width: 100%;
				padding: 0.6em 0.8em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-weight: 700;
				text-align: left;
				cursor: pointer;
			}

			.trigger::after {
				content: '▾';
				transition: transform 140ms ease;
			}

			.trigger[ui-open]::after {
				transform: rotate(180deg);
			}

			.trigger:hover {
				background: var(--tinted-quiet);
			}

			.trigger:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.panel {
				padding: 0 0.8em 0.7em;
				font-size: var(--step--1);
			}
		</style>
	</accordion.root>
}
