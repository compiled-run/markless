// State page figure: the click runs cups++ and changes one text spot; the body never runs again.
import { element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import Pour from './pour.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { afterUpdate, placeOverText } from './place.ts';

export default function StateSketch() @{
	let pours = state(0);
	let beat = state('rest');
	let sweepAt = state('');
	let drawnText = state('');
	let slot = element<HTMLDivElement>();

	<figure class="concept-sketch">
		<SketchAsk ask="What changes when I click?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="pour.tsrx" tilt="-1.2deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">Pour</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' cups = '}<span class="f">state</span>{'(0);'}</span><span class="line">{'\t'}<span class="k">const</span>{' drawn = Math.'}<span class="f">ceil</span>{'(Math.'}<span class="f">random</span>{'() * 99);'}</span><span class="line blank"><span class="note once" aria-hidden="true" data-shown={pours > 0 ? 'true' : 'false'}>↑ ran once, at setup</span></span><span class="line">{'\t'}<span class="t">{'<p>'}</span>{'Cups today: '}<span class="hit">{'{cups}'}<MarkerSweep beat={beat} place="" /></span><span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'<p>'}</span>{'Drawn once: {drawn}'}<span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">cups++<MarkerCircle beat={beat} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\tPour one'}</span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={100} height={88} x1={4} y1={74} x2={94} y2={22} bend={12} seed={23} shown={pours > 0 ? 'true' : 'false'} />
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={pours === 0 ? 'idle' : pours % 2 === 0 ? 'wiggle' : 'brew'}
					face="neutral"
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={pours > 0 ? 'true' : 'false'}
					reaction="rest"
				/>
			</div>

			<div class="live">
				<YourPage>
					<div
						class="slot"
						el={slot}
						onClick={(event) => {
							const target = event.target;
							const button = target instanceof Element ? target.closest('button') : null;
							if (!button) return;
							pours++;
							beat = beat === 'odd' ? 'even' : 'odd';
							afterUpdate(() => {
								const lines = slot ? slot.querySelectorAll('p') : [];
								sweepAt = placeOverText(slot, lines[0], /\d+\s*$/);
								drawnText = lines[1] ? (/\d+/.exec(lines[1].textContent ?? '')?.[0] ?? '') : '';
							});
						}}
					>
						<Pour />
						<MarkerSweep beat={beat} place={sweepAt} />
					</div>
				</YourPage>
				<p class="note changes" aria-live="polite"><span class="say">{pours === 0 ? '' : 'The click ran cups++. '}</span>{pours === 0 ? 'pour one, and watch both numbers' : 'only the cups number changed'}</p>
				<p class="note still" aria-hidden="true" data-shown={pours > 0 && drawnText !== '' ? 'true' : 'false'}>{'still ' + drawnText + ': not drawn again'}</p>
				<dl class="tally" aria-label="What ran">
					<div><dt>Pour()</dt><dd>ran once, to set up</dd></div>
					<div class="hot"><dt>cups++</dt><dd>{pours === 1 ? 'ran 1 time' : 'ran ' + pours + ' times'}</dd></div>
				</dl>
			</div>
		</div>

		<style>
			.concept-sketch {
				--sweep-delay: 320ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 23rem minmax(0, 1fr);
				grid-template-areas:
					'code mug'
					'code live';
				grid-template-rows: auto 1fr;
				column-gap: 3.4rem;
				row-gap: var(--space-s);
				align-items: start;
				padding: 0.6rem 0 1.2rem 0.4rem;
			}

			.code-side {
				grid-area: code;
				position: relative;
			}

			pre {
				margin: 0;
				padding: 0;
				overflow: visible;
				background: none;
				border: 0;
				font-family: var(--font-mono);
				font-size: 0.75rem;
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

			.dim {
				color: oklch(45% 0.015 90);
			}

			.hit {
				position: relative;
				display: inline-block;
				text-indent: 0;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				transition: opacity 200ms ease 120ms, translate 260ms ease 120ms;
			}

			.note[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
				translate: 0 0.3rem;
			}

			.once {
				position: absolute;
				left: 7.4rem;
				top: 0.05rem;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
				rotate: -2deg;
			}

			.arrow {
				position: absolute;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.across {
				left: 23.3rem;
				top: 11rem;
				width: 3.6rem;
				height: 3.2rem;
			}

			.mug-spot {
				grid-area: mug;
				justify-self: end;
				position: relative;
				z-index: 1;
				margin: -0.6rem 1rem -1.8rem 0;
				zoom: 0.6;
				--gaze-x: -5px;
				--gaze-y: 5px;
			}

			.live {
				grid-area: live;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			.slot {
				--sweep-blend: multiply;
				position: relative;

				html.dark & {
					--sweep-blend: overlay;
				}
			}

			.slot:has(:focus-visible) {
				outline: 2.5px dashed var(--purple);
				outline-offset: 6px;
			}

			.changes {
				color: var(--ink);
				rotate: 1.2deg;
				padding-left: 0.4rem;
			}

			.changes::before {
				content: '↑ ';
			}

			.still {
				color: var(--muted-ink);
				rotate: -1deg;
				padding-left: 0.4rem;
			}

			.say {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.tally {
				margin: var(--space-xs) 0 0;
				padding: 0.3rem 0.6rem;
				display: grid;
				gap: 0.1rem;
				border-left: 2px dashed var(--muted-ink);
				rotate: -0.6deg;
			}

			.tally div {
				display: flex;
				flex-wrap: wrap;
				gap: 0 0.5rem;
				align-items: baseline;
			}

			.tally dt {
				font-family: var(--font-mono);
				font-size: 0.8rem;
			}

			.tally dd {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				color: var(--muted-ink);
			}

			.tally .hot dd {
				color: oklch(55% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.note {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr) auto;
					grid-template-areas:
						'code code'
						'mug mug'
						'live live';
					grid-template-rows: auto auto auto;
					column-gap: var(--space-s);
				}

				.across {
					display: none;
				}

				pre {
					font-size: 0.72rem;
				}

				.line {
					white-space: pre-wrap;
					padding-left: 2ch;
					text-indent: -2ch;
				}

				.mug-spot {
					margin: -0.4rem 0.4rem -1.6rem 0;
				}
			}
		</style>
	</figure>
}
