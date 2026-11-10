// The accordion page's examples: four real pages on inked sheets, each showing a different thing the family does.
import { state } from '@markless/core';
import { accordion, lucide } from '@markless/ui';
import InkScreen from '../ink/ink-screen.tsrx';

const steps = [
	{ value: 'account', title: '1 · Your account', text: 'Name, email address and a password.' },
	{ value: 'plan', title: '2 · Pick a plan', text: 'Free for one notebook, Pro for as many as you like.' },
	{ value: 'invite', title: '3 · Invite your team', text: 'Add people now, or later from Settings.' },
];

const days = [
	{ value: 'lisbon', title: 'Day 1 · Lisbon', text: 'Pastéis in Belém, then one last tram ride as the lights come on.' },
	{ value: 'sintra', title: 'Day 2 · Sintra', text: 'Forest paths, a picnic, and a slow walk back into town.' },
	{ value: 'nazare', title: 'Day 3 · Nazaré', text: 'Big waves from the fort, sardines at the harbour.' },
];

const faq = [
	{ value: 'grind', title: 'Can you grind the beans?', text: 'Yes. Pick espresso, filter or cafetière at checkout.' },
	{ value: 'fresh', title: 'How fresh is the coffee?', text: 'We roast on Mondays and ship within two days.' },
	{ value: 'pause', title: 'Can I pause my subscription?', text: 'Any time, from your account page, for up to three months.' },
	{ value: 'return', title: 'Can I return an opened bag?', text: 'Yes, within thirty days, and we refund the postage.' },
];

const plans = [
	{ value: 'free', title: 'Free', text: 'One notebook and a week of history.', locked: false },
	{ value: 'pro', title: 'Pro · $6 a month', text: 'Unlimited notebooks and a full year of history.', locked: false },
	{ value: 'team', title: 'Team · ask us', text: 'Shared notebooks with roles. Talk to sales to open it.', locked: true },
];

