// A newsagent's round book beside a street of three houses: a new edition reaches only the houses on its round.
import { computed, state } from '@markless/core';
import { describeRound, START_BAGS, totalFor } from './model.ts';
import { art } from './round.art.ts';

export default function RoundAnatomy() @{
	let on = state(false);
	let touched = state(false);
	let bags = state(START_BAGS);
	let was = state(START_BAGS);
	const total = computed(() => totalFor(bags));
	const oldTotal = computed(() => totalFor(was));
	const lit = computed(() => (on ? 'yes' : 'no'));
	const said = computed(() => describeRound(bags, on));
	const press = () => {
		was = bags;
		bags = bags >= 9 ? START_BAGS : bags + 1;
		on = true;
	};
	const reset = () => {
		bags = START_BAGS;
		was = START_BAGS;
		on = false;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				press();
			}, 3200);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Print a new edition"
			onClick={() => {
				touched = true;
				press();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					reset();
				}
			}}
		>
			<svg class="scene" data-on={lit} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<text class="print title" transform={art.pile.edition}>bags = {bags}</text>
				<g class="cue">
					<path class="wash yellow" d={art.houses[0]!.paper.spot.wash} />
					<path class="wash yellow pool" d={art.houses[0]!.paper.spot.pool} />
					<path class="wash yellow" d={art.houses[1]!.paper.spot.wash} />
					<path class="wash yellow pool" d={art.houses[1]!.paper.spot.pool} />
					<path class="paper" d={art.houses[0]!.paper.fill} />
					<path class="ink" d={art.houses[0]!.paper.ink} />
					<path class="paper" d={art.houses[1]!.paper.fill} />
					<path class="ink" d={art.houses[1]!.paper.ink} />
				</g>
				<text class="print sign" transform={art.houses[0]!.label}>In your cart: {bags}</text>
				<text class="print sign" transform={art.houses[1]!.label}>Total: ${total}</text>
				<text class="print sign" transform={art.houses[2]!.label}>House blend</text>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>ONLY THE HOUSES ON ITS ROUND</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. An open round book lies on it: one page lists the round for state:bags, with In your cart and
			computed:total on it, the other lists the round for computed:total, with Total on it, and a pencilled line says House blend is on no
			round. Beside the book stands a bundle of papers lettered with the edition, and behind it a street of three houses whose door
			signs read In your cart, Total and House blend. Press the drawing, or Enter or Space, to print a new edition: papers land on the
			doorsteps of In your cart and Total, both signs change, and the House blend house gets nothing. Escape resets.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.stage {
				display: block;
				width: 100%;
				padding: 0;
				border: 0;
				background: none;
				color: inherit;
				cursor: pointer;
				border-radius: 12px;
			}

			.stage:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade-fill: color-mix(in oklch, var(--ink) 20%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade-fill: rgb(0 0 0 / 0.5);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.kraft-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow {
				fill: var(--shade-fill);
			}

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.4;
			}

			.desk-ink {
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.print,
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 5px;
				font-weight: 600;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 5.6px;
				font-weight: 800;
			}

			.label {
				font-size: 4.4px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 5.4px;
				fill: var(--sheet-ink);
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.cue {
				opacity: 0;
				transition: opacity 450ms ease;
			}

			.scene[data-on='yes'] .cue {
				opacity: 1;
			}

			@container anatomy (max-width: 520px) {
				.note {
					font-size: 21px;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
			.sign {
				font-size: 4.6px;
				font-weight: 800;
			}
		</style>
	</figure>
}
