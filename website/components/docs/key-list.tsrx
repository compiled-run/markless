// The keys a family answers, from its ui-meta file: one ruled row per key, what it does beside it.
import { metaFor, type KeyCap } from './ui-meta/index.ts';

/** `Ctrl / ⌘` where the two keyboards print different keys, else the one key. */
function capText(cap: KeyCap): string {
	return cap.mac.label === cap.other.label ? cap.other.symbol : `${cap.other.symbol} / ${cap.mac.symbol}`;
}

export default function KeyList({ family }: { readonly family?: string }) @{
	const rows = metaFor(family ?? '').keyboard.map((row, index) => ({
		id: String(index),
		does: row.does,
		caps: row.caps.map((cap, at) => ({
			id: String(at),
			text: capText(cap),
			label: cap.mac.label === cap.other.label ? cap.other.label : `${cap.other.label} or ${cap.mac.label}`,
			join: at === 0 ? '' : row.join === '+' ? '+' : 'or',
		})),
	}));

	<dl class="key-list">
		@for (const row of rows; key row.id) {
			<div class="row">
				<dt>
					@for (const cap of row.caps; key cap.id) {
						<span class="cap">
							<span class="join">{cap.join}</span>
							<kbd aria-label={cap.label}>{cap.text}</kbd>
						</span>
					}
				</dt>
				<dd>{row.does}</dd>
			</div>
		}
		<style>
			.key-list {
				margin: var(--space-s) 0 var(--space-m);
				padding: 0;
			}

			.row {
				display: grid;
				grid-template-columns: minmax(7.5rem, max-content) 1fr;
				gap: 0.3rem 1.2rem;
				align-items: baseline;
				padding: 0.55rem 0.2rem;
				border-block-end: 1.5px dashed color-mix(in oklch, var(--ink) 40%, transparent);
			}

			.row:first-child {
				border-block-start: 2px solid var(--ink);
			}

			.row:last-child {
				border-block-end: 2px solid var(--ink);
			}

			dt {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35rem;
				align-items: baseline;
			}

			dd {
				margin: 0;
			}

			kbd {
				display: inline-block;
				min-width: 1.6em;
				padding: 0 0.45em 0.08em;
				border: 2px solid var(--ink);
				border-radius: 7px 5px 8px 6px;
				box-shadow: 1px 2px 0 var(--ink);
				background: var(--paper);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.85em;
				line-height: 1.5;
				text-align: center;
			}

			.cap {
				display: inline-flex;
				gap: 0.35rem;
				align-items: baseline;
			}

			.join:empty {
				display: none;
			}

			.join {
				font-size: 0.85em;
				opacity: 0.75;
			}

			@media (max-width: 30rem) {
				.row {
					grid-template-columns: 1fr;
				}
			}
		</style>
	</dl>
}
