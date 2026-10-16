import { storage } from '@markless/core';
import { tabs } from '@markless/ui';
import Commands from './commands.tsrx';
import { MANAGERS } from './facts.ts';

/** The create command under a row of package managers marked like the sidebar's current page; the choice is saved as package-manager, which every Commands block on the page follows. */
export default function CreateCommand() @{
	let packageManager = storage('package-manager', 'npm');

	<tabs.root
		class="create-command"
		value={packageManager}
		onChange={(next: string) => {
			packageManager = next;
		}}
	>
		<tabs.list class="managers" aria-label="Package manager">
			@for (const manager of MANAGERS; key manager.id) {
				<tabs.trigger class="manager" value={manager.id}>
					<span class="name">{manager.label}</span>
				</tabs.trigger>
			}
		</tabs.list>
		@for (const manager of MANAGERS; key manager.id) {
			<tabs.content class="panel" value={manager.id} aria-label={manager.label}>
				<Commands kind="create" only={manager.id} />
			</tabs.content>
		}
		<style>
			.create-command {
				display: block;
				margin-block-start: var(--space-s);
			}

			.managers {
				display: flex;
				flex-wrap: wrap;
				gap: 0.15rem 0.6rem;
				margin-block-end: calc(-1 * var(--space-m) + 0.35rem);
			}

			.manager {
				padding: 0.1em 0.15em;
				border: 0;
				background: none;
				color: color-mix(in oklch, var(--ink) 62%, var(--paper));
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
			}

			.manager:hover {
				color: var(--ink);
			}

			.name {
				display: inline-block;
				padding: 0.02em 0.28em;
				border-radius: 3px 5px 3px 6px;
			}

			.manager[ui-selected] {
				color: var(--on-accent);
				font-weight: 700;

				.name {
					background: var(--yellow);
					transform: rotate(-0.8deg);
				}
			}

			.manager:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
				border-radius: 4px;
			}

			.panel[hidden] {
				display: none;
			}
		</style>
	</tabs.root>;
}
