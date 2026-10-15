import { storage } from '@markless/core';
import Commands from './commands.tsrx';
import { MANAGERS } from './facts.ts';

/** The create command under a row of package-manager tabs; the choice lands on <html> as data-pm, so every Commands block on the page follows it. */
export default function CreateCommand() @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let pm = storage('pm', 'npm');

	<div class="create-command">
		<div class="strip" role="group" aria-label="Package manager">
			@for (const manager of MANAGERS; key manager.id) {
				<button
					class="tab"
					type="button"
					data-pm={manager.id}
					onClick={() => {
						pm = manager.id;
					}}
				>
					{manager.label}
					<span class="picked">, selected</span>
				</button>;
			}
		</div>
		<Commands kind="create" />
		<style>
			.create-command {
				--tab-back: color-mix(in oklch, var(--ink) 9%, var(--paper));
				--tab-front: color-mix(in oklch, var(--paper) 35%, white);
				margin-block-start: var(--space-m);

				html.dark & {
					--tab-back: color-mix(in oklch, var(--ink) 12%, var(--paper));
					--tab-front: color-mix(in oklch, var(--paper) 88%, var(--ink));
				}
			}

			.strip {
				position: relative;
				z-index: 2;
				display: flex;
				align-items: flex-end;
				padding-inline-start: 0.6rem;
				margin-block-end: calc(-1 * var(--space-m) - 4px);
			}

			.tab {
				position: relative;
				margin-block-end: -2px;
				padding: 0.25em 1.1em;
				border: 2px solid var(--ink);
				border-block-end: 0;
				border-radius: 22px 24px 5px 4px / 18px 20px 5px 4px;
				background: var(--tab-back);
				color: color-mix(in oklch, var(--ink) 82%, var(--paper));
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.35;
				cursor: pointer;
				transition: color 130ms ease;
			}

			.tab + .tab {
				margin-inline-start: -0.3rem;
			}

			.tab:hover {
				color: var(--ink);
			}

			.tab:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			/* Hidden text still names the button; display: none drops it from the name too. */
			.picked {
				display: none;
				position: absolute;
				inline-size: 1px;
				block-size: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			/* The chosen tab follows <html data-pm>, which the storage seed sets before first paint; the island's own state wakes later. */
			html:not([data-pm]) .tab[data-pm='npm'],
			html[data-pm='npm'] .tab[data-pm='npm'],
			html[data-pm='pnpm'] .tab[data-pm='pnpm'],
			html[data-pm='yarn'] .tab[data-pm='yarn'],
			html[data-pm='bun'] .tab[data-pm='bun'],
			html[data-pm='deno'] .tab[data-pm='deno'] {
				z-index: 1;
				background: var(--tab-front);
				color: var(--ink);
				font-weight: 700;

				.picked {
					display: inline;
				}
			}

			@media (max-width: 30rem) {
				.tab {
					padding-inline: 0.7em;
					font-size: var(--step--1);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.tab {
					transition: none;
				}
			}
		</style>
	</div>;
}
