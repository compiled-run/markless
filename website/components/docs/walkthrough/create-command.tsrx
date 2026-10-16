import { storage } from '@markless/core';
import { tabs } from '@markless/ui';
import Commands from './commands.tsrx';
import { tabsArt } from './tabs-ink.art.ts';

/** The create command under inked package-manager tabs; the choice is saved as pm, which every Commands block on the page follows. */
export default function CreateCommand() @{
	let pm = storage('pm', 'npm');

	<tabs.root
		class="create-command"
		value={pm}
		onChange={(next: string) => {
			pm = next;
		}}
	>
		<tabs.list class="strip" aria-label="Package manager">
			@for (const tab of tabsArt; key tab.id) {
				<tabs.trigger class="tab" value={tab.id}>
					<svg class="tab-art" viewBox="0 0 78 44" aria-hidden="true">
						<path class="tab-back" d={tab.back} />
						<path class="tab-paper" d={tab.paper} />
						<path class="tab-tone" d={tab.tone} />
						<path class="tab-ink" d={tab.ink} />
					</svg>
					<span class="tab-label">{tab.label}</span>
				</tabs.trigger>
			}
		</tabs.list>
		@for (const tab of tabsArt; key tab.id) {
			<tabs.content class="panel" value={tab.id} aria-label={tab.label}>
				<Commands kind="create" only={tab.id} />
			</tabs.content>
		}
		<style>
			.create-command {
				--tab-sheet: color-mix(in oklch, var(--paper) 35%, white);
				--tab-back: color-mix(in oklch, var(--ink) 7%, var(--paper));
				display: block;
				margin-block-start: var(--space-m);

				html.dark & {
					--tab-sheet: color-mix(in oklch, var(--paper) 88%, var(--ink));
					--tab-back: color-mix(in oklch, var(--ink) 10%, var(--paper));
				}
			}

			.strip {
				position: relative;
				z-index: 2;
				display: flex;
				align-items: flex-end;
				padding-inline-start: 0.4rem;
				margin-block-end: calc(-1 * var(--space-m) - 8px);
				rotate: -0.3deg;
			}

			.tab {
				position: relative;
				display: grid;
				place-items: center;
				inline-size: 78px;
				block-size: 36px;
				margin-inline-end: -6px;
				padding: 0;
				border: 0;
				background: none;
				color: color-mix(in oklch, var(--ink) 70%, var(--paper));
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1;
				cursor: pointer;
			}

			.tab-art {
				position: absolute;
				inset: 0 0 -8px;
				inline-size: 78px;
				block-size: 44px;
				overflow: visible;
				pointer-events: none;
			}

			.tab-label {
				position: relative;
				padding-block-start: 4px;
			}

			.tab-back {
				fill: var(--tab-back);
			}

			.tab-paper {
				fill: var(--tab-sheet);
				visibility: hidden;
			}

			.tab-tone {
				fill: var(--ink);
				opacity: 0.45;
			}

			.tab-ink {
				fill: var(--ink);
			}

			.tab[ui-selected] {
				z-index: 1;
				color: var(--ink);
				font-weight: 700;

				.tab-paper {
					visibility: visible;
				}

				.tab-tone {
					visibility: hidden;
				}
			}

			.tab:hover .tab-tone {
				opacity: 0.25;
			}

			.tab:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
				border-radius: 6px;
			}

			.panel[hidden] {
				display: none;
			}
		</style>
	</tabs.root>;
}
