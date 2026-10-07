import { tabs } from '@markless/ui';

export default function Account() @{
	<tabs.root class="tabs" value="overview">
		<tabs.list class="list">
			<tabs.trigger class="tab" value="overview">Overview</tabs.trigger>
			<tabs.trigger class="tab" value="billing">Billing</tabs.trigger>
			<tabs.trigger class="tab" value="team" disabled>Team</tabs.trigger>
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

		<style>
			.tabs {
				width: min(24rem, 100%);
			}

			.list {
				display: flex;
				gap: 0.25em;
				border-block-end: 2px solid var(--ink);
			}

			.tab {
				padding: 0.45em 0.9em;
				border: 2px solid transparent;
				border-block-end: 0;
				border-radius: 6px 6px 0 0;
				background: none;
				box-shadow: none;
				color: var(--ink);
				font: inherit;
				cursor: pointer;
			}

			.tab[ui-selected] {
				border-color: var(--ink);
				background: var(--yellow);
				color: var(--on-accent);
				font-weight: 700;
			}

			.tab:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}

			.tab:focus-visible,
			.panel:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.panel {
				padding: 0.9em 0.2em;
			}
		</style>
	</tabs.root>
}
