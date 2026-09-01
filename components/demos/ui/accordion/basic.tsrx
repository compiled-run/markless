import { accordion } from '@markless/ui';

export default function AccordionBasic() @{
	<accordion.root class="accordion" value="ship">
		<accordion.item class="section" value="ship">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">When does my order ship?</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Orders leave within two working days.</accordion.itemcontent>
		</accordion.item>
		<accordion.item class="section" value="returns">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">How do I return something?</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Start a return from your orders page.</accordion.itemcontent>
		</accordion.item>
		<accordion.item class="section" value="overseas">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">Do you ship overseas?</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Everywhere but Antarctica.</accordion.itemcontent>
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

			.section[ui-open] .panel {
				padding: 0 0.8em 0.7em;
				font-size: var(--step--1);
			}
		</style>
	</accordion.root>
}
