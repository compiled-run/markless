// A ticker machine and its tape: press print, and one tape carries the heading and a pencilled Loading…, then the orders when they arrive.
import { computed, state } from '@markless/core';
import { ARRIVED, describeTicker, HEADING, PENDING, SLOW_MS, type Step, TICKER_TOUR } from './model.ts';
import { art } from './ticker.art.ts';

export default function TickerAnatomy() @{
	let step = state<Step>(2);
	let run = state(0);
	let tugged = state(false);
	let touched = state(false);
	let spoken = state(false);
	const said = computed(() => (spoken ? describeTicker(step, tugged) : ''));
	const print = () => {
		const mine = run + 1;
		run = mine;
		tugged = false;
		step = 0;
		setTimeout(() => {
			if (run === mine) step = 1;
		}, 40);
		setTimeout(() => {
			if (run === mine) step = 2;
		}, SLOW_MS);
	};
	const press = () => {
		touched = true;
		spoken = true;
		print();
	};
	const tug = () => {
		touched = true;
		spoken = true;
		tugged = true;
		setTimeout(() => {
			tugged = false;
		}, 380);
	};
	const finish = () => {
		touched = true;
		run = run + 1;
		step = 2;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let turn = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = TICKER_TOUR[turn % TICKER_TOUR.length];
				turn++;
				if (next === 'print') print();
			}, 3400);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<svg
			class="scene"
			data-step={String(step)}
			data-tug={tugged ? 'yes' : 'no'}
			style={art.tape.moves}
			viewBox={'0 0 ' + art.width + ' ' + art.height}
		>
			<path class="pencil" d={art.machine.pencil} />
			<path class="hatch light" d={art.desk} />
			<path class="shadow-wash" d={art.machine.cast.wash} />
			<path class="hatch light" d={art.machine.cast.hatch} />

			<g
				class="machine"
				tabindex="0"
				role="button"
				aria-label="Print: the server answers one request"
				onClick={press}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						press();
					}
					if (event.key === 'Escape') finish();
				}}
			>
				<path class="box-paper" d={art.machine.paper} />
				<path class="hatch" d={art.machine.shade} />
				<path class="ink" d={art.machine.ink} />
				<path class="slot" d={art.machine.slot} />
				<path class="ink" d={art.machine.slotInk} />
				<path class="ink" d={art.machine.button.side} />
				<g class="button" style={art.machine.button.sink}>
					<path class="box-paper" d={art.machine.button.paper} />
					<path class="wash pink" d={art.machine.button.wash} />
					<path class="ink" d={art.machine.button.ink} />
				</g>
			</g>

			<g class="window" style={art.tape.clip}>
				<g
					class="tape"
					tabindex="0"
					role="button"
					aria-label="The tape: one response. Tug it."
					onClick={tug}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
							event.preventDefault();
							tug();
						}
						if (event.key === 'Escape') finish();
					}}
				>
					<g class="lift">
						<path class="hatch" d={art.tape.shadow} />
						<path class="tape-paper" d={art.tape.paper} />
						<path class="hatch faint" d={art.tape.tone} />
						<path class="ink faint" d={art.tape.seam} />
						<path class="ink" d={art.tape.ink} />
						<text class="heading" transform={art.tape.headingMatrix}>{HEADING}</text>
						<text class="pending" transform={art.tape.pendingMatrix}>{PENDING}</text>
						<g class="spot">
							<path class="wash yellow" d={art.tape.spot} />
						</g>
						<text class="arrived" transform={art.tape.arrivedMatrix}>{ARRIVED}</text>
					</g>
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink drawing of a ticker machine on a desk with a pink print button on top, and one paper tape running out of its slot
			toward you. The tape reads {HEADING}, then {PENDING} in pencil, then further along {ARRIVED}. Press the machine, or Enter, to
			print again: the first part of the tape comes out with the heading and the pencilled {PENDING}, and a moment later the same tape
			carries on with {ARRIVED}. Tug the tape and it stretches but never tears. The machine itself never moves.
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
				--box: color-mix(in oklch, var(--paper) 50%, white);
				--tape: color-mix(in oklch, var(--paper) 40%, oklch(97% 0.02 90));
				--box-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);

				html.dark & {
					--box: color-mix(in oklch, var(--ink) 90%, white);
					--tape: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--box-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
				}
			}

			.machine,
			.tape {
				outline: none;
				cursor: pointer;
			}

			.tape {
				cursor: grab;
				--tx: 0px;
				--ty: 0px;
				transform: translate(var(--tx), var(--ty));
				transition: transform 760ms cubic-bezier(0.3, 0.6, 0.3, 1);
			}

			.scene[data-step='0'] .tape {
				--tx: var(--hide-x);
				--ty: var(--hide-y);
				transition: none;
			}

			.scene[data-step='1'] .tape {
				--tx: var(--first-x);
				--ty: var(--first-y);
			}

			.scene[data-tug='yes'] .tape {
				--tx: var(--pull-x);
				--ty: var(--pull-y);
				transition: transform 180ms ease-out;
			}

			.scene[data-step='1'][data-tug='yes'] .tape {
				--tx: calc(var(--first-x) + var(--pull-x));
				--ty: calc(var(--first-y) + var(--pull-y));
			}

			.lift,
			.button {
				transition: transform 160ms ease-out;
			}

			.tape:hover .lift,
			.tape:focus-visible .lift {
				transform: translate(0, -3px);
			}

			.machine:hover .button,
			.machine:focus-visible .button {
				transform: translate(0, -2px);
			}

			.machine:active .button {
				transform: translate(var(--sink-x), var(--sink-y));
			}

			.machine:focus-visible .box-paper,
			.tape:focus-visible .tape-paper {
				stroke: var(--ink);
				stroke-width: 1.4;
				stroke-dasharray: 4 3;
			}

			.box-paper {
				fill: var(--box);
			}

			.tape-paper {
				fill: var(--tape);
			}

			.slot {
				fill: var(--box-ink);
				opacity: 0.85;
			}

			.ink {
				fill: var(--box-ink);
			}

			.faint {
				opacity: 0.35;
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
				opacity: 0.7;
			}

			.heading,
			.pending,
			.arrived {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--box-ink);
			}

			.heading {
				font-size: 13px;
				font-weight: 800;
			}

			.pending {
				font-size: 11.5px;
				font-style: italic;
				fill: color-mix(in srgb, var(--box-ink) 55%, #8a8a8a);
			}

			.arrived {
				font-size: 12.5px;
				font-weight: 700;
			}

			.spot {
				transition: opacity 420ms ease-out 500ms;
			}

			.scene[data-step='0'] .spot,
			.scene[data-step='1'] .spot {
				opacity: 0;
				transition: none;
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
