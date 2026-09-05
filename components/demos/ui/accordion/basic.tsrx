import { accordion } from '@markless/ui';

export default function AccordionBasic() @{
	const questions = [
		{ value: 'ship', question: 'How long does shipping take?', answer: 'Orders ship within 2 business days. Delivery takes 3–5 business days.' },
		{ value: 'returns', question: 'What is your return policy?', answer: 'Start a return from your orders page.' },
		{ value: 'overseas', question: 'Do you ship overseas?', answer: 'Everywhere but Antarctica.' },
	];

	<accordion.root class="accordion" value="ship">
		{/* A repeat cannot open directly inside a component tag, so a host element carries it. */}
		<div class="sections" role="presentation">
			@for (const q of questions; key q.value) {
				<accordion.item class="section" value={q.value}>
					<accordion.itemlabel class="heading">
						<accordion.itemtrigger class="trigger">
							{q.question}
							<span class="trigger-icon" aria-hidden="true"></span>
						</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent class="panel">{q.answer}</accordion.itemcontent>
				</accordion.item>
			}
		</div>

		<style>
			.accordion {
				display: grid;
				width: 100%;
				color: #202023;
				font-family: system-ui, sans-serif;
			}
			.sections {
				display: contents;
			}
			.section {
				border-bottom: 1px solid #c8c8cd;
				background: #fff;
			}
			.section:last-child {
				border-bottom: 0;
			}
			.heading {
				margin: 0;
				font:
					600 1rem/1.5 system-ui,
					sans-serif;
				text-shadow: none;
			}
			.trigger {
				display: flex;
				gap: 1rem;
				align-items: center;
				justify-content: space-between;
				box-sizing: border-box;
				width: 100%;
				padding: 1.15rem 2rem;
				border: 0;
				background: transparent;
				color: #202023;
				font:
					600 1rem/1.5 system-ui,
					sans-serif;
				text-align: left;
				cursor: pointer;
			}
			.trigger-icon {
				flex: none;
				width: 1.2rem;
				font:
					400 1.5rem/1 system-ui,
					sans-serif;
			}
			.trigger-icon::before {
				content: '+';
			}
			.trigger[aria-expanded='true'] .trigger-icon::before {
				content: '−';
			}
			.trigger:hover {
				background: #f8f5fc;
			}
			.trigger:focus-visible {
				outline: 2px dashed #202023;
				outline-offset: -5px;
			}
			.trigger:disabled {
				cursor: not-allowed;
				opacity: 0.5;
			}
			.panel {
				font:
					400 0.95rem/1.7 system-ui,
					sans-serif;
			}
			.panel[ui-open] {
				padding: 0.25rem 2rem 1.6rem;
			}
			.panel[hidden] {
				display: none;
			}
			html[data-variant='b'] .accordion,
			html[data-variant='c'] .accordion {
				width: calc(100% - 5rem);
				margin: 1.5rem 2.5rem;
			}
			html[data-variant='b'] .trigger,
			html[data-variant='c'] .trigger {
				padding-inline: 0.75rem;
			}
			html[data-variant='b'] .panel[ui-open] {
				padding-inline: 0.75rem;
			}
			html[data-variant='c'] .trigger,
			html[data-variant='d'] .trigger {
				justify-content: start;
			}
			html[data-variant='c'] .trigger-icon,
			html[data-variant='d'] .trigger-icon {
				order: -1;
			}
			html[data-variant='c'] .panel[ui-open] {
				padding-left: 2.95rem;
			}
			html[data-variant='d'] .panel[ui-open] {
				padding-left: 4.2rem;
			}
			@media (max-width: 600px) {
				.trigger {
					padding: 1rem;
					font-size: 0.95rem;
				}
				.panel[ui-open] {
					padding: 0.1rem 1rem 1.2rem;
				}
				html[data-variant='b'] .accordion,
				html[data-variant='c'] .accordion {
					width: calc(100% - 2rem);
					margin: 1rem;
				}
				html[data-variant='d'] .panel[ui-open] {
					padding-left: 3.2rem;
				}
			}
		</style>
	</accordion.root>
}
