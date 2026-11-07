// A good figure beside a rejected one: a chess corner whose knight really hops, and the old CI boarding pass whose stamps the reader has to decode.
import { computed, state } from '@markless/core';
import { art } from './compare.art.ts';

const HINTS = {
	none: 'Hover each sketch, then click the knight.',
	board: 'Plays, real object: click the knight and it hops. Nothing to translate.',
	pass: 'A metaphor to decode: a stamp means a check passed, but only once you have worked that out.',
};

export default function CompareFigure() @{
	let hopped = state(false);
	let over = state('none');
	let said = state('');
	const dials = computed(() => '--hop:' + (hopped ? 1 : 0));
	const hint = computed(() => HINTS[over as keyof typeof HINTS]);
	const hop = () => {
		hopped = !hopped;
		said = hopped ? 'The knight hopped.' : 'The knight hopped back.';
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="Two sketches: a chess corner whose knight you can move, and a boarding pass with stamps. Enter or the arrow keys hop the knight; Escape puts it back."
		onKeyDown={(event) => {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
				event.preventDefault();
				hop();
			} else if (event.key === 'Escape') {
				hopped = false;
				said = 'The knight is back on its square.';
			}
		}}
	>
		<svg
			class="scene"
			style={dials}
			viewBox={art.view}
			aria-hidden="true"
			onPointerMove={(event) => {
				const side = (event.target as Element).closest('[data-side]')?.getAttribute('data-side');
				over = side ?? 'none';
			}}
			onPointerLeave={() => {
				over = 'none';
			}}
			onClick={(event) => {
				if ((event.target as Element).closest('[data-side="board"]')) hop();
			}}
		>
			<g>
				@for (const item of art.base.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
			</g>
			<g>
				@for (const text of art.base.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g class="target">
				@for (const item of art.target.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
			</g>
			<g>
				@for (const item of art.pawns.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
			</g>
			<g class="k-from">
				@for (const item of art.knightFrom.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
			</g>
			<g class="k-to">
				@for (const item of art.knightTo.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
			</g>
			<rect class="hit board" data-side="board" x={art.hits.board.x} y={art.hits.board.y} width={art.hits.board.w} height={art.hits.board.h} />
			<rect class="hit pass" data-side="pass" x={art.hits.pass.x} y={art.hits.pass.y} width={art.hits.pass.w} height={art.hits.pass.h} />
		</svg>
		<div class="labels" aria-hidden="true">
			<span class="good">plays, real object</span>
			<span class="bad">a metaphor to decode</span>
		</div>
		<p class="hint" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			Two pen-and-ink sketches. On the left, a corner of a chess board with two pawns and a knight; clicking the knight makes it hop. It is labelled plays, real object. On the right, the boarding pass once drawn for CI, with PASSED stamps that stand for checks. It is labelled a metaphor to decode.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				border-radius: 12px;

				@media (max-width: 600px) {
					margin-inline: calc(50% - 50vw + 0.4rem);
				}
			}

			.toy:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink,
			.barcode {
				fill: var(--sheet-ink);
			}

			.stamp-ink {
				fill: var(--sheet-ink);
				opacity: 0.8;
			}

			.light {
				opacity: 0.55;
			}

			.hatch,
			.sheet-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.sheet-hatch {
				stroke: var(--sheet-ink);
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.perforation {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.9;
				stroke-linecap: round;
				opacity: 0.6;
			}

			text {
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.stamp-word {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 8px;
				letter-spacing: 0.12em;
				opacity: 0.85;
			}

			.target {
				opacity: calc(1 - var(--hop));
				animation: nudge 1600ms ease-in-out infinite;
			}

			@keyframes nudge {
				50% {
					opacity: 0.25;
				}
			}

			.k-from,
			.k-to {
				transition: opacity 260ms ease;
			}

			.k-from {
				opacity: calc(1 - var(--hop));
			}

			.k-to {
				opacity: var(--hop);
			}

			.hit {
				fill: transparent;
			}

			.board {
				cursor: pointer;
			}

			.labels {
				display: grid;
				grid-template-columns: 42% 58%;
				font: 400 1rem/1.3 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.05em;
				text-align: center;
			}

			.bad {
				color: color-mix(in oklch, var(--ink) 60%, transparent);
				text-decoration: line-through;
				text-decoration-color: var(--pink);
			}

			.hint {
				margin: 0.3rem 0 0;
				min-height: 1.5em;
				font-size: 0.92rem;
				color: color-mix(in oklch, var(--ink) 72%, transparent);
				text-align: center;
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
		</style>
	</figure>
}
