// The accordion page's examples: three everyday pages drawn on inked sheets, each with its accordion live inside.
import { accordion, lucide } from '@markless/ui';
import InkScreen from '../ink/ink-screen.tsrx';

const pages = [
	{
		id: 'faq',
		url: 'beanshop.dev/help',
		title: 'Beanshop help',
		lead: 'Questions we hear every week.',
		open: 'grind',
		multiple: false,
		sections: [
			{ value: 'grind', title: 'Can you grind the beans for me?', text: 'Yes. Pick espresso, filter or cafetière at checkout.' },
			{ value: 'fresh', title: 'How fresh is the coffee?', text: 'We roast on Mondays and ship within two days.' },
			{ value: 'pause', title: 'Can I pause my subscription?', text: 'Any time, from your account page.' },
		],
	},
	{
		id: 'trip',
		url: 'mytrips.app/lisbon-to-porto',
		title: 'Lisbon to Porto',
		lead: 'Five days along the coast. Keep more than one day open.',
		open: 'lisbon',
		multiple: true,
		sections: [
			{ value: 'lisbon', title: 'Day 1 · Lisbon', text: 'Pastéis in Belém, then one last tram ride as the lights come on.' },
			{ value: 'sintra', title: 'Day 2 · Sintra', text: 'Forest paths, a picnic, and a slow walk back into town.' },
			{ value: 'nazare', title: 'Day 3 · Nazaré', text: 'Big waves from the fort, sardines at the harbour.' },
		],
	},
	{
		id: 'settings',
		url: 'notes.app/settings',
		title: 'Settings',
		lead: 'Everything you can change, in one place.',
		open: 'account',
		multiple: false,
		sections: [
			{ value: 'account', title: 'Account', text: 'Name, email address and password.' },
			{ value: 'notifications', title: 'Notifications', text: 'Email me a summary every Friday.' },
			{ value: 'privacy', title: 'Privacy', text: 'Who can see the notes you share.' },
		],
	},
];

export default function AccordionExamples() @{
	<section class="accordion-examples" aria-label="Live accordion examples">
		@for (const page of pages; key page.id) {
			<InkScreen url={page.url} label={'Live example: ' + page.title}>
				<div class="page">
					<h3 class="page-title">{page.title}</h3>
					<p class="lead">{page.lead}</p>
					<accordion.root class="stack" value={page.multiple ? [page.open] : page.open} multiple={page.multiple}>
						@for (const entry of page.sections; key entry.value) {
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
		}
		<style>
			.accordion-examples {
				display: grid;
				gap: var(--space-m);
				margin: var(--space-m) 0 var(--space-l);
			}

			.page {
				--ink: var(--screen-ink);
				--paper: var(--screen-paper);
				padding: 1.1rem 1.6rem 1.5rem;
			}

			.page-title {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				text-shadow: none;
			}

			.lead {
				margin: 0.2rem 0 0.9rem;
			}

			.stack {
				display: grid;
				gap: 0.6rem;
			}

			.section {
				border: 1.5px solid var(--ink);
				border-radius: 8px;
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

			.trigger[ui-open] {
				border-radius: 7px 7px 0 0;
				background: color-mix(in srgb, var(--yellow) 45%, var(--paper));
			}

			.trigger:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -4px;
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

			@media (prefers-reduced-motion: reduce) {
				.chevron {
					transition: none;
				}
			}
		</style>
	</section>
}
