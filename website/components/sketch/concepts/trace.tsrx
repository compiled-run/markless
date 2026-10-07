// Shared stage parts for the concept previews: the live page box and the ledger of what ran.
import type { Children } from '@markless/core';

/** The box the live component renders into, captioned "your page". */
export function LivePage({ children }: { readonly children?: Children }) @{
	<div class="tr-page">
		<p class="tr-caption" aria-hidden="true">your page</p>
		{children}
		<style>
			.tr-page {
				position: relative;
				display: grid;
				gap: 0.6em;
				align-content: start;
				min-width: 0;
				padding: 0.85em 1em 1.1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				font-size: var(--step-0);
			}

			.tr-caption {
				margin: 0;
				color: var(--muted-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.2;
			}
		</style>
	</div>
}

/** A table of rows; each row names an identifier and says what happened to it. */
export function Ledger({ label, children }: { readonly label: string; readonly children?: Children }) @{
	<div class="tr-ledger" role="list" aria-label={label}>
		{children}
		<style>
			.tr-ledger {
				display: grid;
				grid-template-columns: minmax(0, max-content) minmax(8.5em, 1fr);
				align-content: start;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				overflow: hidden;
			}
		</style>
	</div>
}

/** One ledger row. Wrap the note in an element with `data-hot="true"` to give the row the current-step wash. */
// Props reach a component in another file once, so the changing parts arrive as the caller's own elements.
export function Row({ name, children }: { readonly name: string; readonly children?: Children }) @{
	<div class="tr-row" role="listitem">
		<code class="tr-id">{name}</code>
		<span class="tr-note">{children}</span>
		<style>
			.tr-row {
				display: grid;
				grid-column: 1 / -1;
				grid-template-columns: subgrid;
				gap: 0.2em 0.9em;
				align-items: baseline;
				padding: 0.6em 0.9em;
				background: var(--paper);
				color: var(--ink);
				transition: background 140ms ease;
			}

			.tr-row {
				box-shadow: 0 -1px 0 var(--pg-edge);
			}

			.tr-row:has([data-hot='true']) {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.tr-id {
				padding: 0;
				background: none;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.92em;
				line-height: 1.4;
				overflow-wrap: anywhere;
			}

			.tr-note {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.35;
			}

			@media (prefers-reduced-motion: reduce) {
				.tr-row {
					transition: none;
				}
			}
		</style>
	</div>
}

/** Two columns on the stage, stacked on narrow screens. */
export function Board({ children }: { readonly children?: Children }) @{
	<div class="tr-board">
		{children}
		<style>
			.tr-board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
				gap: 1.5em;
				align-items: start;
				width: min(38rem, 100%);
			}

			@media (max-width: 600px) {
				.tr-board {
					grid-template-columns: minmax(0, 1fr);
					gap: 1.2em;
				}
			}
		</style>
	</div>
}
