import { accordion } from '@markless/ui';
import { lucide, ph, tabler } from '@markless/icons';

export default function AccordionBasic() @{
	const questions = [
		{ value: 'ship', question: 'When does my order ship?', answer: 'Orders leave within two working days.' },
		{ value: 'returns', question: 'How do I return something?', answer: 'Start a return from your orders page.' },
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
							<span class="trigger-icons" aria-hidden="true">
								<lucide.chevrondown class="ico ico-a" />
								<ph.caretdown class="ico ico-b" />
								<tabler.chevrondown class="ico ico-c" />
							</span>
						</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent class="panel">{q.answer}</accordion.itemcontent>
				</accordion.item>
			}
		</div>

		<style>
			.accordion {
				display: grid;
				gap: 0.5em;
				width: min(32rem, 100%);
			}

			.sections {
				display: contents;
			}

			.section {
				border: var(--card-edge);
				border-radius: 6px;
				background: var(--paper);
				overflow: clip;
			}

			.section[ui-open] {
				box-shadow: var(--card-shadow);
			}

			html[data-theme='dark'] .section {
				background: var(--raised);
			}

			html[data-variant='b'] .section[ui-open] {
				border: var(--state-selected-edge);
				transform: rotate(0.6deg);
			}

			html[data-variant='c'] .section {
				border: 0;
				border-block-end: 1px solid color-mix(in oklch, var(--ink) 30%, transparent);
				border-radius: 0;
				box-shadow: none;
			}

			html[data-variant='c'] .section[ui-open] {
				border-inline-start: 4px solid var(--ink);
			}

			.heading {
				margin: 0;
				font-size: var(--step-0);
			}

			.trigger {
				position: relative;
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				width: 100%;
				padding: 0.6em 0.8em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				font-weight: 700;
				text-align: left;
				cursor: pointer;
			}

			.trigger-icons {
				display: inline-flex;
				transition: transform 140ms ease;
			}

			.trigger[ui-open] .trigger-icons {
				transform: rotate(180deg);
			}

			.trigger:hover {
				background: var(--state-hover-bg);
				color: var(--state-hover-fg);
			}

			html[data-variant='a'] .section[ui-open] .trigger::before,
			html[data-variant='c'] .section[ui-open] .trigger::before {
				content: '';
				position: absolute;
				inset: 0.55em 2.2em 0.55em 0.65em;
				z-index: -1;
				background: var(--swipe);
				transform: rotate(-1deg);
			}

			html[data-variant='a'] .section[ui-open] .trigger,
			html[data-variant='c'] .section[ui-open] .trigger {
				isolation: isolate;
			}

			html[data-variant='c'] .section[ui-open] .trigger::before {
				inset-block: auto 0.62em;
				height: 0.35em;
				background: var(--yellow);
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
