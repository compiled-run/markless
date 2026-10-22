// "What changes when you click?" as a zine page: the counter file on an index
// card, the real counter running beside it, marker and ink notes on each click.
import { element, state } from '@markless/core';
import MugArt from '../mascot/mug-art.tsrx';
import Sticker from '../sticker.tsrx';
import Counter from './counter.tsrx';
import IndexCard from './index-card.tsrx';
import InkArrow from './ink-arrow.tsrx';
import MarkerCircle from './marker-circle.tsrx';
import MarkerSweep from './marker-sweep.tsrx';

const pct = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10 + '%';

// The counter is its own component, so its number is found in the DOM rather
// than wrapped; `digits` corrects for a click whose text has not landed yet.
const numberBox = (frame: Element | undefined, button: Element, digits: number): string => {
	if (!frame) return '';
	const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();
	while (node && !/\d/.test(node.textContent ?? '')) node = walker.nextNode();
	const match = node ? /\d+/.exec(node.textContent ?? '') : null;
	if (!node || !match) return '';
	const range = document.createRange();
	range.setStart(node, match.index);
	range.setEnd(node, match.index + match[0].length);
	const box = range.getBoundingClientRect();
	const outer = frame.getBoundingClientRect();
	const pad = box.height * 0.3;
	const width = (box.width * digits) / match[0].length + pad * 2;
	return (
		'inset:auto;left:' + pct(box.left - outer.left - pad, outer.width) +
		';top:' + pct(box.top - outer.top + box.height * 0.08, outer.height) +
		';width:' + pct(width, outer.width) +
		';height:' + pct(box.height * 0.9, outer.height)
	);
};

export default function CounterSketch() @{
	let clicks = state(0);
	let sweepAt = state('');
	let slot = element<HTMLDivElement>();

	<figure class="sketch">
		<figcaption>
			<span class="ask">What changes when you click?</span>
			<svg class="underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
				<path d="M3 9.5 C 60 5.2 120 10.8 180 7.4 C 225 5 262 8.6 297 6.2" />
				<path class="again" d="M14 11.8 C 80 8.6 150 12.4 230 9.6" />
			</svg>
		</figcaption>

		<div class="board">
			<div class="code-side">
				<span class="star"><Sticker name="sparkle" size="2.6rem" /></span>
				<IndexCard label="counter.tsrx" tilt="-1.4deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">Counter</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' count = '}<span class="f">state</span>{'(0);'}</span><span class="line blank"><span class="note runs" aria-hidden="true" data-shown={clicks > 0 ? 'true' : 'false'}>this runs on click</span></span><span class="line">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">count++<MarkerCircle beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\tClicked '}<span class="hit">{'{count}'}<MarkerSweep beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} place="" /></span>{' times'}</span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={100} height={88} x1={3} y1={78} x2={96} y2={15} bend={12} seed={11} shown={clicks > 0 ? 'true' : 'false'} />
			</div>
			<div class="arrow down">
				<InkArrow width={60} height={77} x1={30} y1={4} x2={34} y2={72} bend={-9} seed={5} shown={clicks > 0 ? 'true' : 'false'} />
			</div>

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
				/>
			</div>

			<div class="page playground">
				<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
				<div
					class="slot"
					el={slot}
					onClick={(event) => {
						const target = event.target;
						const button = target instanceof Element ? target.closest('button') : null;
						if (!button) return;
						clicks++;
						sweepAt = numberBox(slot, button, String(clicks).length);
					}}
				>
					<Counter />
					<MarkerSweep beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} place={sweepAt} />
				</div>
				<p class="note changes" aria-live="polite"><span class="say">{clicks === 0 ? '' : 'The click ran count++. '}</span>{clicks === 0 ? 'go on, click it' : 'only this text changes'}</p>
			</div>
		</div>

		<style>
			.sketch {
				--sweep-delay: 320ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
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
				color: var(--ink);
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

			.star {
				position: absolute;
				z-index: 2;
				right: -0.9rem;
				top: -0.2rem;
				rotate: 14deg;
			}

			.underline .again {
				stroke-width: 2;
				opacity: 0.6;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 20rem minmax(0, 1fr);
				grid-template-areas:
					'code mug'
					'code page';
				grid-template-rows: auto 1fr;
				column-gap: 5rem;
				align-items: start;
				padding: 0 0 1.2rem 0.4rem;
			}

			.code-side {
				grid-area: code;
				position: relative;
				padding-top: 0.6rem;
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

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				white-space: nowrap;
			}

			.runs {
				position: absolute;
				right: 0.2rem;
				top: 0.05rem;
				color: oklch(55% 0.2 0);
				rotate: -3deg;
				transition: opacity 200ms ease 120ms, translate 260ms ease 120ms;
			}

			.runs[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
				translate: 0 0.3rem;
			}

			.arrow {
				position: absolute;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.across {
				left: 20.9rem;
				top: 9.4rem;
				width: 4.1rem;
				height: 3.6rem;
			}

			.down {
				display: none;
			}

			.mug-spot {
				grid-area: mug;
				justify-self: end;
				position: relative;
				z-index: 1;
				margin: 0 1rem -1.6rem 0;
				zoom: 0.66;
				--gaze-x: -5px;
				--gaze-y: 5px;
			}

			.page {
				grid-area: page;
				position: relative;
				margin: 0;
				gap: 0.5rem;
				align-items: flex-start;
			}

			.strip {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin: -0.35rem 0 0;
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

			.slot {
				--sweep-blend: overlay;
				position: relative;
				display: inline-block;
				border-radius: 4px;
			}

			.slot:has(:focus-visible) {
				outline: 2.5px dashed var(--purple);
				outline-offset: 6px;
			}

			.changes {
				color: var(--ink);
				rotate: 1.5deg;
				padding-left: 0.4rem;
				white-space: normal;
			}

			.changes::before {
				content: '↑ ';
			}

			.say {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			@media (prefers-reduced-motion: reduce) {
				.runs {
					transition: none;
				}
			}

			@container (max-width: 38rem) {
				.board {
					grid-template-columns: minmax(0, 1fr) auto;
					grid-template-areas:
						'code code'
						'arrow mug'
						'page page';
					grid-template-rows: auto auto auto;
					column-gap: 0;
				}

				.ask {
					font-size: var(--step-1);
				}

				.star {
					right: -0.3rem;
				}

				.across {
					display: none;
				}

				.down {
					display: block;
					position: static;
					grid-area: arrow;
					justify-self: start;
					width: 3.6rem;
					height: 4.6rem;
					margin: 0.4rem 0 0 4.6rem;
				}

				.mug-spot {
					margin: 0 1.2rem -1.6rem 0;
				}
			}
		</style>
	</figure>
}
