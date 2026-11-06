// A card-catalogue drawer whose label is a filter: type on it and the cards that don't match sink below the edge, the rest close up in their order.
import { computed, state } from '@markless/core';
import { CARDS, describeFilter, MAX_QUERY, placeOf, shownOf } from './drawer-model.ts';
import { art } from './drawer.art.ts';

export default function DrawerAnatomy() @{
	let query = state('');
	let hovered = state('');
	let said = state('');
	const count = computed(() => shownOf(query).length);

	<figure class="anatomy drawer">
		<div class="stage">
			<svg class="scene" viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="a card-catalogue drawer filtered by its label">
				<defs>
					<clipPath id="drawer-well">
						<rect x="0" y="0" width={art.width} height={art.front.clipTop} />
					</clipPath>
				</defs>
				<path class="side" d={art.front.sides} />
				<path class="ink" d={art.front.sideInk} />
				<g clip-path="url(#drawer-well)">
					@for (const card of art.cards.toReversed(); key card.id) {
						<g
							class={hovered === card.id ? 'card lifted' : 'card'}
							style={placeOf(query, card.id)}
							onPointerEnter={() => (hovered = card.id)}
							onPointerLeave={() => (hovered = '')}
						>
							<path class="paper" d={card.card} />
							<path class="ink" d={card.ink} />
							<text class="title" x={card.textX} y={card.textY}>{card.title}</text>
						</g>
					}
				</g>
				<path class="shadow" d={art.front.shadow} />
				<path class="hatch" d={art.front.shadowHatch} />
				<path class="wood" d={art.front.front} />
				<path class="hatch grain" d={art.front.grain} />
				<path class="brass" d={art.front.holder} />
				<path class="ink" d={art.front.ink} />
			</svg>
			<input
				class="label"
				type="text"
				value={query}
				maxlength={MAX_QUERY}
				placeholder="type here"
				aria-label="filter the drawer by title"
				spellcheck={false}
				autocomplete="off"
				onInput={(event) => {
					query = event.currentTarget.value;
					said = describeFilter(query);
				}}
				onKeyDown={(event) => {
					if (event.key !== 'Escape') return;
					event.preventDefault();
					query = '';
					said = describeFilter('');
				}}
			/>
		</div>
		<p class="caption" aria-hidden="true">
			{hovered === '' ? count + ' of 6 cards shown' : "key: '" + hovered + "'"}
		</p>
		<figcaption class="sr">
			An ink drawing of a library card-catalogue drawer with six index cards standing in it, a title on each tab. The brass label on
			the drawer front is a text box: type in it and the cards whose title doesn't match sink below the drawer edge, while the cards that
			match close up at the front in the same order. Clear it, or press Escape, and they all rise back.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.drawer {
				margin: var(--space-m) 0;
			}

			.stage {
				position: relative;
				container-type: inline-size;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);
				--wood: color-mix(in oklch, var(--paper) 62%, oklch(62% 0.08 55));
				--brass: color-mix(in oklch, var(--paper) 55%, oklch(78% 0.12 85));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
					--wood: color-mix(in oklch, var(--ink) 72%, oklch(50% 0.08 55));
					--brass: color-mix(in oklch, var(--ink) 70%, oklch(70% 0.12 85));
				}
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

			.grain {
				opacity: 0.25;
			}

			.ink {
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.wood,
			.side {
				fill: var(--wood);
			}

			.side {
				filter: brightness(0.85);
			}

			.brass {
				fill: var(--brass);
			}

			.card {
				transition: transform 420ms cubic-bezier(0.3, 0.7, 0.3, 1);
			}

			.card .paper,
			.card .ink,
			.card .title {
				transition: translate 160ms ease;
			}

			.lifted :is(.paper, .ink, .title) {
				translate: 0 -8px;
			}

			.title {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 14px;
				font-weight: 700;
				text-anchor: middle;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.label {
				position: absolute;
				left: calc(270 / 680 * 100%);
				top: calc(260 / 364 * 100%);
				width: calc(140 / 680 * 100%);
				height: calc(36 / 364 * 100%);
				box-sizing: border-box;
				margin: 0;
				padding: 0 0.3em;
				border: 0;
				border-radius: 3px;
				background: color-mix(in oklch, var(--paper) 70%, white);
				color: var(--ink);
				font: 700 max(13px, 2.6cqi) / 1 'Shantell Sans', system-ui, sans-serif;
				text-align: center;
				box-shadow: inset 0 1px 3px color-mix(in oklch, var(--ink) 25%, transparent);

				html.dark & {
					background: var(--ink);
					color: var(--paper);
				}
			}

			.label::placeholder {
				color: var(--muted-ink);
				font-weight: 400;
			}

			.label:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 3px;
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
