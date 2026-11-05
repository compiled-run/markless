// Three name cards in three numbered slots: Reverse, or drag a card onto another, and each card walks to its new slot with its own tick.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import InkButton from '../ink/ink-button.tsrx';
import { CARD_W, describeOrder, FIRST, type GuestId, nameOf, reverse, slotAt, slotOf, swap, toggle } from './tent-model.ts';
import { art } from './tent.art.ts';

export default function TentAnatomy() @{
	let order = state<readonly GuestId[]>(FIRST);
	let ticked = state<readonly GuestId[]>(['grace']);
	let dragging = state('');
	let dragX = state(0);
	let fromX = state(0);
	let scale = state(1);
	let said = state('');
	let prev = state<readonly GuestId[]>(FIRST);
	let beat = state('rest');
	const gracePlace = computed(() => 'left: ' + ((art.slots[slotOf(order, 'grace')]! - 30 + (dragging === 'grace' ? dragX : 0)) / art.width) * 100 + '%');
	const linusPlace = computed(() => 'left: ' + ((art.slots[slotOf(order, 'linus')]! - 30 + (dragging === 'linus' ? dragX : 0)) / art.width) * 100 + '%');
	const adaPlace = computed(() => 'left: ' + ((art.slots[slotOf(order, 'ada')]! - 30 + (dragging === 'ada' ? dragX : 0)) / art.width) * 100 + '%');
	const hop0 = computed(() => (slotOf(order, 'grace') > slotOf(prev, 'grace') ? 'hop up ' + beat : 'hop'));
	const hop1 = computed(() => (slotOf(order, 'linus') > slotOf(prev, 'linus') ? 'hop up ' + beat : 'hop'));
	const hop2 = computed(() => (slotOf(order, 'ada') > slotOf(prev, 'ada') ? 'hop up ' + beat : 'hop'));

	<figure class="anatomy tents">
		<div class="scene" data-dragging={dragging === '' ? 'no' : 'yes'} role="group" aria-label="Three name cards in three slots">
		<svg class="table" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
			<path class="ink" d={art.table.edge} />
			<path class="ink faint" d={art.table.marks} />
			<path class="ink faint" d={art.table.pins} />
			<text class="slot" x={art.slots[0]! + CARD_W / 2} y={art.table.numberY}>1</text>
			<text class="slot" x={art.slots[1]! + CARD_W / 2} y={art.table.numberY}>2</text>
			<text class="slot" x={art.slots[2]! + CARD_W / 2} y={art.table.numberY}>3</text>
		</svg>
			<div
				class={dragging === 'grace' ? 'card held' : hop0 === 'hop' ? 'card' : 'card lifted'}
				style={gracePlace}
				tabindex="0"
				role="checkbox"
				aria-checked={ticked.includes('grace') ? 'true' : 'false'}
				aria-label={nameOf('grace') + ', in slot ' + (slotOf(order, 'grace') + 1)}
				onPointerDown={(event) => {
					capture(event);
					scale = art.width / (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width;
					fromX = event.clientX;
					dragging = 'grace';
					dragX = 0;
				}}
				onPointerMove={(event) => {
					if (dragging === 'grace') dragX = (event.clientX - fromX) * scale;
				}}
				onPointerUp={() => {
					if (dragging !== 'grace') return;
					dragging = '';
					if (Math.abs(dragX) < 8) ticked = toggle(ticked, 'grace');
					else {
						const from = slotOf(order, 'grace');
						prev = order;
						order = swap(order, from, slotAt(art.slots[from]! + dragX, art.slots, CARD_W));
						beat = beat === 'odd' ? 'even' : 'odd';
					}
					dragX = 0;
					said = describeOrder(order, ticked);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();const from = slotOf(order, 'grace');
					if (event.key === ' ' || event.key === 'Enter') ticked = toggle(ticked, 'grace');
					else if (event.key === 'ArrowLeft' && from > 0) {
						prev = order;
						order = swap(order, from, from - 1);
						beat = beat === 'odd' ? 'even' : 'odd';
					} else if (event.key === 'ArrowRight' && from < 2) {
						prev = order;
						order = swap(order, from, from + 1);
						beat = beat === 'odd' ? 'even' : 'odd';
					}
					else return;
					said = describeOrder(order, ticked);
				}}
			>
				<svg class="card-art" viewBox="-30 30 250 210" aria-hidden="true">
					<g class={hop0}>
					<g class="cast">
						<path class="shadow soft" d={art.cards[0].sides} />
						<path class="hatch" d={art.cards[0].sideHatch} />
						<path class="shadow" d={art.cards[0].shadow} />
						<path class="hatch" d={art.cards[0].shadowHatch} />
					</g>
					<path class="back" d={art.cards[0].back} />
					<path class="hatch light" d={art.cards[0].backHatch} />
					<path class="face" d={art.cards[0].face} />
					<path class={ticked.includes('grace') ? 'wash on' : 'wash'} d={art.cards[0].tickWash} />
					<path class="ink" d={art.cards[0].ink} />
					<path class="ink" d={art.cards[0].box} />
					<path class={ticked.includes('grace') ? 'tick on' : 'tick'} d={art.cards[0].tick} />
					<text class="name" x={art.cards[0].nameX} y={art.cards[0].nameY}>{nameOf('grace')}</text>
					</g>
				</svg>
			</div>
			<div
				class={dragging === 'linus' ? 'card held' : hop1 === 'hop' ? 'card' : 'card lifted'}
				style={linusPlace}
				tabindex="0"
				role="checkbox"
				aria-checked={ticked.includes('linus') ? 'true' : 'false'}
				aria-label={nameOf('linus') + ', in slot ' + (slotOf(order, 'linus') + 1)}
				onPointerDown={(event) => {
					capture(event);
					scale = art.width / (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width;
					fromX = event.clientX;
					dragging = 'linus';
					dragX = 0;
				}}
				onPointerMove={(event) => {
					if (dragging === 'linus') dragX = (event.clientX - fromX) * scale;
				}}
				onPointerUp={() => {
					if (dragging !== 'linus') return;
					dragging = '';
					if (Math.abs(dragX) < 8) ticked = toggle(ticked, 'linus');
					else {
						const from = slotOf(order, 'linus');
						prev = order;
						order = swap(order, from, slotAt(art.slots[from]! + dragX, art.slots, CARD_W));
						beat = beat === 'odd' ? 'even' : 'odd';
					}
					dragX = 0;
					said = describeOrder(order, ticked);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();const from = slotOf(order, 'linus');
					if (event.key === ' ' || event.key === 'Enter') ticked = toggle(ticked, 'linus');
					else if (event.key === 'ArrowLeft' && from > 0) {
						prev = order;
						order = swap(order, from, from - 1);
						beat = beat === 'odd' ? 'even' : 'odd';
					} else if (event.key === 'ArrowRight' && from < 2) {
						prev = order;
						order = swap(order, from, from + 1);
						beat = beat === 'odd' ? 'even' : 'odd';
					}
					else return;
					said = describeOrder(order, ticked);
				}}
			>
				<svg class="card-art" viewBox="-30 30 250 210" aria-hidden="true">
					<g class={hop1}>
					<g class="cast">
						<path class="shadow soft" d={art.cards[1].sides} />
						<path class="hatch" d={art.cards[1].sideHatch} />
						<path class="shadow" d={art.cards[1].shadow} />
						<path class="hatch" d={art.cards[1].shadowHatch} />
					</g>
					<path class="back" d={art.cards[1].back} />
					<path class="hatch light" d={art.cards[1].backHatch} />
					<path class="face" d={art.cards[1].face} />
					<path class={ticked.includes('linus') ? 'wash on' : 'wash'} d={art.cards[1].tickWash} />
					<path class="ink" d={art.cards[1].ink} />
					<path class="ink" d={art.cards[1].box} />
					<path class={ticked.includes('linus') ? 'tick on' : 'tick'} d={art.cards[1].tick} />
					<text class="name" x={art.cards[1].nameX} y={art.cards[1].nameY}>{nameOf('linus')}</text>
					</g>
				</svg>
			</div>
			<div
				class={dragging === 'ada' ? 'card held' : hop2 === 'hop' ? 'card' : 'card lifted'}
				style={adaPlace}
				tabindex="0"
				role="checkbox"
				aria-checked={ticked.includes('ada') ? 'true' : 'false'}
				aria-label={nameOf('ada') + ', in slot ' + (slotOf(order, 'ada') + 1)}
				onPointerDown={(event) => {
					capture(event);
					scale = art.width / (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width;
					fromX = event.clientX;
					dragging = 'ada';
					dragX = 0;
				}}
				onPointerMove={(event) => {
					if (dragging === 'ada') dragX = (event.clientX - fromX) * scale;
				}}
				onPointerUp={() => {
					if (dragging !== 'ada') return;
					dragging = '';
					if (Math.abs(dragX) < 8) ticked = toggle(ticked, 'ada');
					else {
						const from = slotOf(order, 'ada');
						prev = order;
						order = swap(order, from, slotAt(art.slots[from]! + dragX, art.slots, CARD_W));
						beat = beat === 'odd' ? 'even' : 'odd';
					}
					dragX = 0;
					said = describeOrder(order, ticked);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();const from = slotOf(order, 'ada');
					if (event.key === ' ' || event.key === 'Enter') ticked = toggle(ticked, 'ada');
					else if (event.key === 'ArrowLeft' && from > 0) {
						prev = order;
						order = swap(order, from, from - 1);
						beat = beat === 'odd' ? 'even' : 'odd';
					} else if (event.key === 'ArrowRight' && from < 2) {
						prev = order;
						order = swap(order, from, from + 1);
						beat = beat === 'odd' ? 'even' : 'odd';
					}
					else return;
					said = describeOrder(order, ticked);
				}}
			>
				<svg class="card-art" viewBox="-30 30 250 210" aria-hidden="true">
					<g class={hop2}>
					<g class="cast">
						<path class="shadow soft" d={art.cards[2].sides} />
						<path class="hatch" d={art.cards[2].sideHatch} />
						<path class="shadow" d={art.cards[2].shadow} />
						<path class="hatch" d={art.cards[2].shadowHatch} />
					</g>
					<path class="back" d={art.cards[2].back} />
					<path class="hatch light" d={art.cards[2].backHatch} />
					<path class="face" d={art.cards[2].face} />
					<path class={ticked.includes('ada') ? 'wash on' : 'wash'} d={art.cards[2].tickWash} />
					<path class="ink" d={art.cards[2].ink} />
					<path class="ink" d={art.cards[2].box} />
					<path class={ticked.includes('ada') ? 'tick on' : 'tick'} d={art.cards[2].tick} />
					<text class="name" x={art.cards[2].nameX} y={art.cards[2].nameY}>{nameOf('ada')}</text>
					</g>
				</svg>
			</div>
		</div>
		<div class="controls">
			<InkButton
				onClick={() => {
					prev = order;
					order = reverse(order);
					beat = beat === 'odd' ? 'even' : 'odd';
					said = describeOrder(order, ticked);
				}}
			>
				Reverse
			</InkButton>
		</div>
		<figcaption class="sr">
			Three folded name cards stand in three numbered slots: Grace, Linus and Ada, with Grace ticked. Press Reverse, or drag a card onto
			another slot, or focus a card and use the arrow keys: the cards walk to their new slots and each tick goes with its own card, while
			the slot numbers stay put. Click a card, or press Space on it, to tick it.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.tents {
				margin: calc(var(--space-m) + 3rem) 0 var(--space-m);
			}

			.scene {
				position: relative;
				width: 100%;
				aspect-ratio: 680 / 300;
				touch-action: pan-y;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.table {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.card {
				position: absolute;
				top: 10%;
				width: 36.76%;
				touch-action: none;
				cursor: grab;
				outline: none;
				transition: left 700ms cubic-bezier(0.4, 0, 0.2, 1);
			}

			.card-art {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
			}

			.card:hover .face,
			.card:focus-visible .face {
				filter: drop-shadow(0 -4px 0 var(--shade));
			}

			.card:focus-visible .face {
				stroke: var(--ink);
				stroke-dasharray: 5 5;
				stroke-width: 1.5;
			}

			.up.odd {
				animation: hop-a 700ms cubic-bezier(0.4, 0, 0.2, 1);
			}

			.up.even {
				animation: hop-b 700ms cubic-bezier(0.4, 0, 0.2, 1);
			}

			@keyframes hop-a {
				50% {
					transform: translateY(-130px) rotate(-4deg);
				}
			}

			@keyframes hop-b {
				50% {
					transform: translateY(-130px) rotate(-4deg);
				}
			}

			.lifted {
				z-index: 1;
			}

			.held {
				z-index: 2;
				cursor: grabbing;
				transition: none;
			}

			.cast {
				transition: transform 180ms ease, opacity 180ms ease;
			}

			.soft {
				opacity: 0.6;
			}

			.held .cast {
				transform: translate(16px, 22px) scale(1.1);
				opacity: 0.85;
			}

			.held .card-art > g {
				transform: translateY(-12px) scale(1.05);
				transform-box: fill-box;
				transform-origin: 50% 100%;
			}

			.scene[data-dragging='yes'] .card:not(.held) {
				filter: brightness(0.97);
			}

			.scene[data-dragging='yes'] .card:not(.held) .cast {
				transform: translateY(2px) scale(0.96);
			}

			.shadow {
				fill: var(--shade);
			}

			.back {
				fill: color-mix(in oklch, var(--ink) 12%, var(--sheet));
			}

			.face {
				fill: var(--sheet);
			}

			.ink {
				fill: var(--ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;
			}

			.light {
				opacity: 0.35;
			}

			.wash,
			.tick {
				opacity: 0;
				transition: opacity 200ms ease;
			}

			.wash {
				fill: var(--yellow);
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.tick {
				fill: var(--ink);
			}

			.on {
				opacity: 0.85;
			}

			.tick.on {
				opacity: 1;
			}

			.name,
			.slot {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.name {
				font-size: 30px;
				font-weight: 800;
			}

			.slot {
				font-size: 15px;
				font-weight: 700;
				text-anchor: middle;
				opacity: 0.6;
			}

			.controls {
				display: flex;
				justify-content: center;
				margin-top: 0.4rem;
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
