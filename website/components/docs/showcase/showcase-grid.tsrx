import { Link } from '@markless/core/router';
import { asset } from '../../../site-base.ts';
import { BAR, FRAME, FRAME_WIDE, STAMP } from './card-ink.ts';
import { cards } from './view.ts';

const box = (size: { width: number; height: number }) => '0 0 ' + size.width + ' ' + size.height;

export default function ShowcaseGrid() @{
	<ul class="showcase" aria-label="Apps being moved with markless-migrate">
		@for (const card of cards; key card.slug) {
			<li class={'card tone-' + card.tone}>
				<svg class="wash tall" viewBox={box(FRAME)} preserveAspectRatio="none" aria-hidden="true">
					<path d={card.ink.frame.wash} />
				</svg>
				<svg class="wash wide" viewBox={box(FRAME_WIDE)} preserveAspectRatio="none" aria-hidden="true">
					<path d={card.ink.frameWide.wash} />
				</svg>
				<Link href="/start/migrate/[app]" params={{ app: card.slug }} class="hit">
					<svg class="frame tall" viewBox={box(FRAME)} preserveAspectRatio="none" aria-hidden="true">
						<path d={card.ink.frame.ink} />
					</svg>
					<svg class="frame wide" viewBox={box(FRAME_WIDE)} preserveAspectRatio="none" aria-hidden="true">
						<path d={card.ink.frameWide.ink} />
					</svg>
					<span class="thumb">
						<span class="shot">
							<img src={asset(card.shot)} alt={card.alt} width="800" height="500" loading="lazy" decoding="async" />
						</span>
						@if (card.ink.stamp) {
							<span class="stamp">
								<svg viewBox={box(STAMP)} aria-hidden="true">
									<rect class="stamp-paper" x="5" y="5" width="110" height="46" rx="7" />
									<path d={card.ink.stamp.ink} />
									<text x="60" y="36.5" text-anchor="middle">MOVED</text>
								</svg>
								<span class="sr-only">Finished</span>
							</span>
						}
					</span>
					<span class="name">{card.name}</span>
					<span class="progress">
						<span class="progress-text">{card.progress}</span>
						<svg class="bar" viewBox={box(BAR)} preserveAspectRatio="none" aria-hidden="true">
							<path class="bar-fill" d={card.ink.bar.fill} />
							<path class="bar-hatch" d={card.ink.bar.hatch} />
							<path class="bar-ink" d={card.ink.bar.ink} />
						</svg>
					</span>
					<span class="built">Was built with {card.builtWith}</span>
					<span class="built checks">Checks passed: {card.checksPassed}</span>
					<span class="metric">
						<span class="metric-label">JavaScript run at load, home page</span>
						<span class="metric-value">
							<s>{card.before}</s>
							<span aria-hidden="true"> → </span>
							<span class="sr-only"> before, now </span>
							<b>{card.after}</b>
						</span>
					</span>
				</Link>
			</li>
		}
		<style>
			.showcase {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr));
				gap: var(--space-m) var(--space-m);
				margin: var(--space-m) 0 var(--space-l);
				padding: 0;
				list-style: none;
			}

			.card {
				--tone: var(--pink);
				position: relative;
				isolation: isolate;
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

			svg.wide {
				display: none;
			}

			.wash {
				position: absolute;
				inset: 0;
				z-index: -1;
				width: 100%;
				height: 100%;
				overflow: visible;
				transform: translate(7px, 9px);
				pointer-events: none;
			}

			.wash path {
				fill: var(--tone);
				opacity: 0.8;

				html.dark & {
					opacity: 0.55;
				}
			}

			.hit {
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 0.2em;
				height: 100%;
				box-sizing: border-box;
				padding: 0.6rem 0.6rem 0.9rem;
				border-radius: 14px;
				background: var(--raised);
				color: var(--ink);
				text-decoration: none;
				transition: transform 140ms ease;
			}

			.hit:hover,
			.hit:focus-visible {
				transform: translate(-2px, -3px);
			}

			.hit:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.frame {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				pointer-events: none;
			}

			.frame path,
			.bar-ink {
				fill: var(--ink);
			}

			.thumb {
				position: relative;
				display: block;
				margin-bottom: 0.45em;
			}

			.shot {
				display: block;
				border: 1px solid color-mix(in oklch, var(--ink) 55%, transparent);
				border-radius: 8px;
				overflow: hidden;
				aspect-ratio: 8 / 5;
				background: var(--paper);
			}

			.shot img {
				display: block;
				width: 100%;
				height: 100%;
				object-fit: cover;
				object-position: top;
			}

			.stamp {
				--stamp: oklch(47% 0.13 150);
				position: absolute;
				top: -0.55rem;
				right: -0.5rem;
				width: min(46%, 7.25rem);
				transform: rotate(-11deg);
				pointer-events: none;

				html.dark & {
					--stamp: var(--green-star);
				}
			}

			.stamp svg {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
			}

			.stamp-paper {
				fill: var(--raised);
				opacity: 0.85;
			}

			.stamp path {
				fill: var(--stamp);
			}

			.stamp text {
				fill: var(--stamp);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 22px;
				font-weight: 700;
				letter-spacing: 0.14em;
			}

			.name {
				padding-inline: 0.2rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				font-weight: 700;
				line-height: 1.15;
			}

			.progress {
				display: grid;
				gap: 0.15em;
				padding-inline: 0.2rem;
				margin-bottom: 0.35em;
			}

			.progress-text {
				font-size: var(--step--1);
				font-weight: 700;
				line-height: 1.35;
			}

			.bar {
				display: block;
				width: 100%;
				height: 0.85rem;
				overflow: visible;
			}

			.bar-fill {
				fill: var(--tone);
				opacity: 0.9;
			}

			.bar-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.35;
			}

			.built {
				padding-inline: 0.2rem;
				color: color-mix(in oklch, var(--ink) 72%, var(--paper));
				font-size: var(--step--1);
				line-height: 1.35;
			}

			.checks {
				margin-bottom: 0.5em;
			}

			.metric {
				display: grid;
				padding: 0.4em 0.6em;
				border-radius: 8px;
				margin-top: auto;
				background: color-mix(in srgb, var(--tone) 22%, var(--paper));
			}

			.metric-label,
			.metric-value {
				line-height: 1.35;
			}

			.metric-label {
				font-size: var(--step--2);
				letter-spacing: 0.01em;
				opacity: 0.8;
			}

			.metric-value {
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.metric-value s {
				text-decoration: none;
				opacity: 0.7;
			}

			.metric-value b {
				font-weight: 800;
			}

			.sr-only {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			@media (max-width: 600px) {
				.showcase {
					gap: var(--space-m);
				}

				svg.tall {
					display: none;
				}

				svg.wide {
					display: block;
				}

				.hit {
					display: grid;
					grid-template-columns: 38% minmax(0, 1fr);
					grid-template-rows: auto auto auto auto 1fr;
					column-gap: 0.75em;
					padding: 0.55rem;
				}

				.thumb {
					grid-row: 1 / 6;
					align-self: start;
					margin: 0;
				}

				.name {
					font-size: var(--step-0);
				}

				.progress {
					margin-bottom: 0.2em;
				}

				.checks {
					margin-bottom: 0.3em;
				}

				.metric {
					align-self: end;
					padding: 0.3em 0.5em;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.hit {
					transition: none;
				}
			}
		</style>
	</ul>
}
