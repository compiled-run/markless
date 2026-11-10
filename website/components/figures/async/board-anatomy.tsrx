// A split-flap board: pick a city and the city cell flips at once, while the temperature flaps spin until the answer lands; a later pick keeps the old number until its own answer arrives.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import InkButton from '../ink/ink-button.tsrx';
import { BLANK, CITIES, claim, describeBoard, flip, isNewest, nameOf, SPIN, SPIN_MS, type Stage, WAIT_MS } from './board-model.ts';
import { art } from './board.art.ts';

export default function BoardAnatomy() @{
	let shown = state(-1);
	let picked = state(0);
	let waiting = state(true);
	let spinWord = state(BLANK);
	let spinTimer = state(0);
	let beat = state('rest');
	let said = state('');
	let touched = state(false);
	let caption = state('');
	let flick = state(0);
	let flickFrom = state(0);
	let flicking = state(false);
	const stage = computed((): Stage => (waiting ? (shown < 0 ? 'first' : 'refresh') : 'landed'));
	const city = computed(() => CITIES[picked]!.name);
	const temp = computed(() => (shown < 0 ? spinWord : CITIES[shown]!.temp));
	const flickStyle = computed(() => '--flick: ' + flick + 'deg');
	const stopSpin = () => {
		if (spinTimer !== 0) clearInterval(spinTimer);
		spinTimer = 0;
	};
	const startSpin = () => {
		stopSpin();
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let i = 0;
		spinTimer = setInterval(() => {
			i++;
			spinWord = SPIN[i % SPIN.length]!;
		}, SPIN_MS) as unknown as number;
	};
	const pick = (index: number) => {
		const mine = claim();
		picked = index;
		waiting = true;
		said = describeBoard('asked', CITIES[index]!.name);
		if (shown < 0) startSpin();
		setTimeout(() => {
			if (isNewest(mine)) {
				stopSpin();
				shown = index;
				waiting = false;
				beat = flip(beat);
				said = describeBoard('landed', CITIES[index]!.name);
			} else {
				said = describeBoard('dropped', CITIES[index]!.name);
			}
		}, WAIT_MS);
	};
	const touch = (index: number) => {
		touched = true;
		pick(index);
	};
	const reset = () => {
		touched = true;
		stopSpin();
		shown = -1;
		spinWord = BLANK;
		caption = '';
		pick(0);
	};
	const look = (part: 'city' | 'temp' | 'key', name: string) => {
		caption = nameOf(part, stage, name);
	};

	<figure
		class="anatomy board"
		onVisible={() => {
			if (!touched && shown < 0) pick(0);
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				reset();
				return;
			}
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
			event.preventDefault();
			const next = event.key === 'ArrowRight' ? (picked + 1) % CITIES.length : (picked + CITIES.length - 1) % CITIES.length;
			touch(next);
			(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.controls button')[next]?.focus();
		}}
	>
		<div class="scene" data-stage={stage} data-beat={beat} role="group" aria-label="A split-flap board showing a city and its temperature">
			<svg class="wall" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="shadow" d={art.frame.shadow} />
				<path class="hatch" d={art.frame.shadowHatch} />
				<path class="plate" d={art.frame.plate} />
				<path class="hatch dark" d={art.frame.plateHatch} />
				<path class="well" d={art.frame.wells[0]} />
				<path class="well" d={art.frame.wells[1]} />
				<path class="ink" d={art.frame.ink} />
				<path class="ink" d={art.frame.wellInk[0]} />
				<path class="ink" d={art.frame.wellInk[1]} />
			</svg>
			<div
				class="cell city"
				style={art.cells.city.place}
				tabindex="0"
				role="img"
				aria-label={'city cell, ' + city}
				onPointerEnter={() => look('city', city)}
				onPointerLeave={() => (caption = '')}
				onFocus={() => look('city', city)}
				onBlur={() => (caption = '')}
			>
				<div class="half top">
					<svg viewBox={'0 0 ' + art.cells.city.w + ' ' + art.cells.city.h} preserveAspectRatio="none" aria-hidden="true">
						<path class="flap" d={art.flaps.city.top} />
						<path class="hatch flap-shade" d={art.flaps.city.topShade} />
						<path class="ink" d={art.flaps.city.topInk} />
					</svg>
					<span class="word">{city}</span>
				</div>
				<div class="half bottom">
					<svg viewBox={'0 0 ' + art.cells.city.w + ' ' + art.cells.city.h} preserveAspectRatio="none" aria-hidden="true">
						<path class="flap" d={art.flaps.city.bottom} />
						<path class="hatch flap-shade" d={art.flaps.city.bottomShade} />
						<path class="ink" d={art.flaps.city.bottomInk} />
					</svg>
					<span class="word">{city}</span>
				</div>
			</div>
			<div
				class="cell temp"
				style={art.cells.temp.place + ';' + flickStyle}
				tabindex="0"
				role="img"
				aria-busy={stage === 'refresh' ? 'true' : undefined}
				aria-label={'temperature cell, ' + (stage === 'first' ? 'no answer yet' : temp)}
				data-flicking={flicking ? 'yes' : 'no'}
				onPointerEnter={() => look('temp', city)}
				onPointerLeave={() => (caption = '')}
				onFocus={() => look('temp', city)}
				onBlur={() => (caption = '')}
				onPointerDown={(event) => {
					capture(event);
					touched = true;
					flicking = true;
					flickFrom = event.clientY;
				}}
				onPointerMove={(event) => {
					if (flicking) flick = Math.max(0, Math.min(70, (event.clientY - flickFrom) * 0.9));
				}}
				onPointerUp={() => {
					flicking = false;
					flick = 0;
				}}
				onPointerCancel={() => {
					flicking = false;
					flick = 0;
				}}
			>
				<div class="half top">
					<svg viewBox={'0 0 ' + art.cells.temp.w + ' ' + art.cells.temp.h} preserveAspectRatio="none" aria-hidden="true">
						<path class="flap" d={art.flaps.temp.top} />
						<path class="hatch flap-shade" d={art.flaps.temp.topShade} />
						<path class="ink" d={art.flaps.temp.topInk} />
					</svg>
					<span class="word">{temp}</span>
				</div>
				<div class="half bottom">
					<svg viewBox={'0 0 ' + art.cells.temp.w + ' ' + art.cells.temp.h} preserveAspectRatio="none" aria-hidden="true">
						<path class="flap" d={art.flaps.temp.bottom} />
						<path class="hatch flap-shade" d={art.flaps.temp.bottomShade} />
						<path class="ink" d={art.flaps.temp.bottomInk} />
					</svg>
					<span class="word">{temp}</span>
				</div>
			</div>
		</div>
		<div
			class="controls"
			onPointerOver={(event) => {
				const key = (event.target as Element).closest('button')?.textContent?.trim();
				if (key) look('key', key);
			}}
			onPointerOut={() => (caption = '')}
			onFocusIn={(event) => {
				const key = (event.target as Element).closest('button')?.textContent?.trim();
				if (key) look('key', key);
			}}
			onFocusOut={() => (caption = '')}
		>
			<InkButton pressed={picked === 0} onClick={() => touch(0)}>Austin</InkButton>
			<InkButton pressed={picked === 1} alt={true} onClick={() => touch(1)}>Boston</InkButton>
			<InkButton pressed={picked === 2} onClick={() => touch(2)}>Denver</InkButton>
		</div>
		<p class="caption" aria-hidden="true">{caption === '' ? 'hover or tap a cell or a key' : caption}</p>
		<figcaption class="sr">
			A split-flap board with two cells: the city on the left, its temperature on the right, and three keys under it: Austin, Boston and
			Denver. Press a key: the city cell flips at once, and the temperature flaps spin until the answer lands. Press another key once a
			temperature is up: the old number stays, dimmed, until the new one arrives. Press two keys quickly: only the last one's answer is
			shown. Left and right arrows pick the next city; Escape starts over.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.board {
				margin: var(--space-m) 0;
			}

			.scene {
				position: relative;
				width: 100%;
				aspect-ratio: 680 / 230;
				container-type: inline-size;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--plate: color-mix(in oklch, var(--ink) 88%, var(--paper));
				--well: color-mix(in oklch, var(--ink) 96%, black);
				--flap: color-mix(in oklch, var(--ink) 78%, var(--paper));
				--letter: var(--paper);

				html.dark & {
					--plate: var(--slab);
					--well: oklch(15% 0.012 90);
					--flap: var(--raised);
					--letter: var(--ink);
				}
			}

			.wall {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
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

			.hatch.dark,
			.flap-shade {
				stroke: var(--paper);
				opacity: 0.18;

				html.dark & {
					stroke: var(--ink);
					opacity: 0.12;
				}
			}

			.ink {
				fill: var(--ink);
			}

			.plate {
				fill: var(--plate);
			}

			.well {
				fill: var(--well);
			}

			.cell {
				position: absolute;
				perspective: 420px;
				outline: none;
				cursor: default;
				transition: translate 160ms ease;
			}

			.cell.temp {
				cursor: grab;
				touch-action: pan-y;
			}

			.cell.temp[data-flicking='yes'] {
				cursor: grabbing;
			}

			.cell:hover,
			.cell:focus-visible {
				translate: 0 -2px;
			}

			.cell:focus-visible .half.top .ink {
				fill: var(--yellow);
			}

			.half {
				position: absolute;
				left: 0;
				width: 100%;
				height: 50%;
				overflow: hidden;
			}

			.half svg {
				position: absolute;
				left: 0;
				width: 100%;
				height: 200%;
				overflow: visible;
			}

			.half.top {
				top: 0;
				transform-origin: 50% 100%;
				transform: rotateX(calc(-1 * var(--flick, 0deg)));
				transition: transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
			}

			.cell[data-flicking='yes'] .half.top {
				transition: none;
			}

			.half.top svg {
				top: 0;
			}

			.half.bottom {
				top: 50%;
			}

			.half.bottom svg {
				top: -100%;
			}

			.flap {
				fill: var(--flap);
			}

			.word {
				position: absolute;
				left: 0;
				right: 0;
				height: 200%;
				display: grid;
				place-items: center;
				color: var(--letter);
				font: 800 10cqw/1 'Shantell Sans', system-ui, sans-serif;
				letter-spacing: 0.04em;
				transition: opacity 240ms ease;
			}

			.half.top .word {
				top: 0;
			}

			.half.bottom .word {
				top: -100%;
			}

			.cell[aria-busy='true'] .word {
				opacity: 0.4;
			}

			.scene[data-stage='first'] .temp .half.top {
				animation: flap 110ms linear infinite;
				transition: none;
			}

			.scene[data-stage='first'] .temp .word {
				opacity: 0.8;
			}

			.scene[data-beat='odd'] .temp .half.top {
				animation: land-a 320ms ease-out;
			}

			.scene[data-beat='even'] .temp .half.top {
				animation: land-b 320ms ease-out;
			}

			@keyframes flap {
				from {
					transform: rotateX(0deg);
				}

				to {
					transform: rotateX(-88deg);
				}
			}

			@keyframes land-a {
				from {
					transform: rotateX(-88deg);
				}
			}

			@keyframes land-b {
				from {
					transform: rotateX(-88deg);
				}
			}

			.controls {
				display: flex;
				justify-content: center;
				gap: 0.6rem;
				margin-top: 0.6rem;
			}

			.caption {
				margin: var(--space-2xs) 0 0;
				min-height: 1.5em;
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: 0.95rem;
				text-align: center;
				opacity: 0.8;
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
