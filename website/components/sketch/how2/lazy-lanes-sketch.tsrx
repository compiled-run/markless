import { computed, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import RoughBox from './rough-box.tsrx';

export default function LazyLanesSketch() @{
	let likes = state(0);
	let saves = state(0);
	let loads = state(0);
	let clicks = state(0);
	let first = state('none');
	let lastAct = state('load');
	const loadBeat = computed(() => (loads === 0 ? 'first' : loads % 2 === 0 ? 'even' : 'odd'));
	const clickBeat = computed(() => (clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'));

	<figure class="sketch">
		<figcaption>
			<span class="ask">Downloaded early, run on click</span>
			<svg class="underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
				<path d="M3 9.5 C 60 5.2 120 10.8 180 7.4 C 225 5 262 8.6 297 6.2" />
			</svg>
		</figcaption>

		<div class="top">
			<div class="page">
				<RoughBox shape="a" />
				<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
				<div class="buttons">
					<button
						type="button"
						data-act="like"
						onClick={() => {
							likes++;
							clicks++;
							lastAct = 'like';
							if (first === 'none') first = 'like';
						}}
					>
						Like {likes}
					</button>
					<button
						type="button"
						data-act="save"
						onClick={() => {
							saves++;
							clicks++;
							lastAct = 'save';
							if (first === 'none') first = 'save';
						}}
					>
						Save {saves}
					</button>
				</div>
			</div>
			<div class="side">
				<button
					type="button"
					class="reload"
					onClick={() => {
						likes = 0;
						saves = 0;
						clicks = 0;
						first = 'none';
						lastAct = 'load';
						loads++;
					}}
				>
					↻ load the page again
				</button>
				<div class="mug-spot">
					<MugArt
						variant="toc"
						mood={clicks === 0 ? 'idle' : clicks % 2 === 0 ? 'wiggle' : 'wide'}
						face="neutral"
						glaze="cream"
						pour="rosetta"
						coaster="off"
						companion="off"
						paused="false"
						interacted={clicks > 0 ? 'true' : 'false'}
						reaction="rest"
					/>
				</div>
			</div>
		</div>

		<div class="lane downloaded">
			<RoughBox shape="b" />
			<p class="lane-name">downloaded</p>
			<div class="drop" data-load={loadBeat}>
				<div class="card-wrap">
				<IndexCard label="first-use pack" tilt="-1.2deg">
					<ul class="symbols">
						<li>Like click handler</li>
						<li>Save click handler</li>
						<li>likes text update</li>
						<li>saves text update</li>
						<li class="rider">+ navigation code rides along: too small for its own file</li>
					</ul>
				</IndexCard>
				</div>
				<p class="pin-note" aria-hidden="true">with the page, by <b>modulepreload</b>: fetched, not run</p>
			</div>
			<p class="quiet" data-beat={clickBeat} aria-hidden="true">click: nothing new downloads</p>
		</div>

		<div class="lane ran" data-first={first}>
			<RoughBox shape="c" />
			<p class="lane-name">ran</p>
			<p class="empty" data-shown={clicks === 0 ? 'true' : 'false'}>nothing yet: no handler runs at mount</p>
			<div class="runs">
				<div class="pair like" data-shown={likes > 0 ? 'true' : 'false'}>
					<div class="run">
						<RoughBox shape="a" />
						<span>Like click handler</span>
						<b class="times">×{likes}</b>
						<MarkerCircle beat={lastAct === 'like' ? clickBeat : 'rest'} tone="green" />
					</div>
					<span class="then" aria-hidden="true">→</span>
					<div class="run">
						<RoughBox shape="b" />
						<span>likes text update</span>
						<b class="times">×{likes}</b>
					</div>
				</div>
				<div class="pair save" data-shown={saves > 0 ? 'true' : 'false'}>
					<div class="run">
						<RoughBox shape="a" />
						<span>Save click handler</span>
						<b class="times">×{saves}</b>
						<MarkerCircle beat={lastAct === 'save' ? clickBeat : 'rest'} tone="green" />
					</div>
					<span class="then" aria-hidden="true">→</span>
					<div class="run">
						<RoughBox shape="b" />
						<span>saves text update</span>
						<b class="times">×{saves}</b>
					</div>
				</div>
			</div>
		</div>

		<p class="say" aria-live="polite">
			{lastAct === 'like'
				? 'The Like click ran its handler and the likes text update. Nothing new downloaded.'
				: lastAct === 'save'
					? 'The Save click ran its handler and the saves text update. Nothing new downloaded.'
					: 'Page load: the first-use pack downloaded. No handler ran.'}
		</p>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0 0.4rem;
				color: var(--ink);
			}

			figcaption {
				position: relative;
				width: fit-content;
				margin: 0 auto var(--space-m);
				rotate: -1.5deg;
			}

			.ask {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-2);
				font-weight: 700;
				line-height: 1.15;
			}

			.underline {
				display: block;
				width: 100%;
				height: 0.55em;
				margin-top: -0.1em;
				fill: none;
				stroke: var(--pink);
				stroke-width: 4;
				stroke-linecap: round;
			}

			.top {
				display: flex;
				align-items: flex-end;
				justify-content: space-between;
				gap: 1rem;
				padding: 0 0.6rem;
			}

			.page {
				position: relative;
				padding: 0.6rem 1rem 1rem;
				box-shadow: 4px 4px 0 var(--purple);
				--box-fill: var(--raised);
				--box-weight: 2.2;
			}

			.strip {
				position: relative;
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0 0 0.6rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--muted-ink);
			}

			.dots {
				display: inline-flex;
				gap: 0.25rem;
			}

			.dots i {
				width: 0.55rem;
				height: 0.55rem;
				border: 1.5px solid var(--ink);
				border-radius: 50%;
			}

			.dots i:nth-child(1) {
				background: var(--pink);
			}

			.dots i:nth-child(2) {
				background: var(--yellow);
			}

			.dots i:nth-child(3) {
				background: var(--green-star);
			}

			.buttons {
				position: relative;
				display: flex;
				gap: 0.9rem;
			}

			button {
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}

			button:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.side {
				display: flex;
				align-items: flex-end;
				gap: 0.4rem;
			}

			.reload {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				padding: 0.15em 0.6em;
				background: transparent;
				color: var(--ink);
				border: 1.5px dashed var(--ink);
				box-shadow: none;
				margin-bottom: 0.4rem;
			}

			.mug-spot {
				zoom: 0.5;
				margin-bottom: -1.2rem;
				--gaze-x: -5px;
				--gaze-y: 6px;
			}

			.lane {
				position: relative;
				display: grid;
				grid-template-columns: max-content minmax(0, 1fr);
				column-gap: 1.4rem;
				align-items: center;
				min-height: 7rem;
				margin: var(--space-m) 0 0;
				padding: 1rem 1rem 1rem 0.8rem;
				--box-weight: 2;
			}

			.downloaded {
				--box-fill: color-mix(in oklch, var(--yellow) 12%, transparent);
			}

			.ran {
				--box-fill: color-mix(in oklch, var(--green-star) 12%, transparent);
			}

			.lane-name {
				position: relative;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				font-weight: 700;
				rotate: -4deg;
			}

			.drop {
				position: relative;
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.4rem 1.4rem;
				padding-top: 0.6rem;
			}

			.card-wrap {
				flex: 0 1 18rem;
				min-width: 0;
			}

			.drop[data-load='first'] {
				animation: drop-a 600ms cubic-bezier(0.3, 1.4, 0.5, 1) 300ms both;
			}

			.drop[data-load='odd'] {
				animation: drop-b 600ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
			}

			.drop[data-load='even'] {
				animation: drop-c 600ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
			}

			@keyframes drop-a {
				from {
					opacity: 0;
					translate: 0 -2.2rem;
				}
			}

			@keyframes drop-b {
				from {
					opacity: 0;
					translate: 0 -2.2rem;
				}
			}

			@keyframes drop-c {
				from {
					opacity: 0;
					translate: 0 -2.2rem;
				}
			}

			.symbols {
				margin: 0;
				padding: 0;
				list-style: none;
				font-family: var(--font-mono);
				font-size: 0.74rem;
				line-height: 1.5rem;
			}

			.symbols li {
				margin: 0;
				padding: 0;
			}

			.rider {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.86rem;
				color: oklch(48% 0.16 310);
			}

			.pin-note {
				flex: 1 1 9rem;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.2;
				rotate: 1.5deg;
			}

			.pin-note b {
				font-family: var(--font-mono);
				font-size: 0.8em;
				font-weight: 600;
			}

			.quiet {
				position: absolute;
				right: 1rem;
				bottom: -0.7rem;
				margin: 0;
				padding: 0 0.4rem;
				background: var(--paper);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: oklch(55% 0.2 0);
				rotate: -2deg;
			}

			.quiet[data-beat='rest'] {
				visibility: hidden;
			}

			.quiet[data-beat='odd'] {
				animation: pop-a 500ms ease both;
			}

			.quiet[data-beat='even'] {
				animation: pop-b 500ms ease both;
			}

			@keyframes pop-a {
				from {
					opacity: 0;
					translate: 0 0.4rem;
				}
			}

			@keyframes pop-b {
				from {
					opacity: 0;
					translate: 0 0.4rem;
				}
			}

			.empty {
				position: relative;
				grid-column: 2;
				grid-row: 1;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				color: var(--muted-ink);
			}

			.empty[data-shown='false'] {
				display: none;
			}

			.runs {
				grid-column: 2;
				grid-row: 1;
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				gap: 0.9rem;
			}

			.pair {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.5rem 0.6rem;
			}

			.pair[data-shown='false'] {
				display: none;
			}

			.then {
				font-size: var(--step-1);
				line-height: 1;
			}

			.run {
				position: relative;
				display: flex;
				align-items: baseline;
				gap: 0.5rem;
				padding: 0.35rem 0.7rem;
				font-family: var(--font-mono);
				font-size: 0.74rem;
				--box-fill: var(--raised);
				animation: land 360ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
			}

			.run span {
				position: relative;
			}

			.ran[data-first='save'] .like {
				order: 2;
			}

			.times {
				position: relative;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				color: oklch(55% 0.2 0);
			}

			@keyframes land {
				from {
					opacity: 0;
					scale: 0.6;
				}
			}

			.say {
				margin: var(--space-s) 0 0;
				padding: 0 0.6rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.25;
			}

			.say::before {
				content: '↑ ';
			}

			@media (prefers-reduced-motion: reduce) {
				.drop,
				.quiet,
				.run {
					animation: none !important;
				}
			}

			@container (max-width: 34rem) {
				.ask {
					font-size: var(--step-1);
				}

				.top {
					flex-wrap: wrap;
					padding: 0;
				}

				.lane {
					grid-template-columns: minmax(0, 1fr);
					row-gap: 0.4rem;
				}

				.empty,
				.runs {
					grid-column: 1;
					grid-row: 2;
				}

				.pair {
					flex-direction: column;
					align-items: flex-start;
				}

				.then {
					rotate: 90deg;
					margin-left: 1rem;
				}

				.say {
					padding: 0;
				}
			}
		</style>
	</figure>
}
