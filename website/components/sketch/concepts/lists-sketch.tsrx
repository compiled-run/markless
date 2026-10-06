// Lists page figure: each row element is numbered on sight, so a reorder shows the same elements moving.
import { computed, element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import Groceries from './groceries.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { elementId } from './element-ids.ts';
import { afterUpdate, placeOver } from './place.ts';

export default function ListsSketch() @{
	let last = state('');
	let beat = state('rest');
	let reverses = state(0);
	let ids = state('');
	let made = state(0);
	let dropped = state(0);
	let order = state('');
	let tickedRow = state('');
	let chip0 = state('');
	let chip1 = state('');
	let chip2 = state('');
	let tag0 = state('');
	let tag1 = state('');
	let tag2 = state('');
	let tickAt = state('');
	let slot = element<HTMLDivElement>();
	const summary = computed(() => {
		if (last === '') return 'tick Pears, then press Reverse';
		if (last === 'tick') return tickedRow === '' ? 'no ticks right now' : 'the tick is on row ' + tickedRow;
		return 'same rows, new order: ' + made + ' made, ' + dropped + ' thrown away';
	});

	<figure class="concept-sketch">
		<SketchAsk ask="Which row did the tick go to?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="groceries.tsrx" tilt="-0.8deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">Groceries</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' items = '}<span class="f">state</span>{'(['}</span><span class="line">{'\t\t{ id: '}<span class="s">'pears'</span>{', name: '}<span class="s">'Pears'</span>{', done: '}<span class="k">false</span>{' },'}</span><span class="line">{'\t\t{ id: '}<span class="s">'coffee'</span>{', name: '}<span class="s">'Coffee'</span>{', done: '}<span class="k">false</span>{' },'}</span><span class="line">{'\t\t{ id: '}<span class="s">'milk'</span>{', name: '}<span class="s">'Milk'</span>{', done: '}<span class="k">false</span>{' },'}</span><span class="line">{'\t]);'}</span><span class="line">{' '}</span><span class="line">{'\t'}<span class="t">{'<div>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<ul>'}</span></span><span class="line">{'\t\t\t'}<span class="k">{'@for'}</span>{' ('}<span class="k">const</span>{' item '}<span class="k">of</span>{' items; '}<span class="hit"><span class="k">key</span>{' item.id'}<MarkerSweep beat={last === 'reverse' ? beat : 'rest'} place="" /></span>{') {'}<span class="note keyed" aria-hidden="true" data-shown={reverses > 0 ? 'true' : 'false'}>↓ finds each row</span></span><span class="line">{'\t\t\t\t'}<span class="t">{'<li>'}</span></span><span class="line">{'\t\t\t\t\t'}<span class="t">{'<label>'}</span></span><span class="line">{'\t\t\t\t\t\t'}<span class="t">{'<input'}</span></span><span class="line">{'\t\t\t\t\t\t\t'}<span class="a">type</span>{'='}<span class="s">"checkbox"</span></span><span class="line">{'\t\t\t\t\t\t\t'}<span class="a">checked</span>{'={item.done}'}</span><span class="line">{'\t\t\t\t\t\t\t'}<span class="a">onChange</span>{'={() => '}<span class="hit">(item.done = !item.done)<MarkerCircle beat={last === 'tick' ? beat : 'rest'} /></span>{'}'}</span><span class="line">{'\t\t\t\t\t\t'}<span class="t">{'/>'}</span></span><span class="line">{'\t\t\t\t\t\t{item.name}'}</span><span class="line">{'\t\t\t\t\t'}<span class="t">{'</label>'}</span></span><span class="line">{'\t\t\t\t'}<span class="t">{'</li>'}</span></span><span class="line">{'\t\t\t}'}</span><span class="line">{'\t\t'}<span class="t">{'</ul>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">(items = [...items].reverse())<MarkerCircle beat={last === 'reverse' ? beat : 'rest'} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\t\tReverse'}</span><span class="line">{'\t\t'}<span class="t">{'</button>'}</span></span><span class="line">{'\t'}<span class="t">{'</div>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={60} height={100} x1={54} y1={6} x2={6} y2={92} bend={-14} seed={61} shown={last === '' ? 'false' : 'true'} />
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={last === '' ? 'idle' : last === 'tick' ? 'wink' : beat === 'odd' ? 'wiggle' : 'wide'}
					face={last === 'reverse' ? 'excited' : 'neutral'}
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={last === '' ? 'false' : 'true'}
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
							if (!(target instanceof Element)) return;
							const tick = target instanceof HTMLInputElement;
							if (!tick && !target.closest('button')) return;
							last = tick ? 'tick' : 'reverse';
							if (!tick) reverses++;
							beat = beat === 'odd' ? 'even' : 'odd';
							afterUpdate(() => {
								if (!slot) return;
								const rows = Array.from(slot.querySelectorAll('li'));
								const before = ids === '' ? [] : ids.split(',');
								const seen = rows.map((row) => elementId(row));
								const now = seen.map((entry) => String(entry.id));
								made = ids === '' ? 0 : seen.filter((entry) => !entry.seen).length;
								dropped = before.filter((id) => !now.includes(id)).length;
								ids = now.join(',');
								const names = rows.map((row) => (row.textContent ?? '').trim());
								const ticks = rows.map((row) => row.querySelector('input')?.checked === true);
								order = names.map((name, i) => '#' + now[i] + ' ' + name + (ticks[i] ? ' ✓' : '')).join('  ·  ');
								const firstTicked = ticks.indexOf(true);
								tickedRow = firstTicked === -1 ? '' : '#' + now[firstTicked] + ' (' + names[firstTicked] + ')';
								tickAt = firstTicked === -1 ? '' : placeOver(slot, rows[firstTicked].querySelector('label'), 2);
								chip0 = placeOver(slot, rows[0]);
								chip1 = placeOver(slot, rows[1]);
								chip2 = placeOver(slot, rows[2]);
								tag0 = now[0] ? 'row #' + now[0] : '';
								tag1 = now[1] ? 'row #' + now[1] : '';
								tag2 = now[2] ? 'row #' + now[2] : '';
							});
						}}
					>
						<Groceries />
						<MarkerSweep beat={tickAt === '' ? 'rest' : beat} place={tickAt} />
						<span class="chip" aria-hidden="true" data-shown={tag0 === '' ? 'false' : 'true'} style={chip0}><b>{tag0}</b></span>
						<span class="chip" aria-hidden="true" data-shown={tag1 === '' ? 'false' : 'true'} style={chip1}><b>{tag1}</b></span>
						<span class="chip" aria-hidden="true" data-shown={tag2 === '' ? 'false' : 'true'} style={chip2}><b>{tag2}</b></span>
					</div>
				</YourPage>
				<p class="note changes" aria-live="polite">{summary}</p>
				<p class="order" aria-hidden="true" data-shown={order === '' ? 'false' : 'true'}>{order}</p>
			</div>
		</div>

		<style>
			.concept-sketch {
				--sweep-delay: 200ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 25rem minmax(0, 1fr);
				grid-template-areas:
					'code mug'
					'code live';
				grid-template-rows: auto 1fr;
				column-gap: 2.6rem;
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
				font-size: 0.72rem;
				line-height: inherit;
				tab-size: 2;
				color: oklch(28% 0.015 90);
			}

			.line {
				display: block;
				position: relative;
				white-space: pre-wrap;
				padding-left: 2ch;
				text-indent: -2ch;
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

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				text-indent: 0;
				transition: opacity 200ms ease 120ms, translate 260ms ease 120ms;
			}

			.note[data-shown='false'],
			.order[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
				translate: 0 0.3rem;
			}

			.keyed {
				position: absolute;
				left: 8.6rem;
				top: -1.45rem;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
				rotate: -3deg;
			}

			.arrow {
				position: absolute;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.across {
				left: 23.2rem;
				top: 9.4rem;
				width: 4.6rem;
				height: 7.6rem;
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

			.chip {
				position: absolute;
				pointer-events: none;
				transition: top 360ms cubic-bezier(0.3, 0.7, 0.4, 1), opacity 200ms ease;
			}

			.chip[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
			}

			.chip b {
				position: absolute;
				right: 0;
				top: 50%;
				translate: 0 -50%;
				padding: 0 0.35rem;
				border: 1.5px solid currentColor;
				border-radius: 3px;
				background: var(--raised);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				font-weight: 400;
				line-height: 1.3;
				white-space: nowrap;
				color: oklch(50% 0.17 300);
				rotate: 2deg;

				html.dark & {
					color: var(--purple);
				}
			}

			.changes {
				color: var(--ink);
				rotate: 1.2deg;
				padding-left: 0.4rem;
			}

			.changes::before {
				content: '↑ ';
			}

			.order {
				margin: 0;
				padding: 0.3rem 0.6rem;
				border-left: 2px dashed var(--muted-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--muted-ink);
				rotate: -0.6deg;
				transition: opacity 200ms ease;
			}

			@media (prefers-reduced-motion: reduce) {
				.note,
				.chip,
				.order {
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
