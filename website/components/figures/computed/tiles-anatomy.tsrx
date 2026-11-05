// mugs + coasters = total as three paper tiles: tap or drag the first two like dials and total re-inks; total itself won't be set and shakes.
import { computed, state } from '@markless/core';
import { bump, clamp, describeTiles, dial, flip, REFUSED, START } from './tiles-model.ts';
import { art } from './tiles.art.ts';

export default function TilesAnatomy() @{
	let mugs = state<number>(START.mugs);
	let coasters = state<number>(START.coasters);
	let dragging = state('');
	let fromY = state(0);
	let fromValue = state(0);
	let moved = state(false);
	let beat = state('rest');
	let shake = state('rest');
	let said = state('');
	const total = computed(() => mugs + coasters);

	<figure class="anatomy tiles">
		<svg class="scene" data-beat={beat} data-shake={shake} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="mugs plus coasters equals total">
			<path class="sign" d={art.plus} />
			<path class="sign" d={art.equals} />

			<g
				class={dragging === 'mugs' ? 'tile input held' : 'tile input'}
				tabindex="0"
				role="spinbutton"
				aria-label="mugs"
				aria-valuenow={mugs}
				aria-valuemin="0"
				aria-valuemax="9"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					dragging = 'mugs';
					fromY = event.clientY;
					fromValue = mugs;
					moved = false;
				}}
				onPointerMove={(event) => {
					if (dragging !== 'mugs') return;
					const next = dial(fromValue, fromY, event.clientY);
					if (next !== mugs) {
						moved = true;
						mugs = next;
						beat = flip(beat);
						said = describeTiles(next, coasters);
					}
				}}
				onPointerUp={() => {
					if (dragging === 'mugs' && !moved) {
						mugs = bump(mugs);
						beat = flip(beat);
						said = describeTiles(mugs, coasters);
					}
					dragging = '';
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') mugs = clamp(mugs + 1);
					else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') mugs = clamp(mugs - 1);
					else return;
					beat = flip(beat);
					said = describeTiles(mugs, coasters);
				}}
			>
				<path class="tile-shadow" d={art.tiles[0].shadow} />
				<path class="hatch" d={art.tiles[0].shadowHatch} />
				<path class="tile-paper" d={art.tiles[0].paper} />
				<path class="ink" d={art.tiles[0].ink} />
				<text class="name" x={art.tiles[0].cx} y={art.nameY}>mugs</text>
				<text class="number" x={art.tiles[0].cx} y={art.numberY}>{mugs}</text>
			</g>

			<g
				class={dragging === 'coasters' ? 'tile input held' : 'tile input'}
				tabindex="0"
				role="spinbutton"
				aria-label="coasters"
				aria-valuenow={coasters}
				aria-valuemin="0"
				aria-valuemax="9"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					dragging = 'coasters';
					fromY = event.clientY;
					fromValue = coasters;
					moved = false;
				}}
				onPointerMove={(event) => {
					if (dragging !== 'coasters') return;
					const next = dial(fromValue, fromY, event.clientY);
					if (next !== coasters) {
						moved = true;
						coasters = next;
						beat = flip(beat);
						said = describeTiles(mugs, next);
					}
				}}
				onPointerUp={() => {
					if (dragging === 'coasters' && !moved) {
						coasters = bump(coasters);
						beat = flip(beat);
						said = describeTiles(mugs, coasters);
					}
					dragging = '';
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') coasters = clamp(coasters + 1);
					else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') coasters = clamp(coasters - 1);
					else return;
					beat = flip(beat);
					said = describeTiles(mugs, coasters);
				}}
			>
				<path class="tile-shadow" d={art.tiles[1].shadow} />
				<path class="hatch" d={art.tiles[1].shadowHatch} />
				<path class="tile-paper" d={art.tiles[1].paper} />
				<path class="ink" d={art.tiles[1].ink} />
				<text class="name" x={art.tiles[1].cx} y={art.nameY}>coasters</text>
				<text class="number" x={art.tiles[1].cx} y={art.numberY}>{coasters}</text>
			</g>

			<g
				class="tile result"
				tabindex="0"
				role="img"
				aria-label="total, worked out from mugs and coasters"
				onPointerDown={() => {
					shake = flip(shake);
					said = REFUSED;
				}}
				onKeyDown={(event) => {
					if (event.key !== 'Tab') {
						shake = flip(shake);
						said = REFUSED;
					}
				}}
			>
				<path class="tile-shadow" d={art.tiles[2].shadow} />
				<path class="hatch" d={art.tiles[2].shadowHatch} />
				<path class="tile-paper" d={art.tiles[2].paper} />
				<path class="wash" d={art.tiles[2].wash} />
				<path class="ink" d={art.tiles[2].ink} />
				<text class="name" x={art.tiles[2].cx} y={art.nameY}>total</text>
				<text class="number fresh" x={art.tiles[2].cx} y={art.numberY}>{total}</text>
			</g>
		</svg>
		<figcaption class="sr">
			Three paper tiles drawn in ink: mugs, then a plus, coasters, then an equals sign, and total. Tap a mugs or coasters tile, drag its
			number up or down like a dial, or focus it and use the arrow keys, and total re-inks to their sum. Total can't be changed: tap it
			and it shakes.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.tiles {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: none;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--tile: color-mix(in oklch, var(--paper) 55%, white);

				html.dark & {
					--shade: rgb(0 0 0 / 0.5);
					--tile: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.tile {
				transform-box: fill-box;
				transform-origin: 50% 90%;
				transition: transform 180ms cubic-bezier(0.3, 0.7, 0.4, 1);
				outline: none;
			}

			.input {
				cursor: ns-resize;
			}

			.input:hover,
			.input:focus-visible {
				transform: translateY(-5px) rotate(-1.2deg);
			}

			.held {
				transform: translateY(-8px) rotate(-2deg) scale(1.02);
			}

			.result {
				cursor: not-allowed;
			}

			.result:hover,
			.result:focus-visible {
				transform: rotate(0.6deg);
			}

			.tile:focus-visible .tile-paper {
				stroke: var(--ink);
				stroke-width: 1.5;
				stroke-dasharray: 4 4;
			}

			.tile-shadow {
				fill: var(--shade);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.tile-paper {
				fill: var(--tile);
			}

			.wash {
				fill: var(--yellow);
				opacity: 0.75;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.35;
				}
			}

			.ink,
			.sign {
				fill: var(--ink);
			}

			.tile .ink {
				html.dark & {
					fill: var(--paper);
				}
			}

			.name,
			.number {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-anchor: middle;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.name {
				font-size: 20px;
				font-weight: 700;
			}

			.number {
				font-size: 76px;
				font-weight: 800;
			}

			.fresh {
				stroke: currentColor;
				stroke-width: 0;
			}

			.scene[data-beat='odd'] .fresh {
				animation: ink-a 520ms ease-out;
			}

			.scene[data-beat='even'] .fresh {
				animation: ink-b 520ms ease-out;
			}

			.scene[data-shake='odd'] .result {
				animation: refuse-a 420ms ease-in-out;
			}

			.scene[data-shake='even'] .result {
				animation: refuse-b 420ms ease-in-out;
			}

			@keyframes ink-a {
				0% {
					fill-opacity: 0.15;
				}

				100% {
					fill-opacity: 1;
				}
			}

			@keyframes ink-b {
				0% {
					fill-opacity: 0.15;
				}

				100% {
					fill-opacity: 1;
				}
			}

			@keyframes refuse-a {
				20% {
					transform: translateX(-7px) rotate(-2deg);
				}

				45% {
					transform: translateX(6px) rotate(1.5deg);
				}

				70% {
					transform: translateX(-4px);
				}
			}

			@keyframes refuse-b {
				20% {
					transform: translateX(-7px) rotate(-2deg);
				}

				45% {
					transform: translateX(6px) rotate(1.5deg);
				}

				70% {
					transform: translateX(-4px);
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
		</style>
	</figure>
}
