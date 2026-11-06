// A family's keys as ink keycaps with a one-line meaning under each; the page around them drives the demo and lights the row.
import { keyPath } from './keyboard/ink.ts';
import { metaFor } from './ui-meta/index.ts';

/** The `KeyboardEvent.key` each keycap label stands for. */
const KEY_OF: Readonly<Record<string, string>> = {
	'Up arrow': 'ArrowUp',
	'Down arrow': 'ArrowDown',
	'Left arrow': 'ArrowLeft',
	'Right arrow': 'ArrowRight',
	Space: ' ',
	'Page Up': 'PageUp',
	'Page Down': 'PageDown',
};

const keyOf = (label: string) => KEY_OF[label] ?? label;

export default function KeyCaps({ family, lit }: {
	readonly family?: string;
	/** The row to light, as its index. */
	readonly lit?: string;
}) @{
	const rows = metaFor(family ?? '').keyboard.map((row, index) => ({
		id: String(index),
		does: row.does,
		keys: row.caps.map((cap) => keyOf(cap.other.label)).join('|'),
		caps: row.caps.map((cap, at) => {
			const width = Math.max(44, cap.other.symbol.length * 11 + 24);
			return {
				id: String(at),
				text: cap.other.symbol,
				label: cap.other.label,
				key: keyOf(cap.other.label),
				width,
				face: keyPath(`${family}-${index}-${at}`, 2, 2, width - 4, 34),
				side: keyPath(`${family}-${index}-${at}-side`, 2, 8, width - 4, 34),
				or: at === 0 ? '' : row.join === '+' ? '+' : 'or',
			};
		}),
	}));

	<div class="keycaps" data-lit={lit ?? ''}>
		<ul class="caps">
			@for (const row of rows; key row.id) {
				<li class={row.caps.length > 1 ? 'row wide' : 'row'} data-row={row.id} data-keys={row.keys} data-does={row.does}>
					<span class="keys">
						@for (const cap of row.caps; key cap.id) {
							<span class="pair">
								<span class="or">{cap.or}</span>
								<button
									type="button"
									class="cap"
									data-key={cap.key}
									aria-label={cap.label}
									style={'width:' + cap.width + 'px'}
								>
									<svg viewBox={'0 0 ' + cap.width + ' 44'} preserveAspectRatio="none" aria-hidden="true">
										<path class="side" d={cap.side} />
										<path class="face" d={cap.face} />
									</svg>
									<span class="text">{cap.text}</span>
								</button>
							</span>
						}
					</span>
					<span class="does">{row.does}</span>
				</li>
			}
		</ul>
		<style>
			.caps {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(6.4rem, 1fr));
				gap: 1rem 1.2rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.row {
				display: grid;
				gap: 0.25rem;
				align-content: start;
			}

			.wide {
				grid-column: span 2;
			}

			.keys {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;
				align-items: center;
			}

			.pair {
				display: inline-flex;
				gap: 0.4rem;
				align-items: center;
			}

			.or:empty {
				display: none;
			}

			.cap {
				position: relative;
				display: inline-grid;
				place-items: center;
				height: 44px;
				padding: 0 0 8px;
				border: 0;
				background: none;
				color: var(--ink);
				font: 600 var(--step-0) 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.cap svg {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				transition: translate 100ms ease;
			}

			.cap .text {
				position: relative;
				transition: translate 100ms ease;
			}

			.cap:active svg,
			.cap:active .text {
				translate: 0 3px;
			}

			.cap:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.face {
				fill: var(--paper);
				stroke: var(--ink);
				stroke-width: 1.6;
				stroke-linejoin: round;
				transition: fill 160ms ease;
			}

			.side {
				fill: color-mix(in oklch, var(--ink) 25%, var(--paper));
				stroke: var(--ink);
				stroke-width: 1.2;
			}

			.keycaps[data-lit='0'] .row[data-row='0'] .face,
			.keycaps[data-lit='1'] .row[data-row='1'] .face,
			.keycaps[data-lit='2'] .row[data-row='2'] .face,
			.keycaps[data-lit='3'] .row[data-row='3'] .face,
			.keycaps[data-lit='4'] .row[data-row='4'] .face,
			.keycaps[data-lit='5'] .row[data-row='5'] .face,
			.keycaps[data-lit='6'] .row[data-row='6'] .face,
			.keycaps[data-lit='7'] .row[data-row='7'] .face {
				fill: color-mix(in srgb, var(--yellow) 75%, var(--paper));
			}


			@media (prefers-reduced-motion: reduce) {
				.cap svg,
				.cap .text,
				.face {
					transition: none;
				}
			}
		</style>
	</div>
}
