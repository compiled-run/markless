// A browser loading a recipe, its network panel and the database: reload, and only Reviews waits, inside the one request.
import { state } from '@markless/core';
import { angleOf, ARRIVED, clamp01, describeReload, describeSpeed, flip, PATH, REVIEWS, SAME, START_SPEED, TITLE, waitOf } from './model.ts';
import { art } from './stream.art.ts';

export default function StreamAnatomy() @{
	let phase = state('done');
	let beat = state('rest');
	let poke = state('rest');
	let speed = state(START_SPEED);
	let wait = state(waitOf(START_SPEED));
	let timer = state(0);
	let said = state('');
	let touched = state(false);
	const reload = () => {
		window.clearTimeout(timer);
		wait = waitOf(speed);
		phase = 'loading';
		beat = flip(beat);
		said = describeReload(wait);
		timer = window.setTimeout(() => {
			phase = 'done';
			said = ARRIVED;
		}, wait);
	};
	const turn = (next: number) => {
		speed = clamp01(next);
		said = describeSpeed(speed);
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
			const tour = setInterval(() => {
				if (!seen || touched) return;
				reload();
			}, 6500);
			return () => {
				clearInterval(tour);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				window.clearTimeout(timer);
				touched = true;
				phase = 'done';
				beat = 'rest';
				speed = START_SPEED;
				said = 'Back to the start.';
			}
		}}
	>
		<svg class="scene" data-phase={phase} data-beat={beat} data-poke={poke} style={'--wait:' + wait + 'ms;--angle:' + angleOf(speed) + 'deg'} viewBox={'0 0 ' + art.width + ' ' + art.height}>
			<path class="hatch light" d={art.browser.shadow} />
			<path class="paper" d={art.browser.paper} />
			<path class="hatch faint" d={art.browser.barTone} />
			<path class="paper" d={art.browser.pill} />
			<path class="ink" d={art.browser.ink} />
			<text class="url" x={art.browser.url.x} y={art.browser.url.y}>{PATH}</text>

			<g
				class="toy reload"
				tabindex="0"
				role="button"
				aria-label="Reload the recipe page"
				onClick={() => {
					touched = true;
					reload();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						reload();
					}
				}}
			>
				<path class="paper" d={art.browser.reload.paper} />
				<path class="wash pink" d={art.browser.reload.wash} />
				<path class="ink" d={art.browser.reload.ink} />
			</g>

			<g class="instant">
				<text class="title" x={art.page.title.x} y={art.page.title.y}>{TITLE}</text>
				<path class="photo" d={art.page.photo} />
				<path class="hatch faint" d={art.page.photoTone} />
				<path class="cake" d={art.page.cake} />
				<path class="wash cake-wash" d={art.page.cakeWash} />
				<path class="lemon" d={art.page.lemon} />
				<path class="hatch" d={art.page.cakeShade} />
				<path class="ink" d={art.page.cakeInk} />
				<path class="ink" d={art.page.photoInk} />
				<path class="ink" d={art.page.steps} />
			</g>

			<g
				class="toy reviews"
				tabindex="0"
				role="button"
				aria-label="The Reviews section. Press it while it loads."
				onClick={() => {
					touched = true;
					if (phase === 'loading') {
						poke = flip(poke);
						said = SAME;
					} else said = 'The reviews came in the same response as the rest of the page.';
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						if (phase === 'loading') {
							poke = flip(poke);
							said = SAME;
						} else said = 'The reviews came in the same response as the rest of the page.';
					}
				}}
			>
				<path class="hit" d={art.reviews.focus} />
				<text class="heading" x={art.reviews.heading.x} y={art.reviews.heading.y}>{REVIEWS}</text>
				<path class="ink" d={art.reviews.rule} />
				<g class="skeleton">
					<path class="bone" d={art.reviews.skeleton} />
					<path class="pencil-hatch" d={art.reviews.skeletonHatch} />
					<path class="pencil-ink" d={art.reviews.skeletonInk} />
				</g>
				<g class="filled">
					<path class="star-fill" d={art.reviews.starFill} />
					<path class="ink" d={art.reviews.stars} />
					<path class="ink" d={art.reviews.lines} />
				</g>
				<text class="tip pending" x={art.reviews.tip.x} y={art.reviews.tip.y}>@pending: still on its way</text>
				<text class="tip try" x={art.reviews.tip.x} y={art.reviews.tip.y}>@try: arrived</text>
			</g>

			<path class="hatch light" d={art.panel.shadow} />
			<path class="paper" d={art.panel.paper} />
			<path class="hatch faint" d={art.panel.headTone} />
			<path class="row-fill" d={art.panel.row} />
			<path class="wash yellow row-wash" d={art.panel.rowWash} />
			<path class="ink" d={art.panel.ink} />
			<path class="ink" d={art.panel.dots} />
			<path class="pencil-ink" d={art.panel.empty} />
			<text class="panel-title" x={art.panel.title.x} y={art.panel.title.y}>Network</text>
			<text class="row-label" x={art.panel.label.x} y={art.panel.label.y}>lemon</text>
			<g class="bar">
				<path class="bar-fill" d={art.panel.bar} />
				<path class="ink" d={art.panel.barInk} />
			</g>

			<path class="hatch light" d={art.db.shadow} />
			<path class="paper" d={art.db.paper} />
			<path class="lid" d={art.db.lid} />
			<path class="hatch" d={art.db.shade} />
			<path class="ink" d={art.db.ink} />
			<g
				class="toy dial"
				tabindex="0"
				role="slider"
				aria-label="Database speed"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(speed * 100)}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					if (el.hasPointerCapture?.(event.pointerId) === false) {
						try {
							el.setPointerCapture(event.pointerId);
						} catch {}
					}
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
					el.dataset.s = String(speed);
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const moved = event.clientX - Number(el.dataset.x) - (event.clientY - Number(el.dataset.y));
					turn(Number(el.dataset.s) + moved / 140);
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const still = el.dataset.s !== undefined && Number(el.dataset.s) === speed;
					delete el.dataset.x;
					if (still) turn(speed >= 0.99 ? 0 : speed + 0.25);
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
						event.preventDefault();
						touched = true;
						turn(speed + 0.1);
					}
					if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						touched = true;
						turn(speed - 0.1);
					}
				}}
			>
				<path class="face" d={art.db.face} />
				<path class="ink" d={art.db.faceInk} />
				<g class="pointer">
					<path class="ink" d={art.db.pointer} />
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink browser window showing a recipe page for {TITLE} at {PATH}: a title, a photo of the cake, its steps, and a
			{REVIEWS} section. Beside it, a network panel with one request row, and below that a database drum with a speed dial on its front.
			Press the browser's pink reload arrow: the title, photo and steps appear at once, and {REVIEWS} shows a pencil skeleton until the
			slow query ends, while the one request's bar keeps growing and stops only then. Turn the dial towards the snail to make the
			database slower, and reload again: only {REVIEWS} waits longer. Pressing {REVIEWS} while it loads adds no new request.
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
				--sheet-ink: var(--ink);
				--cake: color-mix(in oklch, var(--sheet) 55%, oklch(82% 0.1 85));
				--drum: color-mix(in oklch, var(--paper) 70%, oklch(70% 0.02 250));
				--pencil: color-mix(in srgb, var(--ink) 45%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: oklch(25% 0.01 60);
					--drum: color-mix(in oklch, var(--sheet) 70%, oklch(70% 0.02 250));
					--pencil: color-mix(in srgb, oklch(25% 0.01 60) 45%, transparent);
				}
			}

			.paper,
			.face,
			.row-fill {
				fill: var(--sheet);
			}

			.lid {
				fill: var(--drum);
			}

			.photo {
				fill: color-mix(in oklch, var(--sheet) 85%, oklch(80% 0.04 230));
			}

			.cake {
				fill: var(--cake);
			}

			.lemon {
				fill: color-mix(in oklch, var(--yellow) 80%, var(--sheet));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.scene > .hatch.light {
				stroke: var(--ink);
			}

			.light {
				opacity: 0.45;
			}

			.faint {
				opacity: 0.3;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.pink {
				fill: var(--pink);
				opacity: 0.6;
			}

			.yellow {
				fill: var(--yellow);
				opacity: 0;
			}

			.cake-wash {
				fill: oklch(80% 0.12 85);
				opacity: 0.4;
			}

			.star-fill {
				fill: var(--yellow);
			}

			.bar-fill {
				fill: color-mix(in oklch, var(--pink) 55%, var(--sheet));
			}

			.bone {
				fill: color-mix(in oklch, var(--sheet) 85%, var(--ink));
			}

			.pencil-hatch {
				fill: none;
				stroke: var(--pencil);
				stroke-width: 0.6;
				stroke-linecap: round;
			}

			.pencil-ink {
				fill: var(--pencil);
			}

			.hit {
				fill: transparent;
			}

			.url,
			.title,
			.heading,
			.row-label,
			.panel-title,
			.tip {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.url {
				font-size: 10px;
				opacity: 0.8;
			}

			.title {
				font-size: 22px;
				font-weight: 800;
			}

			.heading {
				font-size: 15px;
				font-weight: 800;
			}

			.row-label {
				font-size: 10px;
				font-weight: 700;
			}

			.panel-title {
				font-size: 10px;
				opacity: 0.75;
			}

			.tip {
				font-size: 13px;
				font-weight: 700;
				opacity: 0;
				transition: opacity 150ms ease;
			}

			.toy {
				cursor: pointer;
				outline: none;
			}

			.dial {
				cursor: grab;
			}

			.reload,
			.dial,
			.reviews {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 160ms ease;
			}

			.reload:hover,
			.reload:focus-visible {
				transform: scale(1.12) rotate(-20deg);
			}

			.dial:hover,
			.dial:focus-visible {
				transform: scale(1.06);
			}

			.reviews:hover,
			.reviews:focus-visible {
				transform: translateY(-2px);
			}

			.toy:focus-visible .hit,
			.toy:focus-visible .face,
			.toy:focus-visible > .paper {
				stroke: var(--ink);
				stroke-width: 1.4;
				stroke-dasharray: 4 4;
			}

			.pointer {
				transform-box: view-box;
				transform-origin: 554px 318px;
				transform: rotate(var(--angle));
				transition: transform 120ms ease;
			}

			.skeleton,
			.filled {
				transition: opacity 260ms ease;
			}

			.skeleton {
				opacity: 0;
			}

			.scene[data-phase='loading'] .skeleton {
				opacity: 1;
				animation: breathe 1.1s ease-in-out infinite alternate;
			}

			.scene[data-phase='loading'] .filled {
				opacity: 0;
			}

			.scene[data-phase='loading'] .reviews:hover .tip.pending,
			.scene[data-phase='loading'] .reviews:focus-visible .tip.pending,
			.scene[data-phase='done'] .reviews:hover .tip.try,
			.scene[data-phase='done'] .reviews:focus-visible .tip.try {
				opacity: 1;
			}

			.bar {
				transform-box: fill-box;
				transform-origin: left center;
			}

			.scene[data-beat='odd'] {
				--grow: grow-a;
				--ink-in: ink-a;
			}

			.scene[data-beat='even'] {
				--grow: grow-b;
				--ink-in: ink-b;
			}

			.scene:not([data-beat='rest']) .bar {
				animation: var(--grow) var(--wait) linear both;
			}

			.scene:not([data-beat='rest']) .instant {
				animation: var(--ink-in) 260ms ease-out;
			}

			.scene:not([data-beat='rest'])[data-phase='done'] .row-wash {
				animation: settle 1.2s ease-out both;
			}

			.scene[data-poke='odd'] .row-wash {
				animation: nudge-a 700ms ease-out;
			}

			.scene[data-poke='even'] .row-wash {
				animation: nudge-b 700ms ease-out;
			}

			@keyframes grow-a {
				from {
					transform: scaleX(0.06);
				}
				to {
					transform: scaleX(1);
				}
			}

			@keyframes grow-b {
				from {
					transform: scaleX(0.06);
				}
				to {
					transform: scaleX(1);
				}
			}

			@keyframes ink-a {
				from {
					opacity: 0.15;
				}
				to {
					opacity: 1;
				}
			}

			@keyframes ink-b {
				from {
					opacity: 0.15;
				}
				to {
					opacity: 1;
				}
			}

			@keyframes breathe {
				from {
					opacity: 0.55;
				}
				to {
					opacity: 1;
				}
			}

			@keyframes settle {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.8;
				}
				100% {
					opacity: 0.25;
				}
			}

			@keyframes nudge-a {
				0%,
				100% {
					opacity: 0;
				}
				30% {
					opacity: 0.85;
				}
			}

			@keyframes nudge-b {
				0%,
				100% {
					opacity: 0;
				}
				30% {
					opacity: 0.85;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .bar {
					animation: none !important;
					transition: none !important;
				}

				.scene[data-phase='loading'] .bar {
					transform: scaleX(0.5);
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
