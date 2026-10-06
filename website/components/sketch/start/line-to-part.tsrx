// "Which line made which part of the button?" Each line of the counter file is
// a button; pointing at one marks the part of the running counter it made.
import { state } from '@markless/core';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import SketchAsk from './sketch-ask.tsrx';

export default function LineToPart() @{
	let part = state('');
	let flip = state('odd');
	let clicks = state(0);
	let say = state('point at a line');

	<figure class="sketch">
		<SketchAsk text="Which line made which part of the button?" />

		<div class="board" data-part={part}>
			<div class="code-side">
				<IndexCard label="counter.tsrx" tilt="-1.2deg">
					<div class="code">
						<button type="button" class="line" data-part="import" onMouseenter={() => { if (part !== 'import') { part = 'import'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'no part: just an import'; } }} onFocus={() => { if (part !== 'import') { part = 'import'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'no part: just an import'; } }}><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</button>
						<span class="gap" aria-hidden="true"></span>
						<button type="button" class="line" data-part="body" onMouseenter={() => { if (part !== 'body') { part = 'body'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'all of it, once'; } }} onFocus={() => { if (part !== 'body') { part = 'body'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'all of it, once'; } }}><span class="k">export default function</span>{' '}<span class="f">Counter</span>{'() '}<span class="k">{'@{'}</span></button>
						<button type="button" class="line" data-part="state" onMouseenter={() => { if (part !== 'state') { part = 'state'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'the number, from 0'; } }} onFocus={() => { if (part !== 'state') { part = 'state'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'the number, from 0'; } }}>{'\t'}<span class="k">let</span>{' count = '}<span class="f">state</span>{'(0);'}</button>
						<span class="gap" aria-hidden="true"></span>
						<button type="button" class="line" data-part="click" onMouseenter={() => { if (part !== 'click') { part = 'click'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'the button and its click'; } }} onFocus={() => { if (part !== 'click') { part = 'click'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'the button and its click'; } }}>{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => count++}'}<span class="t">{'>'}</span></button>
						<button type="button" class="line" data-part="text" onMouseenter={() => { if (part !== 'text') { part = 'text'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'the words inside'; } }} onFocus={() => { if (part !== 'text') { part = 'text'; flip = flip === 'odd' ? 'even' : 'odd'; say = 'the words inside'; } }}>{'\t\tCount {count}'}</button>
						<span class="line plain" aria-hidden="true">{'\t'}<span class="t">{'</button>'}</span></span>
						<span class="line plain" aria-hidden="true"><span class="k">{'}'}</span></span>
					</div>
				</IndexCard>
			</div>

			<div class="arrow">
				<InkArrow width={90} height={60} x1={4} y1={14} x2={84} y2={40} bend={-12} seed={29} shown={part === '' || part === 'import' ? 'false' : 'true'} />
			</div>

			<div class="page">
				<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
				<div class="stage">
					<span class="hit whole">
						<span class="outline" aria-hidden="true"></span>
						<button type="button" class="count" onClick={() => clicks++}><span class="hit words">Count <span class="hit num">{clicks}<MarkerSweep beat={part === 'state' ? flip : 'rest'} place="" /></span><MarkerSweep beat={part === 'text' ? flip : 'rest'} tone="green" place="" /></span></button>
						<MarkerCircle beat={part === 'click' ? flip : 'rest'} />
					</span>
				</div>
				<p class="note" aria-live="polite">{say}</p>
			</div>
		</div>

		<style>
			.sketch {
				--sweep-delay: 80ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 19.5rem 5rem minmax(0, 1fr);
				align-items: center;
				padding: 0.6rem 0 0.8rem 0.4rem;
			}

			.code {
				display: grid;
				font-family: var(--font-mono);
				font-size: 0.8rem;
				tab-size: 2;
				color: oklch(28% 0.015 90);
			}

			.line {
				display: block;
				width: 100%;
				min-height: 1lh;
				margin: 0;
				padding: 0 0.3rem;
				margin-inline: -0.3rem;
				border: 0;
				border-radius: 3px;
				background: transparent;
				color: inherit;
				font: inherit;
				line-height: inherit;
				text-align: start;
				white-space: pre;
				cursor: help;
			}

			button.line:hover,
			button.line:focus-visible {
				background: color-mix(in oklch, var(--pink) 28%, transparent);
			}

			button.line:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 1px;
			}

			.plain {
				cursor: default;
			}

			.gap {
				display: block;
				min-height: 1lh;
			}

			.board[data-part='import'] [data-part='import'],
			.board[data-part='body'] [data-part='body'],
			.board[data-part='state'] [data-part='state'],
			.board[data-part='click'] [data-part='click'],
			.board[data-part='text'] [data-part='text'] {
				background: color-mix(in oklch, var(--pink) 28%, transparent);
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

			.arrow {
				height: 3.4rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.page {
				display: grid;
				gap: 0.6rem;
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

			.stage {
				display: grid;
				place-items: center start;
				min-height: 5rem;
				padding-left: 1.2rem;
			}

			.outline {
				position: absolute;
				inset: -0.9rem -1.1rem;
				border: 2.5px dashed var(--purple);
				border-radius: 10px 14px 9px 12px;
				opacity: 0;
				scale: 0.92;
				transition: opacity 220ms ease, scale 260ms ease;
				pointer-events: none;
			}

			.board[data-part='body'] .outline {
				opacity: 1;
				scale: 1;
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

			.note {
				margin: 0;
				padding-left: 0.4rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.15;
				color: var(--ink);
				rotate: 1.5deg;
			}

			.note::before {
				content: '↑ ';
			}

			@media (prefers-reduced-motion: reduce) {
				.outline {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					row-gap: 0.2rem;
				}

				.code-side {
					max-width: 21rem;
				}

				.arrow {
					width: 3.4rem;
					height: 3rem;
					margin-left: 40%;
					rotate: 70deg;
				}
			}
		</style>
	</figure>
}
