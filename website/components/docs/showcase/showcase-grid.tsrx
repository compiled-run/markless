import { Link } from '@markless/core/router';
import { asset } from '../../../site-base.ts';
import InkLogo from '../ink-logo.tsrx';
import { CAST_LAYERS, DESK_LAYERS, PILES, SHEET_OVER, SHEET_UNDER, VIEW } from './sketch.ts';
import { cards } from './view.ts';

const viewBox = '0 0 ' + VIEW.width + ' ' + VIEW.height;
const oldLabel = PILES.old + PILES.w / 2;
const movedLabel = PILES.moved + PILES.w / 2;
const labelY = PILES.base + 17;

export default function ShowcaseGrid() @{
	<ul class="showcase" aria-label="Apps being moved with Markless Migrate">
		@for (const card of cards; key card.slug) {
			<li class={'card tone-' + card.tone}>
				<Link href="/start/migrate/[app]" params={{ app: card.slug }} class="hit">
					<svg class="sketch" viewBox={viewBox} role="img" aria-label={card.alt}>
						<g class="desk">
							@for (const layer of DESK_LAYERS; key layer) {
								<use href={asset(card.sketch) + '#' + layer} class={'l-' + layer} />
							}
							<text class="pile-label" x={oldLabel} y={labelY} text-anchor="middle">old pages</text>
							<text class="pile-label" x={movedLabel} y={labelY} text-anchor="middle">moved</text>
						</g>
						<g class="cast">
							@for (const layer of CAST_LAYERS; key layer) {
								<use href={asset(card.sketch) + '#' + layer} class={'l-' + layer} />
							}
						</g>
						<g class="sheet">
							<use href={asset(card.sketch) + '#' + SHEET_UNDER} class="l-sheet-paper" />
							<image
								class="print"
								href={asset(card.shot)}
								x={card.placement.x}
								y={card.placement.y}
								width={card.placement.width}
								height={card.placement.height}
								transform={card.placement.transform}
								preserveAspectRatio="xMidYMin slice"
							/>
							@for (const layer of SHEET_OVER; key layer) {
								<use href={asset(card.sketch) + '#' + layer} class={'l-' + layer} />
							}
						</g>
					</svg>
					<span class="name">{card.name}</span>
					<span class="progress">{card.progress}</span>
					<span class="quiet">
						Was built with
						@if (card.mark) {
							<span class="logo"><InkLogo mark={card.mark} /></span>
						}
						{card.builtWith}
					</span>
					<span class="quiet">Checks passed: {card.checksPassed}</span>
					@if (card.before && card.after) {
						<span class="quiet">
							JavaScript at load: {card.before}
							<span aria-hidden="true"> → </span>
							<span class="sr-only"> before, now </span>
							{card.after}
						</span>
					}
				</Link>
			</li>
		}
		<style>
			.showcase {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
				gap: var(--space-l) var(--space-m);
				margin: var(--space-m) 0 var(--space-l);
				padding: 0;
				list-style: none;
			}

			.card {
				--tone: var(--pink);
				margin: 0;
				padding: 0;
			}

			.card::before {
				content: none;
			}

			.tone-yellow {
				--tone: var(--yellow);
			}

			.tone-purple {
				--tone: var(--purple);
			}

			.tone-green {
				--tone: var(--green-star);
			}

			.hit {
				display: flex;
				flex-direction: column;
				gap: 0.1em;
				color: var(--ink);
				text-decoration: none;
			}

			.hit:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 6px;
				border-radius: 6px;
			}

			.sketch {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				color: var(--ink);
			}

			.l-sheet-paper,
			.l-pile-paper {
				fill: var(--paper);
			}

			.l-sheet-paper {
				fill: color-mix(in oklch, var(--paper) 88%, currentColor);
			}

			.l-pile-tone {
				fill: currentColor;
				opacity: 0.12;
			}

			.l-sheet-shade {
				fill: currentColor;
				opacity: 0.06;
			}

			.l-sheet-hatch,
			.l-pile-shadow,
			.l-pile-hatch {
				stroke: currentColor;
				stroke-width: 0.55;
				stroke-linecap: round;
				opacity: 0.7;
			}

			.l-sheet-texture {
				stroke: currentColor;
				stroke-width: 0.4;
				stroke-linecap: round;
				opacity: 0.2;
			}

			.l-pile-wash {
				fill: var(--tone);
				opacity: 0.4;
			}

			.l-ground,
			.l-pile-ink,
			.l-sheet-ink {
				fill: currentColor;
			}

			.print {
				filter: grayscale(1) sepia(0.35) contrast(0.8) brightness(1.04);
				mix-blend-mode: multiply;
				opacity: 0.85;

				html.dark & {
					filter: grayscale(1) sepia(0.3) contrast(0.75) brightness(0.85);
					mix-blend-mode: luminosity;
					opacity: 0.7;
				}
			}

			.pile-label {
				fill: currentColor;
				font-size: 10px;
				opacity: 0.75;
			}

			.sheet,
			.cast {
				transform-box: fill-box;
				transform-origin: 40% 40%;
				transition:
					transform 180ms ease,
					opacity 180ms ease;
			}

			.hit:is(:hover, :focus-visible) .sheet {
				transform: translate(-1.5px, -4px) rotate(-0.6deg);
			}

			.hit:is(:hover, :focus-visible) .cast {
				transform: translate(2px, 3px) scale(1.04);
				opacity: 0.8;
			}

			.name {
				position: relative;
				margin: -0.9em 0 0.15em 0.2rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-2);
				font-weight: 700;
				line-height: 1.05;
				letter-spacing: 0.01em;
				transform: rotate(-1.5deg);
				transform-origin: left center;
				width: fit-content;
				max-width: 62%;
			}

			.progress {
				padding-inline: 0.2rem;
				font-size: var(--step-0);
				font-weight: 700;
				line-height: 1.3;
			}

			.quiet {
				padding-inline: 0.2rem;
				color: color-mix(in oklch, var(--ink) 66%, var(--paper));
				font-size: var(--step--1);
				line-height: 1.35;
			}

			.logo {
				margin-inline-start: 0.2em;
				color: var(--ink);
			}

			.sr-only {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			@media (prefers-reduced-motion: reduce) {
				.sheet,
				.cast {
					transition: none;
				}

				.hit:is(:hover, :focus-visible) .sheet,
				.hit:is(:hover, :focus-visible) .cast {
					transform: none;
				}
			}
		</style>
	</ul>
}
