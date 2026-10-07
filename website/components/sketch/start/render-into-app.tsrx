// "What does render() do to the empty #app?" The page starts with an empty div;
// Run puts the counter inside it, and clicks change only the number.
import { state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import SketchAsk from './sketch-ask.tsrx';

export default function RenderIntoApp() @{
	let ran = state<boolean>(false);
	let runs = state(0);
	let clicks = state(0);
	let say = state('empty, for now');

	<figure class="sketch">
		<SketchAsk text="What does render() do to the empty #app?" />

		<div class="board">
			<div class="cards">
				<IndexCard label="index.html" tilt="-1.3deg">
					<pre class="code"><span class="line"><span class="t">{'<body>'}</span></span><span class="line">{'  '}<span class="t">{'<div'}</span>{' '}<span class="a">id</span>=<span class="s">"app"</span><span class="t">{'></div>'}</span></span><span class="line">{'  '}<span class="t">{'<script'}</span>{' '}<span class="a">src</span>=<span class="s">"/src/main.ts"</span><span class="t">{'>'}</span>…</span><span class="line"><span class="t">{'</body>'}</span></span></pre>
				</IndexCard>
				<IndexCard label="src/main.ts" pin="pin" tilt="1deg">
					<pre class="code"><span class="line"><span class="k">const</span>{' target = document.'}<span class="f">querySelector</span>{'('}<span class="s">'#app'</span>{');'}</span><span class="line"><span class="k">await</span>{' '}<span class="hit"><span class="f">render</span>{'(App, { target })'}<MarkerCircle beat={runs === 0 ? 'rest' : runs % 2 === 0 ? 'even' : 'odd'} /></span>;</span></pre>
				</IndexCard>
				<button
					type="button"
					class="run"
					onClick={() => {
						if (ran) {
							ran = false;
							clicks = 0;
							say = 'empty, for now';
						} else {
							ran = true;
							runs++;
							say = 'App ran once, in the browser';
						}
					}}
				>{ran ? '↺ Start over' : '▶ Run main.ts'}</button>
			</div>

			<div class="arrow across">
				<InkArrow width={90} height={60} x1={4} y1={40} x2={86} y2={18} bend={10} seed={17} shown={ran ? 'true' : 'false'} />
			</div>

			<div class="page">
				<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
				<div class="sheet">
					<p class="tag" aria-hidden="true">{'<div id="app">'}</p>
					<div class="app" data-ran={ran ? 'true' : 'false'}>
						<span class="mounted" hidden={ran !== true}><button type="button" class="count" onClick={() => { clicks++; say = 'only the number changed'; }}>Count <span class="hit">{clicks}<MarkerSweep beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} place="" /></span></button></span>
					</div>
					<p class="tag" aria-hidden="true">{'</div>'}</p>
				</div>
				<div class="said">
					<p class="note" aria-live="polite">{say}</p>
					<span class="mug-spot">
						<MugArt
							variant="toc"
							mood={runs === 0 ? 'idle' : clicks % 2 === 0 ? 'wide' : 'wiggle'}
							face="neutral"
							glaze="cream"
							pour="rosetta"
							coaster="off"
							companion="off"
							paused="false"
							interacted={ran ? 'true' : 'false'}
							reaction="rest"
						/>
					</span>
				</div>
			</div>
		</div>

		<style>
			.sketch {
				--sweep-delay: 120ms;
				--circle-delay: 0ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 19rem 4.5rem minmax(0, 1fr);
				align-items: center;
				padding: 0.6rem 0 0.8rem 0.4rem;
			}

			.cards {
				display: grid;
				gap: 1.4rem;
			}

			pre {
				margin: 0;
				padding: 0;
				overflow: visible;
				background: none;
				border: 0;
				font-family: var(--font-mono);
				font-size: 0.74rem;
				line-height: inherit;
				tab-size: 2;
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

			.s {
				color: #0a3069;
			}

			.t {
				color: #116329;
			}

			.a {
				color: #0550ae;
			}

			.hit {
				position: relative;
				display: inline-block;
			}

			.run {
				justify-self: center;
				padding: 0.25em 0.9em;
				border: 2px solid var(--ink);
				border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
				background: var(--yellow);
				color: var(--on-accent);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				box-shadow: 2px 3px 0 var(--ink);
				cursor: pointer;
				rotate: -1.5deg;
			}

			.run:active {
				translate: 2px 3px;
				box-shadow: none;
			}

			.run:focus-visible,
			.count:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.arrow {
				height: 3.2rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.page {
				display: grid;
				gap: 0.5rem;
			}

			.strip {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--muted-ink, var(--ink));
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

			.sheet {
				padding: 0.7rem 0.9rem;
				border: 2px solid var(--ink);
				border-radius: 5px 8px 6px 4px;
				background: var(--raised);
				rotate: 0.6deg;
			}

			.tag {
				margin: 0;
				font-family: var(--font-mono);
				font-size: 0.75rem;
				opacity: 0.75;
			}

			.app {
				display: grid;
				place-items: center;
				min-height: 4.2rem;
				margin: 0.3rem 0;
				border: 2px dashed color-mix(in oklch, var(--ink) 45%, transparent);
				border-radius: 4px;
				transition: background-color 300ms ease;
			}

			.app[data-ran='true'] {
				background: color-mix(in oklch, var(--yellow) 30%, transparent);
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

			.said {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.5rem;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.15;
				color: var(--ink);
				rotate: 1.5deg;
			}

			.note::before {
				content: '↑ ';
			}

			.mug-spot {
				zoom: 0.4;
				--gaze-x: -6px;
				--gaze-y: -3px;
			}

			@media (prefers-reduced-motion: reduce) {
				.app {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					row-gap: 0.4rem;
				}

				.cards {
					max-width: 21rem;
				}

				.arrow {
					width: 3.4rem;
					height: 3.4rem;
					margin-left: 40%;
					rotate: 80deg;
				}
			}
		</style>
	</figure>
}
