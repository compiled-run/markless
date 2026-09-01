import { accordion } from '@markless/ui';

export default function Faq() @{
	<section class="faq">
		<h2 class="faq-title">Frequently asked questions</h2>
		<accordion.root class="faq-list" multiple value={['ship']}>
			<accordion.item class="faq-item" value="ship">
				<accordion.itemlabel class="faq-heading">
					<accordion.itemtrigger class="faq-trigger">When does my order ship?</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent class="faq-panel">
					Orders placed before 3pm leave the same working day. You get a tracking link as soon as
					the parcel is scanned.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item class="faq-item" value="returns">
				<accordion.itemlabel class="faq-heading">
					<accordion.itemtrigger class="faq-trigger">How do I return something?</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent class="faq-panel">
					Start a return from your orders page within 30 days. Post it back with the printed label
					and the refund lands about a week later.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item class="faq-item" value="overseas">
				<accordion.itemlabel class="faq-heading">
					<accordion.itemtrigger class="faq-trigger">Do you ship overseas?</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent class="faq-panel">
					Everywhere but Antarctica, which keeps losing our parcels. Duties are shown at checkout,
					so nothing turns up with a bill attached.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item class="faq-item" value="invoice">
				<accordion.itemlabel class="faq-heading">
					<accordion.itemtrigger class="faq-trigger">Can I have a VAT invoice?</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent class="faq-panel">
					Every order page has a Download invoice button. Add your company details first and they
					are printed on it.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
		<p class="faq-foot">Still stuck? Write to the help desk and a person answers.</p>

		<style>
			.faq {
				width: min(34rem, 100%);
				padding: 1.1em 1.2em 0.9em;
				border: 2px solid var(--code-edge);
				border-radius: 10px;
				background: var(--raised);
			}

			.faq-title {
				margin: 0 0 0.6em;
				font-size: var(--step-0);
				font-weight: 700;
				text-shadow: none;
			}

			.faq-list {
				display: grid;
			}

			.faq-item {
				border-top: 1px solid var(--code-edge);
			}

			.faq-heading {
				margin: 0;
				font-size: var(--step--1);
			}

			.faq-trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				width: 100%;
				padding: 0.7em 0;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-weight: 700;
				text-align: left;
				cursor: pointer;
			}

			.faq-trigger::after {
				content: '+';
				font-weight: 400;
				font-size: 1.3em;
				line-height: 1;
			}

			.faq-trigger[ui-open]::after {
				content: '–';
			}

			.faq-trigger:hover {
				color: var(--pink);
			}

			/* A closed panel keeps its box for find-in-page, so the padding waits
			   for ui-open or every closed question sits on empty space. */
			.faq-panel {
				font-size: var(--step--1);
				line-height: 155%;
			}

			.faq-panel[ui-open] {
				padding: 0 0 0.9em;
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
