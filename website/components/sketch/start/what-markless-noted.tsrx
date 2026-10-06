// "What did Markless write down about this counter?" The counter file on a
// card, the notes Markless keeps about it, and the real counter running below.
import { state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import SketchAsk from './sketch-ask.tsrx';

export default function WhatMarklessNoted() @{
	let clicks = state(0);
	let pulse = state(0);
	let peeking = state(false);
	let say = state('or just click it');

	<figure class="sketch">
		<SketchAsk text="What did Markless write down about this counter?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="counter.tsrx" tilt="-1.2deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">Counter</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' '}<button type="button" class="word" aria-label="Peek: what did Markless note about count?" onMouseenter={() => { if (!peeking) pulse++; peeking = true; say = 'this text reads count'; }} onMouseleave={() => (peeking = false)} onFocus={() => { if (!peeking) pulse++; peeking = true; say = 'this text reads count'; }} onBlur={() => (peeking = false)} onClick={() => { if (!peeking) pulse++; peeking = true; say = 'this text reads count'; }}>count</button>{' = '}<span class="f">state</span>{'(0);'}</span><span class="line">{' '}</span><span class="line">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">count++<MarkerCircle beat={pulse === 0 ? 'rest' : pulse % 2 === 0 ? 'even' : 'odd'} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\tCount '}<span class="hit">{'{count}'}<MarkerSweep beat={pulse === 0 ? 'rest' : pulse % 2 === 0 ? 'even' : 'odd'} place="" /></span></span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
				<p class="hint" data-shown={pulse === 0 ? 'true' : 'false'} aria-hidden="true">↑ point at count</p>
			</div>

			<div class="notes-side">
				<IndexCard label="Markless wrote down" pin="pin" tilt="1.6deg">
					<ol class="notes" data-shown={pulse > 0 ? 'true' : 'false'}>
						<li><b>count</b> shows in <span class="hit">the button text<MarkerSweep beat={pulse === 0 ? 'rest' : pulse % 2 === 0 ? 'even' : 'odd'} place="" /></span></li>
						<li><span class="hit">a click<MarkerCircle beat={pulse === 0 ? 'rest' : pulse % 2 === 0 ? 'even' : 'odd'} /></span> changes <b>count</b></li>
					</ol>
					<p class="blank" data-shown={pulse === 0 ? 'true' : 'false'} aria-hidden="true">? ? ?</p>
				</IndexCard>
			</div>

			<div class="arrow">
				<InkArrow width={60} height={70} x1={18} y1={4} x2={30} y2={64} bend={-8} seed={13} shown={pulse > 0 ? 'true' : 'false'} />
			</div>

			<div class="page">
				<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
				<div class="row">
					<button
						type="button"
						class="count"
						onClick={() => {
							clicks++;
							pulse++;
							say = 'only this text changed';
						}}
					>
						Count <span class="hit num"><span>{clicks}</span><MarkerSweep beat={pulse === 0 ? 'rest' : pulse % 2 === 0 ? 'even' : 'odd'} place="" /></span>
					</button>
					<span class="mug-spot">
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
					</span>
				</div>
				<p class="note" aria-live="polite">{say}</p>
			</div>
		</div>

		<style>
			.sketch {
				--sweep-delay: 160ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 19.5rem minmax(0, 1fr);
				grid-template-areas:
					'code notes'
					'code arrow'
					'code page';
				grid-template-rows: auto auto 1fr;
				column-gap: 3rem;
				align-items: start;
				padding: 0.6rem 0 1rem 0.4rem;
			}

			.code-side {
				grid-area: code;
				position: relative;
			}

			.notes-side {
				grid-area: notes;
				max-width: 17rem;
			}

			pre {
				margin: 0;
				padding: 0;
				overflow: visible;
				background: none;
				border: 0;
				font-family: var(--font-mono);
				font-size: 0.8rem;
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

			.word {
				position: relative;
				z-index: 2;
				margin: 0;
				padding: 0 0.15em;
				border: 0;
				border-bottom: 2px dashed oklch(55% 0.2 0);
				border-radius: 2px;
				background: color-mix(in oklch, var(--pink) 22%, transparent);
				color: inherit;
				font: inherit;
				line-height: 1.2;
				cursor: help;
			}

			.word:hover,
			.word:focus-visible {
				background: color-mix(in oklch, var(--pink) 45%, transparent);
			}

			.word:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 3px;
			}

			.hint,
			.note,
			.notes,
			.blank {
				font-family: 'Joy Elia', system-ui, sans-serif;
			}

			.hint {
				margin: 0.7rem 0 0 4.2rem;
				font-size: var(--step-0);
				color: oklch(55% 0.2 0);
				rotate: -2deg;

				html.dark & {
					color: var(--pink);
				}
			}

			.hint[data-shown='false'] {
				display: none;
			}

			.notes {
				margin: 0;
				padding: 0.2rem 0 0 1.2rem;
				font-size: var(--step-0);
				line-height: 1.5rem;
				color: oklch(28% 0.015 90);
				transition: opacity 260ms ease;
			}

			.notes li {
				margin: 0;
			}

			.notes b {
				font-family: var(--font-mono);
				font-size: 0.85em;
				font-weight: 600;
			}

			.notes[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
			}

			.blank {
				position: absolute;
				left: 1.4rem;
				bottom: 1.4rem;
				margin: 0;
				font-size: var(--step-1);
				letter-spacing: 0.4em;
				color: oklch(55% 0.02 90);
			}

			.blank[data-shown='false'] {
				display: none;
			}

			.arrow {
				grid-area: arrow;
				width: 3.4rem;
				height: 4rem;
				margin: 0.2rem 0 0 1.4rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.page {
				grid-area: page;
				position: relative;
			}

			.strip {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0 0 0.4rem;
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

			.row {
				display: flex;
				align-items: center;
				gap: 1rem;
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

			.count:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 5px;
			}

			.mug-spot {
				display: block;
				zoom: 0.42;
				--gaze-x: -6px;
				--gaze-y: 2px;
			}

			.note {
				margin: 0.5rem 0 0;
				padding-left: 0.4rem;
				font-size: var(--step-0);
				line-height: 1.15;
				color: var(--ink);
				rotate: 1.5deg;
			}

			.note::before {
				content: '↑ ';
			}

			@media (prefers-reduced-motion: reduce) {
				.notes {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					grid-template-areas:
						'code'
						'notes'
						'arrow'
						'page';
					grid-template-rows: auto;
					row-gap: 0.8rem;
				}

				.notes-side {
					justify-self: end;
					margin-right: 0.4rem;
				}

				.hint {
					margin-left: 3.4rem;
				}

				.arrow {
					height: 2.8rem;
					margin: -0.4rem 0 0 3rem;
				}
			}
		</style>
	</figure>
}
