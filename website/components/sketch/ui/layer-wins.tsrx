// A layered default and one plain rule, both live on the tip beside Save.
import { state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import SketchAsk from '../start/sketch-ask.tsrx';

export default function LayerWins() @{
	let mine = state(false);
	let flips = state(0);
	let sweepBeat = state('odd');
	let circleBeat = state('rest');
	let say = state('Your rule is off. The default puts the tip above Save.');

	<figure class="sketch">
		<SketchAsk text="Whose rule places the tip?" />

		<div class="board" data-mine={mine ? 'on' : 'off'}>
			<div class="cards">
				<IndexCard label="@layer markless" tilt="-1.2deg">
					<pre class="code"><span class="line"><span class="k">@layer</span>{' markless {'}</span><span class="line">{'  '}<span class="f">[overlay]</span>{' {'}</span><span class="line">{'    '}<span class="a">position-area</span>{': '}<span class="hit loser">block-start<MarkerSweep beat={sweepBeat} place="" /><svg class="strike" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="M2 12 C 30 9 60 13 98 8" /></svg></span>;</span><span class="line">{'  }'}</span><span class="line">{'}'}</span></pre>
				</IndexCard>
				<div class="mine-card">
					<IndexCard label="your rule" pin="pin" tilt="1.4deg">
						<pre class="code"><span class="line"><span class="f">.tip</span>{' {'}</span><span class="line">{'  '}<span class="a">position-area</span>{': '}<span class="hit">inline-end<MarkerCircle beat={circleBeat} /></span>;</span><span class="line">{'}'}</span></pre>
					</IndexCard>
				</div>
				<button
					type="button"
					class="switch"
					aria-pressed={mine ? 'true' : 'false'}
					onClick={() => {
						mine = !mine;
						flips++;
						sweepBeat = mine ? 'rest' : flips % 4 === 0 ? 'even' : 'odd';
						circleBeat = mine ? (flips % 4 === 1 ? 'odd' : 'even') : 'rest';
						say = mine ? 'Your rule is on. It beats the layer, so the tip moves right of Save.' : 'Your rule is off. The default puts the tip above Save.';
					}}
				><span class="knob" aria-hidden="true"></span>your rule</button>
			</div>

			<div class="arrow">
				<InkArrow width={90} height={60} x1={4} y1={46} x2={84} y2={22} bend={10} seed={53} shown={mine ? 'true' : 'false'} />
			</div>

			<div class="right">
				<div class="stage">
					<span class="save">Save</span>
					<span class="tip">Keeps a copy in your drafts</span>
					<span class="ghost" aria-hidden="true">default spot</span>
				</div>
				<p class="note" data-mine={mine ? 'on' : 'off'}><span class="when-on">yours wins, no !important</span><span class="when-off">the default: above</span></p>
				<p class="say" aria-live="polite">{say}</p>
				<span class="mug-spot">
					<MugArt
						variant="toc"
						mood={flips === 0 ? 'idle' : mine ? 'wide' : 'wiggle'}
						face="neutral"
						glaze="cream"
						pour="rosetta"
						coaster="off"
						companion="off"
						paused="false"
						interacted={flips > 0 ? 'true' : 'false'}
						reaction="rest"
					/>
				</span>
			</div>
		</div>

		<style>
			@layer markless {
				.tip {
					position-area: block-start;
				}
			}

			.board[data-mine='on'] .tip {
				position-area: inline-end;
			}

			.sketch {
				--sweep-delay: 60ms;
				--circle-delay: 0ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				display: grid;
				grid-template-columns: 17rem 4.5rem minmax(0, 1fr);
				align-items: center;
				padding: 0.6rem 0 0.8rem 0.4rem;
			}

			.cards {
				display: grid;
				gap: 1.3rem;
			}

			.mine-card {
				margin-left: 1.2rem;
			}

			pre {
				margin: 0;
				padding: 0;
				overflow: visible;
				background: none;
				border: 0;
				font-family: var(--font-mono);
				font-size: 0.78rem;
				line-height: inherit;
				color: oklch(28% 0.015 90);
			}

			.line {
				display: block;
				position: relative;
				white-space: pre;
				min-height: 1lh;
			}

			.k {
				color: #cf222e;
			}

			.f {
				color: #6639ba;
			}

			.a {
				color: #0550ae;
			}

			.hit {
				position: relative;
				display: inline-block;
			}

			.strike {
				position: absolute;
				left: -0.2em;
				top: 50%;
				width: calc(100% + 0.4em);
				height: 0.7em;
				translate: 0 -50%;
				overflow: visible;
				fill: none;
				stroke: oklch(55% 0.2 0);
				stroke-width: 2.6;
				stroke-linecap: round;
				stroke-dasharray: 110;
				stroke-dashoffset: 110;
				transition: stroke-dashoffset 360ms ease 120ms;
				pointer-events: none;
			}

			.board[data-mine='on'] .strike {
				stroke-dashoffset: 0;
			}

			.switch {
				justify-self: center;
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				padding: 0.25em 0.9em 0.25em 0.4em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--raised);
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				box-shadow: 2px 3px 0 var(--ink);
				cursor: pointer;
				rotate: -1.5deg;
			}

			.knob {
				position: relative;
				width: 2.2rem;
				height: 1.2rem;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
			}

			.knob::after {
				content: '';
				position: absolute;
				top: 0.1rem;
				left: 0.12rem;
				width: 0.8rem;
				height: 0.8rem;
				border-radius: 50%;
				background: var(--ink);
				transition: translate 180ms ease;
			}

			.switch[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.switch[aria-pressed='true'] .knob {
				background: var(--pink);
				border-color: var(--on-accent);
			}

			.switch[aria-pressed='true'] .knob::after {
				translate: 0.95rem 0;
				background: var(--on-accent);
			}

			.switch:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.arrow {
				height: 3.4rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.right {
				display: grid;
				gap: 0.4rem;
				justify-items: start;
			}

			.stage {
				position: relative;
				anchor-scope: --sketch-save;
				width: 100%;
				box-sizing: border-box;
				padding: 3.2rem 1rem 1.6rem;
				border: 2px dashed color-mix(in oklch, var(--ink) 30%, transparent);
				border-radius: 8px;
			}

			.save {
				display: inline-block;
				anchor-name: --sketch-save;
				padding: 0.4em 0.9em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-weight: 700;
			}

			.tip,
			.ghost {
				position: absolute;
				position-anchor: --sketch-save;
				margin: 0.4rem;
				padding: 0.3em 0.6em;
				border-radius: 4px;
				font-size: var(--step--1);
				line-height: 1.2;
				white-space: nowrap;
			}

			.tip {
				background: var(--slab);
				color: var(--slab-ink);
			}

			.ghost {
				position-area: block-start;
				border: 2px dashed color-mix(in oklch, var(--ink) 45%, transparent);
				color: color-mix(in oklch, var(--ink) 60%, transparent);
				font-family: 'Joy Elia', system-ui, sans-serif;
				visibility: hidden;
			}

			.board[data-mine='on'] .ghost {
				visibility: visible;
			}

			.note {
				margin: 0.3rem 0 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				line-height: 1.15;
				color: var(--ink);
				rotate: -1.5deg;
			}

			.note[data-mine='on'] .when-off,
			.note[data-mine='off'] .when-on {
				display: none;
			}

			.say {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.mug-spot {
				justify-self: end;
				margin-top: -2.4rem;
				zoom: 0.4;
				--gaze-x: -6px;
				--gaze-y: -4px;
			}

			@media (prefers-reduced-motion: reduce) {
				.strike,
				.knob::after {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					row-gap: 0.6rem;
				}

				.cards {
					max-width: 19rem;
				}

				.arrow {
					width: 3.4rem;
					height: 3rem;
					margin-left: 40%;
					rotate: 70deg;
				}

				.stage {
					padding-right: 0.5rem;
				}

				.tip,
				.ghost {
					white-space: normal;
					max-width: 9rem;
				}

				.mug-spot {
					margin-top: 0;
				}
			}
		</style>
	</figure>
}
