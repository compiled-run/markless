import { accordion } from '@markless/ui';
import { lucide } from '@markless/ui';

export default function AccordionLocked() @{
	const options = [
		{ value: 'ship', name: 'Standard delivery', detail: 'Two working days, no charge over twenty pounds.' },
		{ value: 'express', name: 'Express delivery', detail: 'Next working day if you order before noon.' },
	];

	<accordion.root class="accordion" value="ship" collapsible={false}>
		@for (const option of options; key option.value) {
			<accordion.item class="section" value={option.value}>
				<accordion.itemlabel class="heading">
					<accordion.itemtrigger class="trigger">
						{option.name}
						<lucide.chevrondown class="trigger-icon" aria-hidden="true" />
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent class="panel">{option.detail}</accordion.itemcontent>
			</accordion.item>
		}

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

			.trigger-icon {
				display: inline-flex;
				width: 1em;
				height: 1em;
				flex: none;
				transition: transform 140ms ease;
			}

			.trigger[ui-open] .trigger-icon {
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

			.panel[hidden] {
				display: none;
			}
		</style>
	</accordion.root>
}
