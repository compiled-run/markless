// A clipboard: swap the sheet under the clip and only the sheet and its address label change; the clip never comes off.
import { state } from '@markless/core';
import { ABOUT, addressOf, clamp, CLIP_PULL, CLIP_SAID, describeSwap, flip, HOME, other, type Place, SWAP_AT } from './model.ts';
import { art } from './clipboard.art.ts';

export default function LinkAnatomy() @{
	let at = state<Place>('home');
	let beat = state('rest');
	let snap = state('rest');
	let dragX = state(0);
	let pull = state(0);
	let said = state('');
	let touched = state(false);
	const swap = () => {
		at = other(at);
		beat = flip(beat);
		dragX = 0;
		said = describeSwap(at, true);
	};
	const snapBack = () => {
		pull = 0;
		snap = flip(snap);
		said = CLIP_SAID;
	};
	const scaleOf = (event: Event) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const width = svg?.getBoundingClientRect().width ?? art.width;
		return art.width / (width || art.width);
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
				swap();
			}, 3400);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<svg class="scene" data-at={at} data-beat={beat} data-snap={snap} viewBox={'0 0 ' + art.width + ' ' + art.height}>
			<path class="hatch light" d={art.board.shadow} />
			<g class="board">
				<path class="board-fill" d={art.board.paper} />
				<path class="hatch faint" d={art.board.grain} />
				<path class="ink" d={art.board.ink} />
			</g>

			<g
				class="sheet-grip"
				tabindex="0"
				role="button"
				aria-label="The sheet under the clip. Press, drag it aside, or use the arrow keys to swap it."
				style={'transform: translateX(' + dragX + 'px)'}
				data-dragging={dragX === 0 ? undefined : ''}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					el.setPointerCapture(event.pointerId);
					el.dataset.x = String(event.clientX);
					el.dataset.moved = '0';
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const dx = (event.clientX - Number(el.dataset.x)) * scaleOf(event);
					if (Math.abs(dx) > 4) el.dataset.moved = '1';
					dragX = clamp(dx, -160, 160);
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const moved = el.dataset.moved === '1';
					delete el.dataset.x;
					if (!moved || Math.abs(dragX) > SWAP_AT) swap();
					else dragX = 0;
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					dragX = 0;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
						event.preventDefault();
						touched = true;
						swap();
					}
					if (event.key === 'Escape') {
						touched = true;
						at = 'home';
						beat = 'rest';
						dragX = 0;
						said = '';
					}
				}}
			>
				<g class="lift">
					<path class="hatch light" d={art.sheet.shade} />
					<g class="sheet home">
						<path class="paper" d={art.sheet.paper} />
						<text class="title" x={art.sheet.title.x} y={art.sheet.title.y}>Shop</text>
						<path class="bean-fill" d={art.bean.fill} />
						<path class="hatch" d={art.bean.shade} />
						<path class="ink" d={art.bean.ink} />
						<path class="ink" d={art.sheet.lines} />
						<path class="ink" d={art.sheet.ink} />
					</g>
					<g class="sheet about">
						<path class="paper" d={art.sheet.paper} />
						<text class="title" x={art.sheet.title.x} y={art.sheet.title.y}>About</text>
						<path class="paper" d={art.cup.fill} />
						<path class="hatch" d={art.cup.shade} />
						<path class="ink" d={art.cup.ink} />
						<path class="ink" d={art.sheet.lines} />
						<path class="ink" d={art.sheet.ink} />
					</g>
				</g>
			</g>

			<g
				class="clip"
				tabindex="0"
				role="button"
				aria-label="The clip. Try to pull it off."
				style={'transform: translateY(' + -pull + 'px)'}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					el.setPointerCapture(event.pointerId);
					el.dataset.y = String(event.clientY);
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.y === undefined) return;
					pull = clamp((Number(el.dataset.y) - event.clientY) * scaleOf(event), 0, CLIP_PULL);
				}}
				onPointerup={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.y;
					snapBack();
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.y;
					snapBack();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowUp') {
						event.preventDefault();
						touched = true;
						snapBack();
					}
				}}
			>
				<g class="clip-body">
					<path class="hatch light" d={art.clip.shadow} />
					<path class="steel" d={art.clip.paper} />
					<path class="hatch faint" d={art.clip.shine} />
					<path class="ink" d={art.clip.ink} />
					<path class="paper" d={art.clip.label} />
					<path class="wash yellow" d={art.clip.labelWash} />
					<path class="ink" d={art.clip.labelInk} />
					<text class="address home" x={art.clip.text.x} y={art.clip.text.y}>{HOME}</text>
					<text class="address about" x={art.clip.text.x} y={art.clip.text.y}>{ABOUT}</text>
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink clipboard. Under its clip is a sheet with a coffee bean on it, and a strip of tape on the clip reads {HOME}. Press the
			sheet, drag it aside, or use the arrow keys, and a new sheet with a cup on it takes its place while the label re-inks to {ABOUT}.
			The board and clip stay. Try to pull the clip off, and it snaps back.
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
				--board: color-mix(in oklch, var(--paper) 62%, oklch(66% 0.07 60));
				--steel: color-mix(in oklch, var(--paper) 70%, oklch(70% 0.01 250));
				--bean: oklch(48% 0.08 50);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--board: color-mix(in oklch, var(--paper) 25%, oklch(48% 0.07 60));
					--steel: color-mix(in oklch, var(--paper) 35%, oklch(55% 0.01 250));
					--bean: oklch(52% 0.08 55);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.board-fill {
				fill: var(--board);
			}

			.steel {
				fill: var(--steel);
			}

			.bean-fill {
				fill: var(--bean);
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
				opacity: 0;
			}

			.title,
			.address {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.title {
				font-size: 22px;
				font-weight: 800;
			}

			.address {
				font-size: 13px;
				font-weight: 700;
				text-anchor: middle;
			}

			.board,
			.lift,
			.clip-body {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 180ms ease;
			}

			.board:hover {
				transform: rotate(-0.6deg);
			}

			.sheet-grip {
				cursor: grab;
				outline: none;
			}

			.sheet-grip:not([data-dragging]) {
				transition: transform 240ms cubic-bezier(0.3, 1.4, 0.5, 1);
			}

			.sheet-grip[data-dragging] {
				cursor: grabbing;
			}

			.sheet-grip:hover .lift,
			.sheet-grip:focus-visible .lift {
				transform: translateY(-4px) rotate(-0.4deg);
			}

			.sheet-grip:focus-visible .sheet .paper:first-child,
			.clip:focus-visible .steel {
				stroke: var(--ink);
				stroke-width: 1.5;
				stroke-dasharray: 4 4;
			}

			.clip {
				cursor: grab;
				outline: none;
				transition: transform 200ms cubic-bezier(0.3, 1.6, 0.5, 1);
			}

			.clip:hover .clip-body {
				transform: translateY(-2px);
			}

			.address,
			.sheet {
				transition: opacity 220ms ease;
			}

			.sheet.about,
			.address.about,
			.scene[data-at='about'] .sheet.home,
			.scene[data-at='about'] .address.home {
				opacity: 0;
			}

			.scene[data-at='about'] .sheet.about,
			.scene[data-at='about'] .address.about {
				opacity: 1;
			}

			.scene:not([data-beat='rest']) .address {
				transition-delay: 260ms;
			}

			.scene[data-beat='odd'] {
				--in: in-a;
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--in: in-b;
				--glow: glow-b;
			}

			.scene[data-at='about'] .sheet.about,
			.scene[data-at='home'] .sheet.home {
				animation: var(--in) 360ms ease-out both;
			}

			.scene[data-beat='rest'] .sheet {
				animation: none;
			}

			.scene:not([data-beat='rest']) .yellow {
				animation: var(--glow) 1400ms 300ms ease-out both;
			}

			.scene[data-snap='odd'] .clip-body {
				animation: wobble-a 520ms ease-out;
			}

			.scene[data-snap='even'] .clip-body {
				animation: wobble-b 520ms ease-out;
			}

			@keyframes in-a {
				from {
					opacity: 0;
					transform: translateY(10px);
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes in-b {
				from {
					opacity: 0;
					transform: translateY(10px);
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes glow-a {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.85;
				}
				100% {
					opacity: 0.35;
				}
			}

			@keyframes glow-b {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.85;
				}
				100% {
					opacity: 0.35;
				}
			}

			@keyframes wobble-a {
				20% {
					transform: rotate(-3deg);
				}
				45% {
					transform: rotate(2deg);
				}
				70% {
					transform: rotate(-1deg);
				}
			}

			@keyframes wobble-b {
				20% {
					transform: rotate(-3deg);
				}
				45% {
					transform: rotate(2deg);
				}
				70% {
					transform: rotate(-1deg);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .sheet-grip,
				.scene .clip {
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
