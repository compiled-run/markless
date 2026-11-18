// Two postcards posted to a corkboard, Boston first and Denver second: whichever lands first, the board ends up with Denver, and the other card is stamped VOID and binned.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import InkButton from '../ink/ink-button.tsrx';
import { type CardId, clampLane, describeCard, describeRace, DROP_MS, lands, sentIndex, type Spot, START, travelMs } from './postcards-model.ts';
import { art } from './postcards.art.ts';

export default function PostcardsAnatomy() @{
	let bostonX = state<number>(START.boston);
	let denverX = state<number>(START.denver);
	let austinSpot = state<Spot>('pinned');
	let bostonSpot = state<Spot>('lane');
	let denverSpot = state<Spot>('lane');
	let newestLanded = state(0);
	let phase = state('ready');
	let dragging = state('');
	let fromX = state(0);
	let grabX = state(0);
	let scale = state(1);
	let caption = state('');
	let said = state('');
	let race = state(0);
	const place = (spot: Spot, x: number) => {
		if (spot === 'pinned') return `left:${art.places.pinned.left};top:${art.places.pinned.top};--ms:${DROP_MS}ms`;
		if (spot === 'void') return `left:${art.places.bin.left};top:${art.places.bin.top};--ms:${DROP_MS}ms`;
		if (spot === 'flying') return `left:${art.places.pinned.left};top:${art.places.laneTop};--ms:${travelMs(x)}ms`;
		return `left:${(x / art.width) * 100}%;top:${art.places.laneTop};--ms:0ms`;
	};
	const austinStyle = computed(() => art.card.size + ';' + place(austinSpot, 0));
	const bostonStyle = computed(() => art.card.size + ';' + place(bostonSpot, bostonX));
	const denverStyle = computed(() => art.card.size + ';' + place(denverSpot, denverX));
	const spotOf = (id: CardId): Spot => (id === 'austin' ? austinSpot : id === 'boston' ? bostonSpot : denverSpot);
	const setSpot = (id: CardId, spot: Spot) => {
		if (id === 'austin') austinSpot = spot;
		else if (id === 'boston') bostonSpot = spot;
		else denverSpot = spot;
	};
	const xOf = (id: CardId) => (id === 'boston' ? bostonX : denverX);
	const setX = (id: CardId, x: number) => {
		if (id === 'boston') bostonX = clampLane(x);
		else denverX = clampLane(x);
	};
	const land = (id: CardId, mine: number) => {
		if (mine !== race) return;
		if (lands(id, newestLanded)) {
			for (const card of ['austin', 'boston', 'denver'] as const) if (spotOf(card) === 'pinned') setSpot(card, 'void');
			setSpot(id, 'pinned');
			newestLanded = sentIndex(id);
		} else setSpot(id, 'void');
		if (bostonSpot !== 'flying' && denverSpot !== 'flying') {
			phase = 'done';
			const pinned = (['austin', 'boston', 'denver'] as const).find((card) => spotOf(card) === 'pinned')!;
			said = describeRace(
				pinned,
				(['austin', 'boston', 'denver'] as const).filter((card) => spotOf(card) === 'void'),
			);
		}
	};
	const post = () => {
		if (phase !== 'ready') return;
		const mine = ++race;
		phase = 'flying';
		said = 'Posted Boston, then Denver.';
		const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		bostonSpot = 'flying';
		denverSpot = 'flying';
		const bostonMs = quick ? 0 : travelMs(bostonX);
		const denverMs = quick ? 1 : travelMs(denverX);
		setTimeout(() => land('boston', mine), bostonMs);
		setTimeout(() => land('denver', mine), denverMs);
	};
	const reset = () => {
		race++;
		phase = 'ready';
		austinSpot = 'pinned';
		bostonSpot = 'lane';
		denverSpot = 'lane';
		newestLanded = 0;
		bostonX = START.boston;
		denverX = START.denver;
		said = 'Back to the start: Austin is on the board, Boston and Denver are on the lane.';
	};
	const look = (id: CardId) => {
		caption = describeCard(id, xOf(id));
	};
	const grab = (event: PointerEvent, id: CardId) => {
		if (phase !== 'ready') return;
		capture(event);
		scale = art.width / (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect().width;
		fromX = event.clientX;
		grabX = xOf(id);
		dragging = id;
	};
	const drag = (event: PointerEvent, id: CardId) => {
		if (dragging !== id) return;
		setX(id, grabX + (event.clientX - fromX) * scale);
		look(id);
	};
	const release = (id: CardId) => {
		if (dragging === id) dragging = '';
	};
	const nudge = (event: KeyboardEvent, id: CardId) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			post();
			return;
		}
		if (phase !== 'ready' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
		event.preventDefault();
		setX(id, xOf(id) + (event.key === 'ArrowRight' ? 30 : -30));
		look(id);
	};

	<figure
		class="anatomy postcards"
		onKeyDown={(event) => {
			if (event.key === 'Escape') reset();
		}}
	>
		<div class="scene" data-phase={phase} data-dragging={dragging === '' ? 'no' : 'yes'} role="group" aria-label="Two postcards on a lane to a corkboard">
			<svg class="desk" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="shadow" d={art.board.shadow} />
				<path class="hatch" d={art.board.shadowHatch} />
				<path class="frame" d={art.board.frame} />
				<path class="hatch" d={art.board.frameHatch} />
				<path class="cork" d={art.board.cork} />
				<path class="cork-wash" d={art.board.corkWash} />
				<path class="hatch grain" d={art.board.grain} />
				<path class="ink" d={art.board.ink} />
				<path class="ink lane" d={art.lane.ink} />
				<path class="paper" d={art.lane.slot.plate} />
				<path class="slit" d={art.lane.slot.slit} />
				<path class="hatch" d={art.lane.slot.slitHatch} />
				<path class="ink" d={art.lane.slot.ink} />
				<text class="slot-label" x={art.lane.slot.labelX} y={art.lane.slot.labelY}>post slot</text>
				<path class="paper" d={art.bin.paper} />
				<path class="hatch" d={art.bin.hatch} />
				<path class="ink" d={art.bin.ink} />
			</svg>
			<div
				class={'card austin ' + austinSpot}
				style={austinStyle}
				tabindex="0"
				role="img"
				aria-label="Austin, 31 degrees, pinned on the board"
				onPointerEnter={() => look('austin')}
				onPointerLeave={() => (caption = '')}
				onFocus={() => look('austin')}
				onBlur={() => (caption = '')}
			>
				<svg viewBox={'0 0 ' + art.card.w + ' ' + art.card.h} aria-hidden="true">
					<path class="shadow" d={art.cards.austin.shadow} />
					<path class="hatch" d={art.cards.austin.shadowHatch} />
					<path class="paper" d={art.cards.austin.paper} />
					<path class="hatch" d={art.cards.austin.stampHatch} />
					<path class="ink" d={art.cards.austin.ink} />
					<text class="name" x="12" y="30">Austin</text>
					<text class="temp" x="12" y="76">31°</text>
					<g class="void-mark">
						<path class="ink void-ink" d={art.cards.austin.voidRing} />
						<text class="void-text" x="75" y="58">VOID</text>
					</g>
				</svg>
			</div>
			<div
				class={'card boston ' + bostonSpot + (dragging === 'boston' ? ' held' : '')}
				style={bostonStyle}
				tabindex="0"
				role="button"
				aria-label={'Boston postcard, sent first. Arrow keys move it; Enter posts both.'}
				onPointerEnter={() => look('boston')}
				onPointerLeave={() => (caption = '')}
				onFocus={() => look('boston')}
				onBlur={() => (caption = '')}
				onPointerDown={(event) => grab(event, 'boston')}
				onPointerMove={(event) => drag(event, 'boston')}
				onPointerUp={() => release('boston')}
				onPointerCancel={() => release('boston')}
				onKeyDown={(event) => nudge(event, 'boston')}
			>
				<svg viewBox={'0 0 ' + art.card.w + ' ' + art.card.h} aria-hidden="true">
					<path class="shadow" d={art.cards.boston.shadow} />
					<path class="hatch" d={art.cards.boston.shadowHatch} />
					<path class="paper" d={art.cards.boston.paper} />
					<path class="hatch" d={art.cards.boston.stampHatch} />
					<path class="ink" d={art.cards.boston.ink} />
					<text class="name" x="12" y="30">Boston</text>
					<text class="temp" x="12" y="76">12°</text>
					<g class="void-mark">
						<path class="ink void-ink" d={art.cards.boston.voidRing} />
						<text class="void-text" x="75" y="58">VOID</text>
					</g>
				</svg>
			</div>
			<div
				class={'card denver ' + denverSpot + (dragging === 'denver' ? ' held' : '')}
				style={denverStyle}
				tabindex="0"
				role="button"
				aria-label={'Denver postcard, sent second. Arrow keys move it; Enter posts both.'}
				onPointerEnter={() => look('denver')}
				onPointerLeave={() => (caption = '')}
				onFocus={() => look('denver')}
				onBlur={() => (caption = '')}
				onPointerDown={(event) => grab(event, 'denver')}
				onPointerMove={(event) => drag(event, 'denver')}
				onPointerUp={() => release('denver')}
				onPointerCancel={() => release('denver')}
				onKeyDown={(event) => nudge(event, 'denver')}
			>
				<svg viewBox={'0 0 ' + art.card.w + ' ' + art.card.h} aria-hidden="true">
					<path class="shadow" d={art.cards.denver.shadow} />
					<path class="hatch" d={art.cards.denver.shadowHatch} />
					<path class="paper" d={art.cards.denver.paper} />
					<path class="hatch" d={art.cards.denver.stampHatch} />
					<path class="ink" d={art.cards.denver.ink} />
					<text class="name" x="12" y="30">Denver</text>
					<text class="temp" x="12" y="76">-3°</text>
					<g class="void-mark">
						<path class="ink void-ink" d={art.cards.denver.voidRing} />
						<text class="void-text" x="75" y="58">VOID</text>
					</g>
				</svg>
			</div>
			<svg class="desk pin" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pin-head" d={art.board.pin.head} />
				<path class="ink" d={art.board.pin.ink} />
			</svg>
		</div>
		<div class="controls">
			<InkButton onClick={post}>Post both</InkButton>
			<InkButton alt={true} onClick={reset}>Start over</InkButton>
		</div>
		<p class="caption" aria-hidden="true">{caption === '' ? 'drag a postcard, or hover one' : caption}</p>
		<figcaption class="sr">
			A corkboard with Austin's postcard pinned on it, a post slot at the left, and two postcards on the lane from the slot to the board: Boston, sent first, and Denver,
			sent second and nearer the board. Drag a card along the lane, or focus it and use the arrow keys, to change how far it has to travel.
			Press Post both: both cards travel to the board. Whichever arrives first, Denver ends up pinned, and the other cards are stamped
			VOID and dropped in the bin, because only the latest request's answer is shown. Escape or Start over puts everything back.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.postcards {
				margin: var(--space-m) 0;
			}

			.scene {
				position: relative;
				width: 100%;
				aspect-ratio: 680 / 330;
				container-type: inline-size;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);
				--cork: color-mix(in oklch, var(--yellow) 40%, var(--paper));
				--frame: color-mix(in oklch, var(--ink) 30%, var(--paper));

				--bin: var(--sheet);

				html.dark & {
					--sheet: var(--figure-sheet);
					--cork: color-mix(in oklch, var(--yellow) 40%, var(--cream));
					--frame: var(--slab);
					--bin: var(--figure-sheet);
				}
			}

			.desk {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				pointer-events: none;
			}

			.desk.pin {
				z-index: 3;
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

			.hatch.grain {
				opacity: 0.22;

				html.dark & {
					stroke: var(--on-accent);
				}
			}

			.ink {
				fill: var(--ink);
			}

			.ink.lane {
				opacity: 0.8;
			}

			.frame {
				fill: var(--frame);
			}

			.cork {
				fill: var(--cork);
			}

			.cork-wash {
				fill: var(--yellow);
				opacity: 0.25;
			}

			.paper {
				fill: var(--sheet);
			}

			.desk .paper {
				fill: var(--bin);
			}

			.slit {
				fill: color-mix(in oklch, var(--ink) 85%, var(--paper));

				html.dark & {
					fill: oklch(15% 0.012 90);
				}
			}

			.slot-label {
				font: 600 11px 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
				opacity: 0.8;
			}

			.pin-head {
				fill: var(--pink);
			}

			.card {
				position: absolute;
				z-index: 1;
				outline: none;
				touch-action: pan-y;
				transition: left var(--ms) linear, top var(--ms) ease-in, transform 400ms ease, opacity 400ms ease;
				transform-origin: 50% 50%;
			}

			.card.lane {
				cursor: grab;
			}

			.card.held {
				cursor: grabbing;
				transition: none;
				z-index: 2;
				transform: scale(1.05) rotate(-2deg);
			}

			.card.lane:hover,
			.card.lane:focus-visible {
				transform: translateY(-4px) rotate(-1deg);
			}

			.card.flying {
				z-index: 2;
				transform: rotate(3deg);
			}

			.card.pinned {
				z-index: 1;
			}

			.card.void {
				z-index: 0;
				transform: scale(0.55) rotate(16deg);
				opacity: 0.75;
			}

			.card svg {
				display: block;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.card:focus-visible .paper {
				stroke: var(--yellow);
				stroke-width: 4;
				stroke-dasharray: 6 4;
			}

			.name,
			.temp,
			.void-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.name {
				font-size: 18px;
				font-weight: 800;
			}

			.temp {
				font-size: 30px;
				font-weight: 700;
			}

			.void-mark {
				opacity: 0;
				transform-box: fill-box;
				transform-origin: center;
				transform: scale(1.6) rotate(-12deg);
				transition: opacity 240ms ease, transform 240ms cubic-bezier(0.2, 1.2, 0.3, 1);
			}

			.card.void .void-mark {
				opacity: 1;
				transform: rotate(-12deg);
			}

			.void-ink,
			.void-text {
				fill: var(--pink);
			}

			.void-text {
				font-size: 26px;
				font-weight: 800;
				letter-spacing: 0.1em;
				text-anchor: middle;
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
