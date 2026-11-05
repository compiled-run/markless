// An address slip and one catalogue card: on the card, the slip pencils hello into the blank; off it, the pencil rubs out.
import { computed, state } from '@markless/core';
import { CARD, CATALOGUE_TOUR, describeCatalogue, onCard, PARAM, SLIP } from './model.ts';
import { art } from './catalogue.art.ts';

export default function CatalogueAnatomy() @{
	let placed = state(true);
	let touched = state(false);
	let spoken = state(false);
	let held = state(false);
	let moved = state(false);
	let dx = state(0);
	let dy = state(0);
	let startX = state(0);
	let startY = state(0);
	const said = computed(() => (spoken ? describeCatalogue(placed) : ''));
	const dragStyle = computed(() => (held ? '--dx:' + dx + 'px;--dy:' + dy + 'px' : ''));
	const settle = (next: boolean) => {
		touched = true;
		spoken = true;
		placed = next;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let step = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = CATALOGUE_TOUR[step % CATALOGUE_TOUR.length];
				step++;
				if (next === 'lift') placed = false;
				if (next === 'drop') placed = true;
			}, 2400);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<svg
			class="scene"
			data-placed={placed ? 'yes' : 'no'}
			data-held={held ? 'yes' : 'no'}
			style={art.slip.from}
			viewBox={'0 0 ' + art.width + ' ' + art.height}
		>
			<path class="pencil" d={art.pencil} />
			<path class="hatch light" d={art.desk} />

			<g
				class="card"
				tabindex="0"
				role="button"
				aria-label={'Card ' + CARD + '. Press to put the address slip on it.'}
				onClick={() => settle(true)}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						settle(true);
					}
					if (event.key === 'Escape') settle(true);
				}}
			>
				<g class="tilt">
					<path class="hatch" d={art.card.shadow} />
					<path class="card-paper" d={art.card.paper} />
					<path class="ink faint" d={art.card.rules} />
					<path class="red-rule" d={art.card.redRule} />
					<path class="ink" d={art.card.blank} />
					<path class="ink" d={art.card.ink} />
					<text class="name" transform={art.card.nameMatrix}>{CARD}</text>
					<g class="spot">
						<path class="wash yellow" d={art.card.spot} />
					</g>
					<text class="pencil-text" transform={art.card.pencilMatrix}>{PARAM}</text>
				</g>
			</g>

			<g
				class="slip"
				style={dragStyle}
				tabindex="0"
				role="button"
				aria-label={'Address slip ' + SLIP + '. Press to lift it off the card or drop it on, or drag it.'}
				onPointerdown={(event) => {
					const target = event.currentTarget as Element;
					target.setPointerCapture(event.pointerId);
					startX = event.clientX;
					startY = event.clientY;
					dx = 0;
					dy = 0;
					moved = false;
					held = true;
				}}
				onPointermove={(event) => {
					if (!held) return;
					const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
					const k = svg ? art.width / svg.getBoundingClientRect().width : 1;
					dx = (event.clientX - startX) * k;
					dy = (event.clientY - startY) * k;
					if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
				}}
				onPointerup={(event) => {
					if (!held) return;
					held = false;
					if (!moved) {
						settle(!placed);
						return;
					}
					const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
					const rect = svg?.getBoundingClientRect();
					const k = rect ? art.width / rect.width : 1;
					const x = rect ? (event.clientX - rect.left) * k : 0;
					const y = rect ? (event.clientY - rect.top) * k : 0;
					settle(onCard(art.card.box, x, y));
				}}
				onPointercancel={() => {
					held = false;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						settle(!placed);
					}
					if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') settle(true);
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight') settle(false);
					if (event.key === 'Escape') settle(true);
				}}
			>
				<g class="lift">
					<path class="shadow-wash" d={art.slip.shadow} />
					<path class="slip-paper" d={art.slip.paper} />
					<path class="wash pink" d={art.slip.wash} />
					<path class="ink" d={art.slip.ink} />
					<text class="slip-text" transform={art.slip.textMatrix}>{SLIP}</text>
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink drawing of a library catalogue card lying on a desk. The card's name is {CARD}, and below it is a blank line. A
			paper slip reading {SLIP} lies on the card's corner, and {PARAM} is pencilled into the blank. Drag the slip, or press it, to lift
			it off or drop it on: off the card, the pencilled word rubs out; back on, it is pencilled in again. The card's name never
			changes.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: none;
				--card: color-mix(in oklch, var(--paper) 55%, oklch(95% 0.03 90));
				--slip: color-mix(in oklch, var(--paper) 50%, white);
				--card-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--move: 520ms;

				html.dark & {
					--card: color-mix(in oklch, var(--ink) 92%, var(--yellow));
					--slip: color-mix(in oklch, var(--ink) 94%, white);
					--card-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
				}
			}

			.card,
			.slip {
				cursor: pointer;
				outline: none;
			}

			.slip {
				cursor: grab;
				--px: 0px;
				--py: 0px;
				transform: translate(calc(var(--px) + var(--dx, 0px)), calc(var(--py) + var(--dy, 0px)));
				transition: transform var(--move) cubic-bezier(0.3, 0.8, 0.4, 1.1);
			}

			.scene[data-placed='no'] .slip {
				--px: var(--from-x);
				--py: var(--from-y);
			}

			.scene[data-held='yes'] .slip {
				cursor: grabbing;
				transition: none;
			}

			.tilt,
			.lift {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 160ms ease-out;
			}

			.card:hover .tilt,
			.card:focus-visible .tilt {
				transform: rotate(-0.8deg);
			}

			.slip:hover .lift,
			.slip:focus-visible .lift,
			.scene[data-held='yes'] .lift {
				transform: translate(-2px, -5px) rotate(-1.5deg);
			}

			.slip:focus-visible .slip-paper,
			.card:focus-visible .card-paper {
				stroke: var(--ink);
				stroke-width: 1.5;
				stroke-dasharray: 4 3;
			}

			.card-paper {
				fill: var(--card);
			}

			.slip-paper {
				fill: var(--slip);
			}

			.ink {
				fill: var(--card-ink);
			}

			.faint {
				opacity: 0.35;
			}

			.red-rule {
				fill: color-mix(in srgb, var(--pink) 60%, #d0403c);
				opacity: 0.7;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.5;
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.45;
			}

			.name,
			.slip-text,
			.pencil-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--card-ink);
			}

			.name {
				font-size: 30px;
				font-weight: 800;
			}

			.slip-text {
				font-size: 16.5px;
				font-weight: 700;
			}

			.pencil-text {
				font-size: 34px;
				font-style: italic;
				fill: color-mix(in srgb, var(--card-ink) 60%, #8a8a8a);
			}

			.pencil-text,
			.spot {
				transition: opacity 360ms ease-out 380ms;
			}

			.scene[data-placed='no'] .pencil-text,
			.scene[data-placed='no'] .spot {
				opacity: 0;
				transition: opacity 220ms ease-in;
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

			@media (prefers-reduced-motion: reduce) {
				.scene,
				.scene * {
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
