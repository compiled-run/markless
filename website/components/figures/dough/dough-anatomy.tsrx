// Belief: one build of your app; the preset only picks the tin it bakes in.
// Objects: the dough (your app, it never changes), the tin with its label (node, vercel or cloudflare).
// Action: switch the tin's label. Change: the tin and the loaf in it take that host's shape.
// Prevents: "moving to another host means changing the app".
import { computed, element, state } from '@markless/core';
import { describeDough, DOUGH_TOUR, flip, next, type Preset, previous, TINS } from './model.ts';
import { art } from './dough.art.ts';

export default function DoughAnatomy() @{
	let preset = state<Preset>('node');
	let beat = state('rest');
	let last = state('none');
	let touched = state(false);
	let dx = state(0);
	let dy = state(0);
	let start = state<[number, number] | null>(null);
	const frame = element<HTMLDivElement>();
	const said = computed(() => (last === 'none' ? '' : describeDough(preset, last === 'poke')));
	const drag = computed(() => '--dx:' + dx + 'px;--dy:' + dy + 'px');
	const bake = (to: Preset) => {
		preset = to;
		last = 'switch';
		beat = flip(beat);
	};
	const poke = () => {
		last = 'poke';
		beat = flip(beat);
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
				const nextStep = DOUGH_TOUR[step % DOUGH_TOUR.length];
				step++;
				if (nextStep === 'switch') bake(next(preset));
			}, 2800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				preset = 'node';
				last = 'none';
				beat = 'rest';
			}
		}}
	>
		<div class="frame" el={frame}>
			<svg class="scene" data-preset={preset} data-beat={beat} data-last={last} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="shadow-wash" d={art.ball.cast} />
				<path class="shadow-wash tin-cast node" d={art.tins.node.cast} />
				<path class="shadow-wash tin-cast vercel" d={art.tins.vercel.cast} />
				<path class="shadow-wash tin-cast cloudflare" d={art.tins.cloudflare.cast} />

				<g class="tin node">
					<path class="tin-paper" d={art.tins.node.paper} />
					<path class="hatch" d={art.tins.node.shade} />
					<g class="loaf" style={'transform-origin:' + art.tins.node.origin}>
						<path class="crust" d={art.tins.node.loaf} />
						<path class="wash yellow" d={art.tins.node.loafWash} />
						<path class="hatch light" d={art.tins.node.loafShade} />
						<path class="ink" d={art.tins.node.loafInk} />
					</g>
					<path class="ink" d={art.tins.node.ink} />
					<text class="label" transform={art.tins.node.labelMatrix}>{TINS.node.name}</text>
				</g>
				<g class="tin vercel">
					<path class="tin-paper" d={art.tins.vercel.paper} />
					<path class="hatch" d={art.tins.vercel.shade} />
					<g class="loaf" style={'transform-origin:' + art.tins.vercel.origin}>
						<path class="crust" d={art.tins.vercel.loaf} />
						<path class="wash yellow" d={art.tins.vercel.loafWash} />
						<path class="hatch light" d={art.tins.vercel.loafShade} />
						<path class="ink" d={art.tins.vercel.loafInk} />
					</g>
					<path class="ink" d={art.tins.vercel.ink} />
					<text class="label" transform={art.tins.vercel.labelMatrix}>{TINS.vercel.name}</text>
				</g>
				<g class="tin cloudflare">
					<path class="tin-paper" d={art.tins.cloudflare.paper} />
					<path class="hatch" d={art.tins.cloudflare.shade} />
					<g class="loaf" style={'transform-origin:' + art.tins.cloudflare.origin}>
						<path class="crust" d={art.tins.cloudflare.loaf} />
						<path class="wash yellow" d={art.tins.cloudflare.loafWash} />
						<path class="hatch light" d={art.tins.cloudflare.loafShade} />
						<path class="ink" d={art.tins.cloudflare.loafInk} />
					</g>
					<path class="ink" d={art.tins.cloudflare.ink} />
					<text class="label" transform={art.tins.cloudflare.labelMatrix}>{TINS.cloudflare.name}</text>
				</g>

				<g class="ball" style={drag}>
					<g class="ball-body" style={'transform-origin:' + art.ball.origin}>
						<path class="dough" d={art.ball.paper} />
						<path class="hatch light" d={art.ball.shade} />
						<path class="ink" d={art.ball.ink} />
					</g>
				</g>
				<g class="lump to-node" style={art.tins.node.hop}>
					<path class="dough" d={art.lump.paper} />
					<path class="ink" d={art.lump.ink} />
				</g>
				<g class="lump to-vercel" style={art.tins.vercel.hop}>
					<path class="dough" d={art.lump.paper} />
					<path class="ink" d={art.lump.ink} />
				</g>
				<g class="lump to-cloudflare" style={art.tins.cloudflare.hop}>
					<path class="dough" d={art.lump.paper} />
					<path class="ink" d={art.lump.ink} />
				</g>
			</svg>
			<button
				type="button"
				class="hit dough-hit"
				style={art.ball.place}
				aria-label="Poke the dough, or drag it into the tin"
				onPointerdown={(event) => {
					(event.currentTarget as Element).setPointerCapture(event.pointerId);
					start = [event.clientX, event.clientY];
				}}
				onPointermove={(event) => {
					if (!start) return;
					const scale = art.width / (frame?.clientWidth || art.width);
					dx = Math.round((event.clientX - start[0]) * scale);
					dy = Math.round((event.clientY - start[1]) * scale);
				}}
				onPointerup={() => {
					const moved = Math.hypot(dx, dy) > 30;
					touched = true;
					start = null;
					dx = 0;
					dy = 0;
					if (moved) bake(preset);
					else poke();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						poke();
					}
				}}
			/>
			<button
				type="button"
				class="hit tin-hit"
				style={art.tins.node.place}
				aria-label="Switch the tin's label"
				onClick={() => {
					touched = true;
					bake(next(preset));
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
						event.preventDefault();
						touched = true;
						bake(next(preset));
					} else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
						event.preventDefault();
						touched = true;
						bake(previous(preset));
					}
				}}
			/>
		</div>
		<figcaption class="sr">
			A pen-and-ink drawing of a ball of dough beside one baking tin labelled {TINS.node.name}, with a loaf in it. Press the tin, or
			the arrow keys, to switch its label to {TINS.vercel.name} or {TINS.cloudflare.name}: the tin changes shape and the loaf comes
			out in that shape, from the same dough. Drag the dough into the tin to bake it again, or poke it: it is the same dough every
			time. Escape goes back to {TINS.node.name}.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.frame {
				position: relative;
			}

			.hit {
				position: absolute;
				translate: -50% -50%;
				padding: 0;
				border: 0;
				background: none;
				cursor: pointer;
				touch-action: none;
			}

			.dough-hit {
				width: 17%;
				aspect-ratio: 1.2;
				border-radius: 50%;
				cursor: grab;
			}

			.tin-hit {
				width: 30%;
				aspect-ratio: 2.6;
				border-radius: 8px;
				translate: -50% -70%;
			}

			.hit:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 2px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--dough: oklch(90% 0.04 85);
				--crust: oklch(72% 0.09 65);
				--tin: color-mix(in oklch, var(--paper) 75%, oklch(70% 0.02 250));

				html.dark & {
					--shade: rgb(0 0 0 / 0.55);
					--dough: oklch(80% 0.05 85);
					--crust: oklch(60% 0.09 65);
					--tin: color-mix(in oklch, var(--paper) 80%, oklch(60% 0.02 250));
				}
			}

			.tin-paper {
				fill: var(--tin);
			}

			.dough {
				fill: var(--dough);
			}

			.crust {
				fill: var(--crust);
			}

			.ink {
				fill: var(--ink);
			}

			.light {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.shadow-wash {
				fill: var(--shade);
				opacity: 0.6;
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: screen;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.6;
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 13px;
				font-weight: 800;
				fill: var(--ink);
			}

			.tin,
			.tin-cast,
			.lump {
				opacity: 0;
			}

			.scene[data-preset='node'] .node,
			.scene[data-preset='vercel'] .vercel,
			.scene[data-preset='cloudflare'] .cloudflare {
				opacity: 1;
			}

			.ball {
				transform: translate(var(--dx), var(--dy));
			}

			.ball-body,
			.tin {
				transition: translate 140ms ease, rotate 140ms ease;
			}

			.frame:has(.dough-hit:hover) .ball-body,
			.frame:has(.dough-hit:focus-visible) .ball-body {
				rotate: -4deg;
				translate: 0 -2px;
			}

			.frame:has(.tin-hit:hover) .tin,
			.frame:has(.tin-hit:focus-visible) .tin {
				translate: 0 -3px;
			}

			.scene[data-beat='odd'] {
				--hop: hop-a;
				--rise: rise-a;
				--squish: squish-a;
			}

			.scene[data-beat='even'] {
				--hop: hop-b;
				--rise: rise-b;
				--squish: squish-b;
			}

			.scene[data-last='switch'][data-preset='node']:not([data-beat='rest']) .to-node,
			.scene[data-last='switch'][data-preset='vercel']:not([data-beat='rest']) .to-vercel,
			.scene[data-last='switch'][data-preset='cloudflare']:not([data-beat='rest']) .to-cloudflare {
				animation: var(--hop) 600ms ease-in-out both;
			}

			.scene[data-last='switch']:not([data-beat='rest']) .loaf {
				animation: var(--rise) 700ms 550ms ease-out both;
			}

			.scene[data-last='poke']:not([data-beat='rest']) .ball-body {
				animation: var(--squish) 600ms ease-out;
			}

			@keyframes hop-a {
				0% {
					opacity: 1;
					transform: none;
				}
				50% {
					transform: translate(calc(var(--hop-x) * 0.5), calc(var(--hop-y) * 0.5 - 40px));
				}
				95% {
					opacity: 1;
				}
				100% {
					opacity: 0;
					transform: translate(var(--hop-x), var(--hop-y));
				}
			}

			@keyframes hop-b {
				0% {
					opacity: 1;
					transform: none;
				}
				50% {
					transform: translate(calc(var(--hop-x) * 0.5), calc(var(--hop-y) * 0.5 - 40px));
				}
				95% {
					opacity: 1;
				}
				100% {
					opacity: 0;
					transform: translate(var(--hop-x), var(--hop-y));
				}
			}

			@keyframes rise-a {
				from {
					transform: scaleY(0.3);
				}
				to {
					transform: none;
				}
			}

			@keyframes rise-b {
				from {
					transform: scaleY(0.3);
				}
				to {
					transform: none;
				}
			}

			@keyframes squish-a {
				30% {
					transform: scale(1.12, 0.84);
				}
				60% {
					transform: scale(0.95, 1.06);
				}
			}

			@keyframes squish-b {
				30% {
					transform: scale(1.12, 0.84);
				}
				60% {
					transform: scale(0.95, 1.06);
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
