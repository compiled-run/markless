import { Link } from '@markless/core/router';
import { asset } from '../../../site-base.ts';
import { cards } from './view.ts';

export default function ShowcaseGrid() @{
	<ul class="showcase" aria-label="Apps being moved with markless-migrate">
		@for (const card of cards; key card.slug) {
			<li class={'card tone-' + card.tone}>
				<Link href="/start/migrate/[app]" params={{ app: card.slug }} class="hit">
					<span class="thumb">
						<img src={asset(card.shot)} alt={card.alt} width="800" height="500" loading="lazy" decoding="async" />
					</span>
					<span class="name">{card.name}</span>
					<span class="built">Was built with {card.builtWith}</span>
					<span class="tally">
						<span>Pages moved: <b>{card.pagesMoved}</b></span>
						<span>Checks passed: <b>{card.checksPassed}</b></span>
					</span>
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
				<span class={card.inProgress ? 'progress' : 'progress is-done'}>{card.statusLabel}</span>
			</li>
		}
		<style>
			.showcase {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr));
				gap: var(--space-m) var(--space-s);
				margin: var(--space-m) 0 var(--space-l);
				padding: 0;
				list-style: none;
			}

			.card {
				--tone: var(--pink);
				position: relative;
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
				gap: 0.2em;
				height: 100%;
				box-sizing: border-box;
				padding: 0.55rem 0.55rem 0.85rem;
				border: 1.5px solid var(--ink);
				border-radius: 14px;
				background: var(--raised);
				box-shadow: 6px 6px 0 var(--tone);
				color: var(--ink);
				text-decoration: none;
				transition: transform 140ms ease, box-shadow 140ms ease;
			}

			.hit:hover,
			.hit:focus-visible {
				transform: translate(-2px, -2px);
				box-shadow: 9px 9px 0 var(--tone);
			}

			.thumb {
				display: block;
				margin-bottom: 0.45em;
				border: 1px solid var(--ink);
				border-radius: 8px;
				overflow: hidden;
				aspect-ratio: 8 / 5;
				background: var(--paper);
			}

			.thumb img {
				display: block;
				width: 100%;
				height: 100%;
				object-fit: cover;
				object-position: top;
			}

			.name {
				padding-inline: 0.2rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				font-weight: 700;
				line-height: 1.15;
			}

			.name + .built {
				margin-bottom: 0.3em;
			}

			.tally {
				display: grid;
				padding-inline: 0.2rem;
				margin-bottom: 0.6em;
				font-size: var(--step--1);
				line-height: 1.35;
			}

			.tally b {
				font-family: var(--font-mono);
				font-weight: 800;
			}

			.built {
				padding-inline: 0.2rem;
				color: color-mix(in oklch, var(--ink) 72%, var(--paper));
				font-size: var(--step--1);
				line-height: 1.35;
			}

			.metric {
				display: grid;
				padding: 0.4em 0.6em;
				border-radius: 8px;
				margin-top: auto;
				background: color-mix(in srgb, var(--tone) 28%, var(--paper));
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

			.progress {
				position: absolute;
				top: -0.7rem;
				right: -0.5rem;
				padding: 0.2em 0.75em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--yellow);
				box-shadow: 0 0 0 3px white, 2px 3px 0 3px color-mix(in srgb, var(--ink) 25%, transparent);
				color: var(--on-accent);
				font-size: var(--step--1);
				font-weight: 800;
				transform: rotate(4deg);
				pointer-events: none;
			}

			.progress.is-done {
				background: var(--green-star);
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
					gap: var(--space-s);
				}

				.hit {
					display: grid;
					grid-template-columns: 38% minmax(0, 1fr);
					grid-template-rows: auto auto auto 1fr;
					column-gap: 0.75em;
					padding: 0.5rem;
				}

				.thumb {
					grid-row: 1 / 5;
					align-self: start;
					margin: 0;
				}

				.name {
					font-size: var(--step-0);
				}

				.name + .built,
				.tally {
					margin-bottom: 0.3em;
				}

				.metric {
					align-self: end;
					padding: 0.3em 0.5em;
				}

				.progress {
					top: -0.6rem;
					right: auto;
					left: -0.4rem;
					font-size: var(--step--2);
					transform: rotate(-4deg);
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
