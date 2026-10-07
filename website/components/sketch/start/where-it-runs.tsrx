// "Where can this counter run?" One counter, three places to put it. The frame
// around the button changes; the button and its code do not.
import { state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import SketchAsk from './sketch-ask.tsrx';

export default function WhereItRuns() @{
	let place = state('tab');
	let moves = state(0);
	let clicks = state(0);
	let where = state('in the browser tab');

	<figure class="sketch">
		<SketchAsk text="Where can this counter run?" />

		<div class="picks" role="group" aria-label="Pick a place">
			<button
				type="button"
				class="pick"
				aria-pressed={place === 'tab' ? 'true' : 'false'}
				onClick={() => {
					place = 'tab';
					moves++;
					where = 'in the browser tab';
				}}
			>a browser tab</button>
			<button
				type="button"
				class="pick"
				aria-pressed={place === 'server' ? 'true' : 'false'}
				onClick={() => {
					place = 'server';
					moves++;
					where = 'on the server';
				}}
			>a server</button>
			<button
				type="button"
				class="pick"
				aria-pressed={place === 'test' ? 'true' : 'false'}
				onClick={() => {
					place = 'test';
					moves++;
					where = 'inside the test';
				}}
			>a test</button>
		</div>

		<div class="board" data-place={place}>
			<div class="frame">
				<p class="chrome tab-bar" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span><span class="url">my-app.dev</span></p>
				<p class="chrome server-bar" aria-hidden="true"><svg class="rack" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /><circle cx="7" cy="6.5" r="1" /><circle cx="7" cy="17.5" r="1" /></svg>HTML made on a server</p>
				<p class="chrome test-bar" aria-hidden="true"><span class="tick">✓</span>counter.test.ts</p>
				<div class="stage">
					<button type="button" class="count" onClick={() => clicks++}>Count {clicks}</button>
				</div>
			</div>

			<div class="arrow">
				<InkArrow width={80} height={50} x1={76} y1={30} x2={8} y2={22} bend={-10} seed={21} shown="true" />
			</div>

			<div class="aside">
				<p class="note" aria-live="polite">
					Counter ran once, <span class="said">{where}<MarkerSweep beat={moves === 0 ? 'rest' : moves % 2 === 0 ? 'even' : 'odd'} place="" /></span>
				</p>
				<p class="same">same button, same code</p>
				<span class="mug-spot">
					<MugArt
						variant="toc"
						mood={moves === 0 ? 'idle' : moves % 2 === 0 ? 'wiggle' : 'wide'}
						face="neutral"
						glaze="cream"
						pour="rosetta"
						coaster="off"
						companion="off"
						paused="false"
						interacted={moves > 0 ? 'true' : 'false'}
						reaction="rest"
					/>
				</span>
			</div>
		</div>

		<style>
			.sketch {
				--sweep-delay: 120ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.picks {
				display: flex;
				flex-wrap: wrap;
				justify-content: center;
				gap: 0.6rem 0.9rem;
				margin: 0 0 1.4rem;
			}

			.pick {
				padding: 0.25em 0.8em;
				border: 2px solid var(--ink);
				border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
				background: var(--raised);
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				rotate: -1deg;
			}

			.pick:nth-child(2) {
				rotate: 1.2deg;
			}

			.pick[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
				box-shadow: 2px 3px 0 var(--ink);
			}

			.pick:focus-visible,
			.count:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1.15fr) 4.5rem minmax(0, 1fr);
				align-items: center;
				gap: 0.5rem;
			}

			.frame {
				border: 2px solid var(--ink);
				border-radius: 6px 9px 7px 5px;
				background: var(--raised);
				box-shadow: -3px 5px 0 color-mix(in oklch, var(--ink) 18%, transparent);
				rotate: -0.8deg;
				overflow: hidden;
			}

			.chrome {
				display: none;
				align-items: center;
				gap: 0.5rem;
				margin: 0;
				padding: 0.35rem 0.7rem;
				border-bottom: 2px solid var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.2;
			}

			.board[data-place='tab'] .tab-bar,
			.board[data-place='server'] .server-bar,
			.board[data-place='test'] .test-bar {
				display: flex;
			}

			.tab-bar {
				background: color-mix(in oklch, var(--pink) 30%, var(--raised));
			}

			.server-bar {
				background: color-mix(in oklch, var(--purple) 30%, var(--raised));
			}

			.test-bar {
				background: color-mix(in oklch, var(--green-star) 30%, var(--raised));
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
				background: var(--paper);
			}

			.url {
				flex: 1;
				padding: 0 0.5rem;
				border: 1.5px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				font-family: var(--font-mono);
				font-size: 0.75rem;
			}

			.rack {
				width: 1.1rem;
				height: 1.1rem;
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.8;
			}

			.tick {
				display: inline-grid;
				place-items: center;
				width: 1.1rem;
				height: 1.1rem;
				border-radius: 50%;
				background: var(--green-star);
				color: var(--on-accent);
				font-size: 0.75rem;
				font-weight: 700;
			}

			.stage {
				display: grid;
				place-items: center;
				min-height: 6.5rem;
				padding: 1rem;
			}

			.count {
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			.count:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}

			.arrow {
				height: 3rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.aside {
				display: grid;
				justify-items: start;
				gap: 0.4rem;
			}

			.note,
			.same {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				line-height: 1.2;
				color: var(--ink);
			}

			.note {
				font-size: var(--step-1);
				rotate: -1.5deg;
			}

			.said {
				position: relative;
				display: inline-block;

				html.dark & {
					--sweep-blend: overlay;
				}
			}

			.same {
				font-size: var(--step-0);
				color: oklch(55% 0.2 0);
				rotate: 1deg;

				html.dark & {
					color: var(--pink);
				}
			}

			.mug-spot {
				justify-self: end;
				zoom: 0.42;
				--gaze-x: -6px;
				--gaze-y: 2px;
			}

			@container (max-width: 34rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					gap: 0.8rem;
				}

				.arrow {
					display: none;
				}

				.aside {
					grid-template-columns: minmax(0, 1fr) auto;
					align-items: center;
				}

				.note,
				.same {
					grid-column: 1;
				}

				.mug-spot {
					grid-column: 2;
					grid-row: 1 / span 2;
				}
			}
		</style>
	</figure>
}
