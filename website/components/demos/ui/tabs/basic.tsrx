import { tabs } from '@markless/ui';

export default function Account() @{
	<tabs.root class="tabs" value="overview">
		<tabs.list class="list" aria-label="Account">
			<tabs.trigger class="tab" value="overview">Overview</tabs.trigger>
			<tabs.trigger class="tab" value="billing">Billing</tabs.trigger>
			<tabs.trigger class="tab" value="team" disabled>Team</tabs.trigger>
			<tabs.trigger class="tab" value="alerts">Alerts</tabs.trigger>
		</tabs.list>
		<tabs.content class="panel" value="overview" aria-label="Overview">
			Three orders this month. One is on its way.
		</tabs.content>
		<tabs.content class="panel" value="billing" aria-label="Billing">
			Your next invoice is due on the 1st.
		</tabs.content>
		<tabs.content class="panel" value="team" aria-label="Team">
			Two people can see this account.
		</tabs.content>
		<tabs.content class="panel" value="alerts" aria-label="Alerts">
			We email you when an order ships.
		</tabs.content>

		<style>
			.tabs {
				display: grid;
				gap: 0.9em;
				width: min(31rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.tabs[ui-vertical] {
				grid-template-columns: auto minmax(0, 1fr);
				align-items: start;
			}

			.list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em;
			}

			.list[ui-vertical] {
				flex-direction: column;
			}

			.tab {
				padding: 0.45em 0.9em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-align: start;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.tab:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.tab[ui-selected] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.tab:disabled {
				opacity: 0.55;
				cursor: not-allowed;
			}

			.tab:disabled:hover {
				background: var(--paper);
			}

			.tab:focus-visible,
			.panel:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			.panel {
				min-height: 4.5em;
				padding: 0.85em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
			}

			.panel[hidden] {
				display: none;
			}

			@media (prefers-reduced-motion: reduce) {
				.tab {
					transition: none;
				}
			}
		</style>
	</tabs.root>;
}