export default function AccordionExamples() @{
	let openDays = state<readonly string[]>(['lisbon']);
	let query = state('');
	let openAnswers = state<readonly string[]>([]);

	<section class="accordion-examples" aria-label="Live accordion examples">
		<div class="example">
			<InkScreen url="notes.app/welcome" label="Live example: a sign-up stepper">
				<div class="page">
					<h3 class="page-title">Welcome to Notes</h3>
					<accordion.root class="stack" value="account" collapsible={false}>
						@for (const entry of steps; key entry.value) {
							<accordion.item class="section" value={entry.value}>
								<accordion.itemlabel class="heading">
									<accordion.itemtrigger class="trigger">
										<lucide.chevronright class="chevron" aria-hidden="true" />
										{entry.title}
									</accordion.itemtrigger>
								</accordion.itemlabel>
								<accordion.itemcontent class="panel">{entry.text}</accordion.itemcontent>
							</accordion.item>
						}
					</accordion.root>
				</div>
			</InkScreen>
			<p class="caption">
				<b>One always open.</b> With <code>{'collapsible={false}'}</code>, pressing the open step does nothing; another step replaces it.
			</p>
		</div>

		<div class="example">
			<InkScreen url="mytrips.app/lisbon-to-porto" label="Live example: a trip itinerary">
				<div class="page">
					<div class="title-row">
						<h3 class="page-title">Lisbon to Porto</h3>
						<span class="tools">
							<button type="button" class="tool" onClick={() => (openDays = days.map((day) => day.value))}>Expand all</button>
							<button type="button" class="tool" onClick={() => (openDays = [])}>Collapse all</button>
						</span>
					</div>
					<accordion.root
						class="stack"
						multiple
						value={openDays}
						onChange={(next) => {
							openDays = typeof next === 'string' ? [next] : next;
						}}
					>
						@for (const entry of days; key entry.value) {
							<accordion.item class="section" value={entry.value}>
								<accordion.itemlabel class="heading">
									<accordion.itemtrigger class="trigger">
										<lucide.chevronright class="chevron" aria-hidden="true" />
										{entry.title}
									</accordion.itemtrigger>
								</accordion.itemlabel>
								<accordion.itemcontent class="panel">{entry.text}</accordion.itemcontent>
							</accordion.item>
						}
					</accordion.root>
				</div>
			</InkScreen>
			<p class="caption">
				<b>Several open at once.</b> With <code>multiple</code>, <code>value</code> is a list, so your own buttons can open or close every day.
			</p>
		</div>

		<div class="example">
			<InkScreen url="beanshop.dev/help" label="Live example: a searchable help page">
				<div class="page">
					<h3 class="page-title">Beanshop help</h3>
					<label class="search">
						Search the answers
						<input
							class="field"
							type="search"
							placeholder="Try refund or Monday"
							value={query}
							onInput={(event) => {
								const text = (event.target as HTMLInputElement).value;
								query = text;
								const wanted = text.trim().toLowerCase();
								openAnswers = wanted === '' ? [] : faq.filter((entry) => (entry.title + ' ' + entry.text).toLowerCase().includes(wanted)).map((entry) => entry.value);
							}}
						/>
					</label>
					<accordion.root
						class={query.trim() === '' ? 'stack' : 'stack searching'}
						multiple
						value={openAnswers}
						onChange={(next) => {
							openAnswers = typeof next === 'string' ? [next] : next;
						}}
					>
						@for (const entry of faq; key entry.value) {
							<accordion.item class="section" value={entry.value}>
								<accordion.itemlabel class="heading">
									<accordion.itemtrigger class="trigger">
										<lucide.chevronright class="chevron" aria-hidden="true" />
										{entry.title}
									</accordion.itemtrigger>
								</accordion.itemlabel>
								<accordion.itemcontent class="panel found">{entry.text}</accordion.itemcontent>
							</accordion.item>
						}
					</accordion.root>
				</div>
			</InkScreen>
			<p class="caption">
				<b>Opened from outside.</b> Typing sets <code>value</code> to the answers that match, and they open marked. Closed answers stay in the page, so the browser's own find-in-page opens them too.
			</p>
		</div>

		<div class="example">
			<InkScreen url="notes.app/pricing" label="Live example: a pricing page with a locked plan">
				<div class="page">
					<h3 class="page-title">Plans</h3>
					<accordion.root class="stack" value="pro">
						@for (const entry of plans; key entry.value) {
							<accordion.item class="section" value={entry.value} disabled={entry.locked}>
								<accordion.itemlabel class="heading">
									<accordion.itemtrigger class="trigger">
										<lucide.chevronright class="chevron" aria-hidden="true" />
										{entry.title}
									</accordion.itemtrigger>
								</accordion.itemlabel>
								<accordion.itemcontent class="panel">{entry.text}</accordion.itemcontent>
							</accordion.item>
						}
					</accordion.root>
				</div>
			</InkScreen>
			<p class="caption">
				<b>A section nobody can open.</b> <code>disabled</code> on one item locks it, and the arrow keys skip it.
			</p>
		</div>

		<style>
			.accordion-examples {
				display: grid;
				gap: var(--space-l);
				margin: var(--space-m) 0 var(--space-l);
			}

			.page {
				--ink: var(--screen-ink);
				--paper: var(--screen-paper);
				padding: 1.1rem 1.6rem 1.5rem;
			}

			.title-row {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem 1rem;
				align-items: center;
				justify-content: space-between;
				margin-block-end: 0.8rem;
			}

			.page-title {
				margin: 0 0 0.8rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				text-shadow: none;
			}

			.title-row .page-title {
				margin: 0;
			}

			.tools {
				display: flex;
				gap: 0.5rem;
			}

			.tool {
				padding: 0.2em 0.8em;
				border: 1.5px solid var(--ink);
				border-radius: 10px 6px 12px 8px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				cursor: pointer;
			}

			.search {
				display: grid;
				gap: 0.3rem;
				margin-block-end: 0.8rem;
			}

			.field {
				padding: 0.4em 0.7em;
				border: 1.5px solid var(--ink);
				border-radius: 10px 6px 12px 8px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
			}

			.stack {
				display: grid;
				gap: 0.6rem;
			}

			.section {
				border: 1.5px solid var(--ink);
				border-radius: 8px;
			}

			.section[ui-disabled] {
				border-style: dashed;
				opacity: 0.6;
			}

			.heading {
				margin: 0;
				font: inherit;
				text-shadow: none;
			}

			.trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				width: 100%;
				padding: 0.7em 0.9em;
				border: 0;
				border-radius: 7px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				text-align: start;
				cursor: pointer;
			}

			.trigger:disabled {
				cursor: not-allowed;
			}

			.trigger[ui-open] {
				border-radius: 7px 7px 0 0;
				background: color-mix(in srgb, var(--yellow) 45%, var(--paper));
			}

			.trigger:focus-visible,
			.tool:focus-visible,
			.field:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.chevron {
				flex: none;
				width: 1em;
				height: 1em;
				transition: rotate 140ms ease;
			}

			.trigger[ui-open] .chevron {
				rotate: 90deg;
			}

			.panel {
				padding: 0.7em 0.9em 0.9em;
				border-block-start: 1.5px solid var(--ink);
			}

			.panel[hidden] {
				display: none;
			}

			.searching .found:not([hidden]) {
				background: color-mix(in srgb, var(--yellow) 40%, var(--paper));
			}

			.caption {
				margin: 0.5rem 0 0 0.4rem;
			}

			html.dark .accordion-examples {
				.trigger[ui-open],
				.searching .found:not([hidden]) {
					color: var(--on-accent);
				}

				.trigger[ui-open] {
					background: color-mix(in srgb, var(--yellow) 45%, color-mix(in oklch, var(--cream) 50%, white));
				}

				.searching .found:not([hidden]) {
					background: color-mix(in srgb, var(--yellow) 40%, color-mix(in oklch, var(--cream) 50%, white));
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.chevron {
					transition: none;
				}
			}
		</style>
	</section>
}
