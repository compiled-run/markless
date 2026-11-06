// A sports watch with km, min and pace readouts: turn km or min like a dial and pace re-inks; try to set pace and the watch shakes it off.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { clampTo, describePace, dial, flip, KM, MINUTES, paceOf, REFUSED, START } from './watch-model.ts';
import { art } from './watch.art.ts';

export default function WatchAnatomy() @{
	let km = state<number>(START.km);
	let minutes = state<number>(START.minutes);
	let dragging = state('');
	let fromY = state(0);
	let fromValue = state(0);
	let beat = state('rest');
	let shake = state('rest');
	let said = state('');
	const pace = computed(() => paceOf(minutes, km));

	<figure class="anatomy watch">
		<svg class="scene" data-beat={beat} data-shake={shake} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="a running watch works out pace from km and minutes">
			<g>
				<path class="shadow" d={art.straps[0].shadow} />
				<path class="hatch" d={art.straps[0].shadowHatch} />
				<path class="band" d={art.straps[0].band} />
				<path class="hatch grain" d={art.straps[0].grain} />
				<path class="ink" d={art.straps[0].ink} />
			</g>
			<g>
				<path class="shadow" d={art.straps[1].shadow} />
				<path class="hatch" d={art.straps[1].shadowHatch} />
				<path class="band" d={art.straps[1].band} />
				<path class="hatch grain" d={art.straps[1].grain} />
				<path class="ink" d={art.straps[1].ink} />
			</g>
			<g class="case">
				<path class="shadow" d={art.case.shadow} />
				<path class="hatch" d={art.case.shadowHatch} />
				<path class="body" d={art.case.body} />
				<path class="hatch" d={art.case.shade} />
				<path class="bezel" d={art.case.bezel} />
				<path class="screen" d={art.case.screen} />
				<path class="ink" d={art.case.ink} />
				<path class="ink" d={art.case.rule} />
			</g>
			<g
				class={dragging === 'km' ? 'readout dial held' : 'readout dial'}
				tabindex="0"
				role="slider"
				aria-label="km"
				aria-valuenow={km}
				aria-valuemin={KM.min}
				aria-valuemax={KM.max}
				onPointerDown={(event) => {
					capture(event);
					dragging = 'km';
					fromY = event.clientY;
					fromValue = km;
				}}
				onPointerMove={(event) => {
					if (dragging !== 'km') return;
					const next = dial(KM, fromValue, fromY, event.clientY);
					if (next !== km) {
						km = next;
						beat = flip(beat);
						said = describePace(km, minutes);
					}
				}}
				onPointerUp={() => {
					dragging = '';
				}}
				onTouchMove={(event) => event.preventDefault()}
				onWheel={(event) => {
					event.preventDefault();
					km = clampTo(KM, km + (event.deltaY < 0 ? 1 : -1));
					beat = flip(beat);
					said = describePace(km, minutes);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
						event.preventDefault();
						km = clampTo(KM, km + 1);
					} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						km = clampTo(KM, km - 1);
					} else return;
					beat = flip(beat);
					said = describePace(km, minutes);
				}}
			>
				<rect class="grab" x="214" y={art.rows.km.top} width="252" height="44" rx="10" />
				<text class="name" x={art.labelX} y={art.rows.km.y}>km</text>
				<text class="value" x={art.valueX} y={art.rows.km.y}>{km}</text>
				<path class="nudge" d={'M' + (art.valueX + 14) + ' ' + (art.rows.km.y - 26) + ' l6 -8 l6 8 M' + (art.valueX + 14) + ' ' + (art.rows.km.y + 2) + ' l6 8 l6 -8'} />
			</g>
			<g
				class={dragging === 'minutes' ? 'readout dial held' : 'readout dial'}
				tabindex="0"
				role="slider"
				aria-label="minutes"
				aria-valuenow={minutes}
				aria-valuemin={MINUTES.min}
				aria-valuemax={MINUTES.max}
				onPointerDown={(event) => {
					capture(event);
					dragging = 'minutes';
					fromY = event.clientY;
					fromValue = minutes;
				}}
				onPointerMove={(event) => {
					if (dragging !== 'minutes') return;
					const next = dial(MINUTES, fromValue, fromY, event.clientY);
					if (next !== minutes) {
						minutes = next;
						beat = flip(beat);
						said = describePace(km, minutes);
					}
				}}
				onPointerUp={() => {
					dragging = '';
				}}
				onTouchMove={(event) => event.preventDefault()}
				onWheel={(event) => {
					event.preventDefault();
					minutes = clampTo(MINUTES, minutes + (event.deltaY < 0 ? 1 : -1));
					beat = flip(beat);
					said = describePace(km, minutes);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
						event.preventDefault();
						minutes = clampTo(MINUTES, minutes + 1);
					} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						minutes = clampTo(MINUTES, minutes - 1);
					} else return;
					beat = flip(beat);
					said = describePace(km, minutes);
				}}
			>
				<rect class="grab" x="214" y={art.rows.minutes.top} width="252" height="44" rx="10" />
				<text class="name" x={art.labelX} y={art.rows.minutes.y}>min</text>
				<text class="value" x={art.valueX} y={art.rows.minutes.y}>{minutes}</text>
				<path class="nudge" d={'M' + (art.valueX + 14) + ' ' + (art.rows.minutes.y - 26) + ' l6 -8 l6 8 M' + (art.valueX + 14) + ' ' + (art.rows.minutes.y + 2) + ' l6 8 l6 -8'} />
			</g>
			<g
				class="readout pace"
				tabindex="0"
				role="img"
				aria-label={'pace, ' + pace + ' minutes per km, worked out from minutes and km'}
				onPointerDown={() => {
					shake = flip(shake);
					said = REFUSED;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Tab' || event.key === 'Escape') return;
					if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
					else return;
					shake = flip(shake);
					said = REFUSED;
				}}
			>
				<rect class="grab" x="214" y={art.rows.pace.top} width="252" height="62" rx="12" />
				<text class="name" x={art.labelX} y={art.rows.pace.y}>pace</text>
				<text class="value big" x={art.valueX} y={art.rows.pace.y}>{pace}</text>
			</g>
		</svg>
		<figcaption class="sr">
			An ink drawing of a sports watch lying on the desk. Its screen shows km, min and pace. Drag km or min up or down like a dial,
			scroll on it, or focus it and use the arrow keys: pace re-inks with the new answer. Try to set pace itself and the watch shakes it
			off, because pace is worked out, not set.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.watch {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--strap: color-mix(in oklch, var(--paper) 55%, oklch(62% 0.12 160));
				--metal: color-mix(in oklch, var(--paper) 72%, oklch(70% 0.02 250));
				--lcd: color-mix(in oklch, var(--paper) 80%, oklch(85% 0.06 120));

				html.dark & {
					--strap: color-mix(in oklch, var(--ink) 70%, oklch(45% 0.1 160));
					--metal: color-mix(in oklch, var(--ink) 80%, oklch(55% 0.02 250));
					--lcd: color-mix(in oklch, var(--ink) 88%, oklch(60% 0.06 120));
				}
			}

			.shadow {
				fill: var(--shade);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.grain {
				opacity: 0.25;
			}

			.band {
				fill: var(--strap);
			}

			.body {
				fill: var(--metal);
			}

			.bezel {
				fill: color-mix(in oklch, var(--metal) 80%, var(--ink));
			}

			.screen {
				fill: var(--lcd);
			}

			.ink {
				fill: var(--ink);

				html.dark &:not(.desk) {
					fill: var(--paper);
				}
			}

			.readout {
				outline: none;
				transform-box: fill-box;
				transform-origin: center;
			}

			.dial {
				touch-action: none;
				cursor: ns-resize;
			}

			.pace {
				cursor: not-allowed;
			}

			.grab {
				fill: transparent;
				stroke: none;
			}

			.readout:hover .grab,
			.readout:focus-visible .grab {
				stroke: var(--ink);
				stroke-width: 1.2;
				stroke-dasharray: 5 5;
			}

			.name,
			.value {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.name {
				font-size: 22px;
				font-weight: 600;
			}

			.value {
				font-size: 30px;
				font-weight: 800;
				text-anchor: end;
				font-variant-numeric: tabular-nums;
			}

			.big {
				font-size: 44px;
			}

			.nudge {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.6;
				stroke-linecap: round;
				stroke-linejoin: round;
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.dial:hover .nudge,
			.dial:focus-visible .nudge,
			.held .nudge {
				opacity: 0.7;
			}

			.scene[data-beat='odd'] .big {
				animation: reink-a 520ms ease-out;
			}

			.scene[data-beat='even'] .big {
				animation: reink-b 520ms ease-out;
			}

			.scene[data-shake='odd'] .pace {
				animation: refuse-a 420ms ease-in-out;
			}

			.scene[data-shake='even'] .pace {
				animation: refuse-b 420ms ease-in-out;
			}

			@keyframes reink-a {
				0% {
					opacity: 0.25;
				}
			}

			@keyframes reink-b {
				0% {
					opacity: 0.25;
				}
			}

			@keyframes refuse-a {
				25% {
					transform: translateX(-7px) rotate(-1.5deg);
				}

				55% {
					transform: translateX(6px) rotate(1deg);
				}
			}

			@keyframes refuse-b {
				25% {
					transform: translateX(-7px) rotate(-1.5deg);
				}

				55% {
					transform: translateX(6px) rotate(1deg);
				}
			}

			.name,
			.value {
				html.dark & {
					fill: var(--paper);
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
