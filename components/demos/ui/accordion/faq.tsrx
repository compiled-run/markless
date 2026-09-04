import { accordion } from '@markless/ui';
import { lucide, ph, tabler } from '@markless/icons';

export default function Faq() @{
	const questions = [
		{
			value: 'ship',
			question: 'When does my order ship?',
			answer:
				'Orders placed before 3pm leave the same working day. You get a tracking link as soon as the parcel is scanned.',
		},
		{
			value: 'returns',
			question: 'How do I return something?',
			answer:
				'Start a return from your orders page within 30 days. Post it back with the printed label and the refund lands about a week later.',
		},
		{
			value: 'overseas',
			question: 'Do you ship overseas?',
			answer:
				'Everywhere but Antarctica, which keeps losing our parcels. Duties are shown at checkout, so nothing turns up with a bill attached.',
		},
		{
			value: 'invoice',
			question: 'Can I have a VAT invoice?',
			answer:
				'Every order page has a Download invoice button. Add your company details first and they are printed on it.',
		},
	];

	<section class="faq">
		<h2 class="faq-title">Frequently asked questions</h2>
		<accordion.root class="faq-list" multiple value={['ship']}>
			{/* A repeat cannot open directly inside a component tag, so a host element carries it. */}
			<div class="faq-items" role="presentation">
				@for (const q of questions; key q.value) {
					<accordion.item class="faq-item" value={q.value}>
						<accordion.itemlabel class="faq-heading">
							<accordion.itemtrigger class="faq-trigger">
								{q.question}
								<span class="trigger-icons" aria-hidden="true">
									<lucide.chevrondown class="ico ico-a" />
									<ph.caretdown class="ico ico-b" />
									<tabler.chevrondown class="ico ico-c" />
								</span>
							</accordion.itemtrigger>
						</accordion.itemlabel>
						<accordion.itemcontent class="faq-panel">{q.answer}</accordion.itemcontent>
					</accordion.item>
				}
			</div>
		</accordion.root>
		<p class="faq-foot">Still stuck? Write to the help desk and a person answers.</p>

		<style>
			.faq {
				width: min(34rem, 100%);
			}

			.faq-title {
				margin: 0 0 0.6em;
				font-size: var(--step-0);
				font-weight: 700;
				text-shadow: none;
			}

			.faq-list {
				display: grid;
				gap: 0.5em;
			}

			.faq-items {
				display: contents;
			}

			.faq-item {
				border: var(--card-edge);
				border-radius: 6px;
				background: var(--paper);
				overflow: clip;
			}

			.faq-item[ui-open] {
				box-shadow: var(--card-shadow);
			}

			html[data-theme='dark'] .faq-item {
				background: var(--raised);
			}

			html[data-variant='b'] .faq-item[ui-open] {
				border: var(--state-selected-edge);
				transform: rotate(0.6deg);
			}

			html[data-variant='c'] .faq-item {
				border: 0;
				border-block-end: 1px solid color-mix(in oklch, var(--ink) 30%, transparent);
				border-radius: 0;
				box-shadow: none;
			}

			html[data-variant='c'] .faq-item[ui-open] {
				border-inline-start: 4px solid var(--ink);
			}

			.faq-heading {
				margin: 0;
				font-size: var(--step-0);
			}

			.faq-trigger {
				position: relative;
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				width: 100%;
				padding: 0.7em 0.8em;
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

			.faq-trigger[ui-open] .trigger-icons {
				transform: rotate(180deg);
			}

			.faq-trigger:hover {
				background: var(--state-hover-bg);
				color: var(--state-hover-fg);
			}

			html[data-variant='a'] .faq-item[ui-open] .faq-trigger::before,
			html[data-variant='c'] .faq-item[ui-open] .faq-trigger::before {
				content: '';
				position: absolute;
				inset: 0.55em 2.2em 0.55em 0.65em;
				z-index: -1;
				background: var(--swipe);
				transform: rotate(-1deg);
			}

			html[data-variant='a'] .faq-item[ui-open] .faq-trigger,
			html[data-variant='c'] .faq-item[ui-open] .faq-trigger {
				isolation: isolate;
			}

			html[data-variant='c'] .faq-item[ui-open] .faq-trigger::before {
				inset-block: auto 0.72em;
				height: 0.35em;
				background: var(--yellow);
			}

			/* A closed panel keeps its box for find-in-page, so the padding waits
			   for ui-open or every closed question sits on empty space. */
			.faq-panel {
				font-size: var(--step--1);
				line-height: 155%;
			}

			.faq-panel[ui-open] {
				padding: 0 0.8em 0.9em;
			}

			.faq-panel[hidden] {
				display: none;
			}

			.faq-foot {
				margin: 0.9em 0 0;
				padding-top: 0.8em;
				border-top: 1px solid var(--code-edge);
				font-size: var(--step--2);
				opacity: 0.75;
			}
		</style>
	</section>
}
