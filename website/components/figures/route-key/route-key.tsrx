// A door and two keys: the key cut for a route that exists turns and opens it; the typo key stops at the lock and slides back.
import { state } from '@markless/core';
import { describeTry, flip, GOOD, LOCK_NEAR, type Tried, TYPO } from './model.ts';
import { art } from './key.art.ts';

export default function RouteKey() @{
	let tried = state<Tried>('none');
	let beat = state('rest');
	let dragKey = state('');
	let dragX = state(0);
	let dragY = state(0);
	let said = state('');
	let touched = state(false);
	const tryKey = (key: 'good' | 'typo') => {
		touched = true;
		tried = tried === key && key === 'good' ? 'none' : key;
		beat = flip(beat);
		said = describeTry(tried);
	};
	const scaleOf = (event: Event) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const width = svg?.getBoundingClientRect().width ?? art.width;
		return art.width / (width || art.width);
	};
	const start = (event: PointerEvent, key: 'good' | 'typo') => {
		touched = true;
		const el = event.currentTarget as SVGGElement;
		el.setPointerCapture(event.pointerId);
		el.dataset.x = String(event.clientX);
		el.dataset.y = String(event.clientY);
		dragKey = key;
	};
	const move = (event: PointerEvent) => {
		const el = event.currentTarget as SVGGElement;
		if (el.dataset.x === undefined) return;
		const k = scaleOf(event);
		dragX = (event.clientX - Number(el.dataset.x)) * k;
		dragY = (event.clientY - Number(el.dataset.y)) * k;
	};
	const end = (event: PointerEvent, key: 'good' | 'typo', tip: readonly number[]) => {
		const el = event.currentTarget as SVGGElement;
		delete el.dataset.x;
		const moved = Math.hypot(dragX, dragY) > 6;
		const near = Math.hypot(tip[0]! + dragX - art.lock[0], tip[1]! + dragY - art.lock[1]) < LOCK_NEAR;
		dragKey = '';
		dragX = 0;
		dragY = 0;
		if (!moved || near) tryKey(key);
	};

	<figure class="anatomy">
		<svg class="scene" data-tried={tried} data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height}>
			<g class="door">
				<path class="frame-fill" d={art.door.frame} />
				<path class="hatch faint" d={art.door.frameShade} />
				<path class="ink" d={art.door.frameInk} />
				<g class="open">
					<path class="gap" d={art.door.open.gap} />
					<path class="hatch" d={art.door.open.gapHatch} />
					<path class="leaf" d={art.door.open.paper} />
					<path class="ink" d={art.door.open.ink} />
				</g>
				<g class="closed">
					<path class="leaf" d={art.door.closed.paper} />
					<path class="hatch faint" d={art.door.closed.shade} />
					<path class="ink" d={art.door.closed.ink} />
					<path class="brass" d={art.door.closed.plate} />
					<path class="ink" d={art.door.closed.plateInk} />
					<path class="ink" d={art.door.closed.hole} />
				</g>
			</g>

			<g
				class="key good"
				tabindex="0"
				role="button"
				aria-label={'The ' + GOOD + ' key. Press, or drag it to the lock.'}
				data-dragging={dragKey === 'good' ? '' : undefined}
				style={dragKey === 'good' ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : art.good.reach}
				onPointerdown={(event) => start(event, 'good')}
				onPointermove={(event) => move(event)}
				onPointerup={(event) => end(event, 'good', art.good.tip)}
				onPointercancel={(event) => end(event, 'good', [-999, -999])}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowLeft') {
						event.preventDefault();
						tryKey('good');
					}
					if (event.key === 'Escape') {
						tried = 'none';
						beat = 'rest';
						said = '';
					}
				}}
			>
				<g class="lift">
					<path class="hatch light" d={art.good.shadow} />
					<path class="metal" d={art.good.metal} />
					<path class="hatch faint" d={art.good.shine} />
					<path class="paper" d={art.good.eye} />
					<path class="ink" d={art.good.ink} />
					<text class="name" x={art.good.label.x} y={art.good.label.y}>{GOOD}</text>
				</g>
			</g>

			<g
				class="key typo"
				tabindex="0"
				role="button"
				aria-label={'The ' + TYPO + ' key, with a typo. Press, or drag it to the lock.'}
				data-dragging={dragKey === 'typo' ? '' : undefined}
				style={dragKey === 'typo' ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : art.typo.reach}
				onPointerdown={(event) => start(event, 'typo')}
				onPointermove={(event) => move(event)}
				onPointerup={(event) => end(event, 'typo', art.typo.tip)}
				onPointercancel={(event) => end(event, 'typo', [-999, -999])}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowLeft') {
						event.preventDefault();
						tryKey('typo');
					}
					if (event.key === 'Escape') {
						tried = 'none';
						beat = 'rest';
						said = '';
					}
				}}
			>
				<g class="lift">
					<path class="hatch light" d={art.typo.shadow} />
					<path class="metal" d={art.typo.metal} />
					<path class="hatch faint" d={art.typo.shine} />
					<path class="paper" d={art.typo.eye} />
					<path class="ink" d={art.typo.ink} />
					<text class="name" x={art.typo.label.x} y={art.typo.label.y}>{TYPO}</text>
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink door with a lock, and two keys on the desk beside it, named {GOOD} and {TYPO}. Press a key, or drag it to the lock.
			The {GOOD} key goes in, turns, and the door opens. The {TYPO} key stops at the lock and slides back, and the door stays shut.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				-webkit-user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--wood: color-mix(in oklch, var(--paper) 62%, oklch(64% 0.08 55));
				--frame: color-mix(in oklch, var(--paper) 45%, oklch(58% 0.07 55));
				--metal: color-mix(in oklch, var(--paper) 55%, oklch(74% 0.09 85));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--wood: color-mix(in oklch, var(--paper) 22%, oklch(48% 0.08 55));
					--frame: color-mix(in oklch, var(--paper) 18%, oklch(40% 0.07 55));
					--metal: color-mix(in oklch, var(--paper) 30%, oklch(62% 0.09 85));
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.leaf {
				fill: var(--wood);
			}

			.frame-fill {
				fill: var(--frame);
				fill-rule: evenodd;
			}

			.metal,
			.brass {
				fill: var(--metal);
			}

			.gap {
				fill: color-mix(in oklch, var(--yellow) 55%, var(--sheet));
			}

			.open .hatch {
				opacity: 0.25;
			}

			.ink {
				fill: var(--ink);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.5;
			}

			.faint {
				opacity: 0.3;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				opacity: 0.7;
			}

			.name {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 14px;
				font-weight: 700;
				fill: var(--ink);
				opacity: 0.85;
				transition: opacity 160ms ease;
			}

			.key {
				cursor: grab;
				outline: none;
			}

			.key[data-dragging] {
				cursor: grabbing;
			}

			.lift {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 180ms ease;
			}

			.key:hover .lift,
			.key:focus-visible .lift {
				transform: translateY(-4px) rotate(-2deg);
			}

			.key:hover .name,
			.key:focus-visible .name {
				opacity: 1;
			}

			.key:focus-visible .metal {
				stroke: var(--ink);
				stroke-width: 1.2;
				stroke-dasharray: 4 4;
			}

			.door .closed,
			.door .open {
				transition: opacity 260ms ease;
			}

			.open {
				opacity: 0;
			}

			.scene[data-tried='good'] .open {
				opacity: 1;
				transition-delay: 900ms;
			}

			.scene[data-tried='good'] .closed {
				opacity: 0;
				transition-delay: 900ms;
			}

			.scene[data-beat='odd'] {
				--go: go-a;
				--balk: balk-a;
			}

			.scene[data-beat='even'] {
				--go: go-b;
				--balk: balk-b;
			}

			.scene[data-tried='good'] .key.good:not([data-dragging]) {
				animation: var(--go) 1100ms ease-in-out both;
			}

			.scene[data-tried='typo'] .key.typo:not([data-dragging]) {
				animation: var(--balk) 1100ms ease-in-out both;
			}

			@keyframes go-a {
				0% {
					transform: none;
				}
				50% {
					transform: translate(var(--to-x), var(--to-y));
				}
				70% {
					transform: translate(var(--to-x), var(--to-y)) scaleY(0.35);
				}
				100% {
					transform: translate(var(--to-x), var(--to-y)) scaleY(0.35);
					opacity: 0;
				}
			}

			@keyframes go-b {
				0% {
					transform: none;
				}
				50% {
					transform: translate(var(--to-x), var(--to-y));
				}
				70% {
					transform: translate(var(--to-x), var(--to-y)) scaleY(0.35);
				}
				100% {
					transform: translate(var(--to-x), var(--to-y)) scaleY(0.35);
					opacity: 0;
				}
			}

			@keyframes balk-a {
				0%,
				100% {
					transform: none;
				}
				40% {
					transform: translate(calc(var(--to-x) * 0.82), calc(var(--to-y) * 0.82));
				}
				48% {
					transform: translate(calc(var(--to-x) * 0.82 + 6px), calc(var(--to-y) * 0.82));
				}
				56% {
					transform: translate(calc(var(--to-x) * 0.82 - 4px), calc(var(--to-y) * 0.82));
				}
				64% {
					transform: translate(calc(var(--to-x) * 0.82 + 3px), calc(var(--to-y) * 0.82));
				}
			}

			@keyframes balk-b {
				0%,
				100% {
					transform: none;
				}
				40% {
					transform: translate(calc(var(--to-x) * 0.82), calc(var(--to-y) * 0.82));
				}
				48% {
					transform: translate(calc(var(--to-x) * 0.82 + 6px), calc(var(--to-y) * 0.82));
				}
				56% {
					transform: translate(calc(var(--to-x) * 0.82 - 4px), calc(var(--to-y) * 0.82));
				}
				64% {
					transform: translate(calc(var(--to-x) * 0.82 + 3px), calc(var(--to-y) * 0.82));
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}

				.scene[data-tried='good'] .key.good {
					opacity: 0;
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
