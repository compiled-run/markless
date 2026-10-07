// Computed page figure: a click changes an input, the recipe runs again, and no click writes total.
import { element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import Basket from './basket.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { afterUpdate, placeOverText } from './place.ts';

export default function ComputedSketch() @{
	let changed = state('');
	let beat = state('rest');
	let inputAt = state('');
	let totalAt = state('');
	let totalText = state('');
	let slot = element<HTMLDivElement>();

	<figure class="concept-sketch">
		<SketchAsk ask="Who updates the total?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="basket.tsrx" tilt="-1deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">computed</span>, <span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">Basket</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' '}<span class="hit first">mugs<MarkerSweep beat={changed === 'mugs' ? beat : 'rest'} place="" /></span>{' = '}<span class="f">state</span>{'(1);'}</span><span class="line">{'\t'}<span class="k">let</span>{' '}<span class="hit first">coasters<MarkerSweep beat={changed === 'coasters' ? beat : 'rest'} place="" /></span>{' = '}<span class="f">state</span>{'(0);'}</span><span class="line">{'\t'}<span class="k">const</span>{' total = '}<span class="f">computed</span>{'('}</span><span class="line recipe">{'\t\t() => '}<span class="hit">mugs<MarkerSweep beat={changed === 'mugs' ? beat : 'rest'} place="" /></span>{' * 12 + '}<span class="hit">coasters<MarkerSweep beat={changed === 'coasters' ? beat : 'rest'} place="" /></span>{' * 3,'}</span><span class="line">{'\t);'}<span class="note ran" aria-hidden="true" data-shown={changed === '' ? 'false' : 'true'}>← ran again</span></span><span class="line blank"><span class="note nobody" aria-hidden="true" data-shown={changed === '' ? 'false' : 'true'}>no click writes total</span></span><span class="line">{'\t'}<span class="t">{'<p>'}</span>{'Mugs: {mugs}'}<span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'<p>'}</span>{'Coasters: {coasters}'}<span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'<p>'}</span>{'Total: '}<span class="hit later">{'{total}'}<MarkerSweep beat={beat} place="" /></span><span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">mugs++<MarkerCircle beat={changed === 'mugs' ? beat : 'rest'} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\tOne more mug'}</span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">coasters++<MarkerCircle beat={changed === 'coasters' ? beat : 'rest'} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\tOne more coaster'}</span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={100} height={88} x1={4} y1={70} x2={94} y2={26} bend={12} seed={29} shown={changed === '' ? 'false' : 'true'} />
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={changed === '' ? 'idle' : beat === 'odd' ? 'thinking' : 'wiggle'}
					face={changed === '' ? 'neutral' : 'curious'}
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={changed === '' ? 'false' : 'true'}
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
							if (!button || !slot) return;
							const which = Array.from(slot.querySelectorAll('button')).indexOf(button);
							changed = which === 0 ? 'mugs' : 'coasters';
							beat = beat === 'odd' ? 'even' : 'odd';
							afterUpdate(() => {
								const lines = slot ? slot.querySelectorAll('p') : [];
								inputAt = placeOverText(slot, lines[which === 0 ? 0 : 1], /\d+\s*$/);
								totalAt = placeOverText(slot, lines[2], /\d+\s*$/);
								totalText = (/\d+/.exec(lines[2]?.textContent ?? '') ?? [''])[0];
							});
						}}
					>
						<Basket />
						<MarkerSweep beat={beat} place={inputAt} />
						<span class="later"><MarkerSweep beat={beat} place={totalAt} /></span>
					</div>
				</YourPage>
				<p class="note changes" aria-live="polite"><span class="say">{changed === '' ? '' : 'The click changed ' + changed + '. The recipe ran again, and total is now ' + totalText + '. '}</span>{changed === '' ? 'add a mug, and follow the ink' : 'the total moved too'}</p>
				<ol class="chain" aria-hidden="true" data-shown={changed === '' ? 'false' : 'true'}>
					<li><code>{changed + '++'}</code> changed <code>{changed}</code></li>
					<li>the recipe read it and ran again</li>
					<li><code>total</code> is now <b>{totalText}</b></li>
				</ol>
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
				column-gap: 3rem;
				row-gap: var(--space-s);
				align-items: start;
				padding: 0.6rem 0 1.2rem 0.4rem;
			}

			.code-side {
				grid-area: code;
				position: relative;
			}

			pre {
				position: relative;
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

			.hit {
				position: relative;
				display: inline-block;
				text-indent: 0;
			}

			.first {
				--sweep-delay: 120ms;
			}

			.later,
			.hit.later {
				--sweep-delay: 900ms;
			}

			.later {
				display: contents;
			}

			.hit.later {
				display: inline-block;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				text-indent: 0;
				transition: opacity 200ms ease 120ms, translate 260ms ease 120ms;
			}

			.note[data-shown='false'],
			.chain[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
				translate: 0 0.3rem;
			}

			.ran,
			.nobody {
				position: absolute;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
			}

			.ran {
				left: 2.4rem;
				top: 0.05rem;
				rotate: -3deg;
			}

			.nobody {
				left: 4rem;
				top: 0.05rem;
				rotate: -2deg;
			}

			.arrow {
				position: absolute;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.across {
				left: 23.4rem;
				top: 13.5rem;
				width: 3.2rem;
				height: 3rem;
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

			.say {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.chain {
				margin: var(--space-xs) 0 0;
				padding: 0.3rem 0.6rem;
				list-style-position: inside;
				border-left: 2px dashed var(--muted-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.3;
				color: var(--muted-ink);
				rotate: -0.6deg;
				transition: opacity 240ms ease 300ms, translate 300ms ease 300ms;
			}

			.chain code {
				font-family: var(--font-mono);
				font-size: 0.8em;
				color: var(--ink);
				background: none;
			}

			.chain b {
				color: oklch(55% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.note,
				.chain {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					grid-template-areas:
						'code'
						'mug'
						'live';
					grid-template-rows: auto auto auto;
				}

				pre {
					font-size: 0.72rem;
				}

				.line {
					white-space: pre-wrap;
					padding-left: 2ch;
					text-indent: -2ch;
				}

				.across {
					display: none;
				}

				.mug-spot {
					margin: -0.4rem 0.4rem -1.6rem 0;
				}
			}
		</style>
	</figure>
}
