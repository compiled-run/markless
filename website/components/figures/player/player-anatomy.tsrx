// Two players reading one shared() track: the MiniPlayer in the header and the NowPlaying card move together; each volume knob is its own widget.
import { computed, state } from '@markless/core';
import { angleOf, BIG, clamp, describePlay, describeScrub, describeVolume, MINI, tick, TRACK, VOLUME, type Who } from './model.ts';
import { art } from './player.art.ts';

export default function PlayerAnatomy() @{
	let playing = state(false);
	let pos = state(0.32);
	let volMini = state<number>(VOLUME.mini);
	let volBig = state<number>(VOLUME.big);
	let said = state('');
	let touched = state(false);
	let hovered = state('');
	const miniTurn = computed(() => 'transform: rotate(' + angleOf(volMini) + 'deg); transform-origin: ' + art.mini.knob.origin);
	const bigTurn = computed(() => 'transform: rotate(' + angleOf(volBig) + 'deg); transform-origin: ' + art.big.knob.origin);
	const miniFill = computed(() => 'transform: scaleX(' + pos + ')');
	const miniHandle = computed(() => 'transform: translateX(' + pos * art.mini.bar.width + 'px)');
	const bigHandle = computed(() => 'transform: translateX(' + pos * art.big.bar.width + 'px)');
	const percent = computed(() => Math.round(pos * 100));
	const miniVol = computed(() => Math.round(volMini * 100));
	const bigVol = computed(() => Math.round(volBig * 100));
	const toggle = (who: Who) => {
		touched = true;
		playing = !playing;
		said = describePlay(who, playing);
	};
	const scrubTo = (who: Who, x: number) => {
		const bar = who === 'mini' ? art.mini.bar : art.big.bar;
		pos = clamp((x - bar.x0) / bar.width);
	};
	const nudge = (who: Who, by: number) => {
		touched = true;
		pos = clamp(pos + by);
		said = describeScrub(who, pos);
	};
	const turn = (who: Who, to: number) => {
		touched = true;
		if (who === 'mini') volMini = clamp(to);
		else volBig = clamp(to);
		said = who === 'mini' ? describeVolume('mini', volMini, volBig) : describeVolume('big', volBig, volMini);
	};
	const xOf = (event: PointerEvent) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const m = svg?.getScreenCTM();
		if (!m) return 0;
		return new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse()).x;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			let seen = true;
			let waited = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen) return;
				waited++;
				if (!still && !touched && !playing && waited === 14) playing = true;
				if (playing) pos = tick(pos);
			}, 100);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				playing = false;
				pos = 0.32;
				volMini = VOLUME.mini;
				volBig = VOLUME.big;
				said = 'Stopped, and both volumes are back where they started.';
			}
		}}
	>
		<svg class="scene" data-playing={playing ? 'yes' : 'no'} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="A page with two music players">
			<path class="hatch light" d={art.page.shadow} />
			<path class="paper" d={art.page.sheet} />
			<path class="header" d={art.page.header} />
			<path class="hatch faint" d={art.page.headerTone} />
			<path class="ink" d={art.page.ink} />
			<path class="ink" d={art.page.mark} />

			<g
				class="player mini"
				onPointerenter={() => (hovered = MINI)}
				onPointerleave={() => (hovered = '')}
				onFocusin={() => (hovered = MINI)}
				onFocusout={() => (hovered = '')}
			>
				<path class="paper" d={art.mini.box} />
				<path class="ink" d={art.mini.boxInk} />
				<path class="cover" d={art.mini.cover.paper} />
				<path class="hatch faint" d={art.mini.cover.sky} />
				<path class="sun" d={art.mini.cover.sun} />
				<path class="ink" d={art.mini.cover.ink} />
				<text class="title small" x={art.mini.title.x} y={art.mini.title.y}>{TRACK}</text>

				<g
					class="toy bar"
					tabindex="0"
					role="slider"
					aria-label={MINI + ' progress'}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={percent}
					onPointerdown={(event) => {
						touched = true;
						const el = event.currentTarget as SVGGElement;
						if (el.hasPointerCapture?.(event.pointerId) === false) {
							try {
								el.setPointerCapture(event.pointerId);
							} catch {}
						}
						el.dataset.on = '1';
						scrubTo('mini', xOf(event));
					}}
					onPointermove={(event) => {
						if ((event.currentTarget as SVGGElement).dataset.on !== '1') return;
						scrubTo('mini', xOf(event));
					}}
					onPointerup={(event) => {
						delete (event.currentTarget as SVGGElement).dataset.on;
						said = describeScrub('mini', pos);
					}}
					onKeyDown={(event) => {
						if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
							event.preventDefault();
							nudge('mini', 0.05);
						}
						if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
							event.preventDefault();
							nudge('mini', -0.05);
						}
					}}
				>
					<path class="hit" d={art.mini.bar.hit} />
					<path class="groove" d={art.mini.bar.groove} />
					<path class="fill" d={art.mini.bar.fill} style={miniFill} />
					<path class="ink" d={art.mini.bar.grooveInk} />
					<g style={miniHandle}>
						<path class="paper" d={art.mini.bar.handle} />
						<path class="ink" d={art.mini.bar.handleInk} />
					</g>
				</g>

				<g
					class="toy play"
					tabindex="0"
					role="button"
					aria-label={'Play or pause on ' + MINI}
					aria-pressed={playing ? 'true' : 'false'}
					onClick={() => toggle('mini')}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							toggle('mini');
						}
					}}
				>
					<path class="ink" d={art.mini.play.side} />
					<g class="press">
						<path class="paper" d={art.mini.play.disc} />
						<path class="wash pink" d={art.mini.play.wash} />
						<path class="ink" d={art.mini.play.ink} />
						<path class="ink when-paused" d={art.mini.play.play} />
						<path class="ink when-playing" d={art.mini.play.pause} />
					</g>
				</g>

				<g
					class="toy knob"
					tabindex="0"
					role="slider"
					aria-label={MINI + ' volume'}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={miniVol}
					onPointerdown={(event) => {
						touched = true;
						const el = event.currentTarget as SVGGElement;
						if (el.hasPointerCapture?.(event.pointerId) === false) {
							try {
								el.setPointerCapture(event.pointerId);
							} catch {}
						}
						el.dataset.y = String(event.clientY);
						el.dataset.v = String(volMini);
					}}
					onPointermove={(event) => {
						const el = event.currentTarget as SVGGElement;
						if (el.dataset.y === undefined) return;
						turn('mini', Number(el.dataset.v) + (Number(el.dataset.y) - event.clientY) / 120);
					}}
					onPointerup={(event) => {
						delete (event.currentTarget as SVGGElement).dataset.y;
					}}
					onKeyDown={(event) => {
						if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
							event.preventDefault();
							turn('mini', volMini + 0.1);
						}
						if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
							event.preventDefault();
							turn('mini', volMini - 0.1);
						}
					}}
				>
					<path class="hatch light" d={art.mini.knob.shadow} />
					<path class="ink" d={art.mini.knob.ticks} />
					<path class="steel" d={art.mini.knob.body} />
					<path class="hatch faint" d={art.mini.knob.shade} />
					<path class="ink" d={art.mini.knob.ink} />
					<g class="pointer" style={miniTurn}>
						<path class="ink" d={art.mini.knob.pointer} />
					</g>
				</g>
			</g>

			<g
				class="player big"
				onPointerenter={() => (hovered = BIG)}
				onPointerleave={() => (hovered = '')}
				onFocusin={() => (hovered = BIG)}
				onFocusout={() => (hovered = '')}
			>
				<path class="hatch light" d={art.big.card.shadow} />
				<path class="paper" d={art.big.card.paper} />
				<path class="ink" d={art.big.card.ink} />
				<path class="cover" d={art.big.cover.paper} />
				<path class="hatch faint" d={art.big.cover.sky} />
				<path class="sun" d={art.big.cover.sun} />
				<path class="ink" d={art.big.cover.ink} />
				<text class="title" x={art.big.title.x} y={art.big.title.y}>{TRACK}</text>

				<g
					class="toy bar"
					tabindex="0"
					role="slider"
					aria-label={BIG + ' progress'}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={percent}
					onPointerdown={(event) => {
						touched = true;
						const el = event.currentTarget as SVGGElement;
						if (el.hasPointerCapture?.(event.pointerId) === false) {
							try {
								el.setPointerCapture(event.pointerId);
							} catch {}
						}
						el.dataset.on = '1';
						scrubTo('big', xOf(event));
					}}
					onPointermove={(event) => {
						if ((event.currentTarget as SVGGElement).dataset.on !== '1') return;
						scrubTo('big', xOf(event));
					}}
					onPointerup={(event) => {
						delete (event.currentTarget as SVGGElement).dataset.on;
						said = describeScrub('big', pos);
					}}
					onKeyDown={(event) => {
						if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
							event.preventDefault();
							nudge('big', 0.05);
						}
						if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
							event.preventDefault();
							nudge('big', -0.05);
						}
					}}
				>
					<path class="hit" d={art.big.bar.hit} />
					<path class="groove" d={art.big.bar.groove} />
					<path class="fill" d={art.big.bar.fill} style={miniFill} />
					<path class="ink" d={art.big.bar.grooveInk} />
					<g style={bigHandle}>
						<path class="paper" d={art.big.bar.handle} />
						<path class="ink" d={art.big.bar.handleInk} />
					</g>
				</g>

				<g
					class="toy play"
					tabindex="0"
					role="button"
					aria-label={'Play or pause on ' + BIG}
					aria-pressed={playing ? 'true' : 'false'}
					onClick={() => toggle('big')}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							toggle('big');
						}
					}}
				>
					<path class="ink" d={art.big.play.side} />
					<g class="press">
						<path class="paper" d={art.big.play.disc} />
						<path class="wash pink" d={art.big.play.wash} />
						<path class="ink" d={art.big.play.ink} />
						<path class="ink when-paused" d={art.big.play.play} />
						<path class="ink when-playing" d={art.big.play.pause} />
					</g>
				</g>

				<g
					class="toy knob"
					tabindex="0"
					role="slider"
					aria-label={BIG + ' volume'}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={bigVol}
					onPointerdown={(event) => {
						touched = true;
						const el = event.currentTarget as SVGGElement;
						if (el.hasPointerCapture?.(event.pointerId) === false) {
							try {
								el.setPointerCapture(event.pointerId);
							} catch {}
						}
						el.dataset.y = String(event.clientY);
						el.dataset.v = String(volBig);
					}}
					onPointermove={(event) => {
						const el = event.currentTarget as SVGGElement;
						if (el.dataset.y === undefined) return;
						turn('big', Number(el.dataset.v) + (Number(el.dataset.y) - event.clientY) / 120);
					}}
					onPointerup={(event) => {
						delete (event.currentTarget as SVGGElement).dataset.y;
					}}
					onKeyDown={(event) => {
						if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
							event.preventDefault();
							turn('big', volBig + 0.1);
						}
						if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
							event.preventDefault();
							turn('big', volBig - 0.1);
						}
					}}
				>
					<path class="hatch light" d={art.big.knob.shadow} />
					<path class="ink" d={art.big.knob.ticks} />
					<path class="steel" d={art.big.knob.body} />
					<path class="hatch faint" d={art.big.knob.shade} />
					<path class="ink" d={art.big.knob.ink} />
					<g class="pointer" style={bigTurn}>
						<path class="ink" d={art.big.knob.pointer} />
					</g>
				</g>
			</g>
		</svg>
		<p class="caption" aria-hidden="true">{hovered}</p>
		<figcaption class="sr">
			A pen-and-ink web page. In its header sits a small {MINI}, and below it a large {BIG} card, both showing the track {TRACK}. Press
			play on either and both progress bars move together; drag either bar and the other jumps to the same spot, because both read one
			shared() track. Each player also has its own volume knob: turn one and the other stays where it is, because volume is scoped to
			each player. Escape stops playback and resets the knobs.
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
				--band: color-mix(in oklch, var(--paper) 82%, oklch(70% 0.04 250));
				--steel: color-mix(in oklch, var(--paper) 70%, oklch(70% 0.01 250));
				--sleeve: color-mix(in oklch, var(--paper) 60%, oklch(72% 0.06 220));
				--sun: color-mix(in oklch, var(--paper) 45%, oklch(74% 0.12 55));
				--sheet-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--band: color-mix(in oklch, var(--ink) 86%, oklch(70% 0.04 250));
					--steel: color-mix(in oklch, var(--ink) 80%, oklch(70% 0.01 250));
					--sleeve: color-mix(in oklch, var(--ink) 75%, oklch(72% 0.06 220));
					--sun: color-mix(in oklch, var(--ink) 55%, oklch(74% 0.12 55));
					--sheet-ink: var(--paper);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.header {
				fill: var(--band);
			}

			.cover {
				fill: var(--sleeve);
			}

			.sun {
				fill: var(--sun);
			}

			.steel {
				fill: var(--steel);
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

			.light {
				opacity: 0.5;
			}

			.faint {
				opacity: 0.32;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.pink {
				fill: var(--pink);
				opacity: 0.6;
			}

			.title {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
				font-size: 24px;
				font-weight: 800;
			}

			.title.small {
				font-size: 12px;
				font-weight: 700;
			}

			.caption {
				min-height: 1.5em;
				margin: 0.3rem 0 0;
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: var(--step--1);
				font-weight: 700;
				text-align: center;
				color: var(--ink);
			}

			.groove {
				fill: color-mix(in oklch, var(--sheet-ink) 12%, var(--sheet));
			}

			.fill {
				fill: var(--yellow);
				transform-box: fill-box;
				transform-origin: left center;
			}

			.hit {
				fill: transparent;
			}

			.toy {
				cursor: pointer;
				outline: none;
			}

			.bar,
			.knob {
				cursor: grab;
			}

			.press,
			.knob {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 150ms ease;
			}

			.play:hover .press,
			.play:focus-visible .press {
				transform: translateY(-2px);
			}

			.play:active .press {
				transform: translateY(1px);
			}

			.knob:hover,
			.knob:focus-visible {
				transform: scale(1.06);
			}

			.toy:focus-visible .hit,
			.toy:focus-visible .steel,
			.play:focus-visible .paper {
				stroke: var(--sheet-ink);
				stroke-width: 1.2;
				stroke-dasharray: 3 3;
			}

			.pointer {
				transform-box: view-box;
			}

			.when-playing,
			.scene[data-playing='yes'] .when-paused {
				opacity: 0;
			}

			.scene[data-playing='yes'] .when-playing {
				opacity: 1;
			}

			@media (prefers-reduced-motion: reduce) {
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
