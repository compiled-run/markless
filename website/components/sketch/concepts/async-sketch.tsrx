// Async page figure: which of @try, @pending and @catch is on the page, read from the page itself.
import { computed, element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import MugLookup from './mug-lookup.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { afterUpdate, placeOver, watchChanges } from './place.ts';

const mugs = ['tall', 'small', 'cracked'];

export default function AsyncSketch() @{
	let picked = state('');
	let phase = state('idle');
	let onPage = state('try');
	let held = state('');
	let sawPending = state(false);
	let beat = state('rest');
	let blockBeat = state('rest');
	let sweepAt = state('');
	let slot = element<HTMLDivElement>();
	const waitLine = computed(() => {
		if (phase === 'idle') return 'then it looks the mug up';
		if (phase === 'same') return 'already picked: nothing new to look up';
		if (sawPending) return 'no answer yet, so @pending showed';
		return 'meanwhile the old block stays on the page';
	});
	const endLine = computed(() => {
		if (phase === 'arrived') return 'the new answer swaps in';
		if (phase === 'failed') return 'it failed, so @catch takes over';
		if (phase === 'waiting') return 'waiting for the answer…';
		return 'then the page changes once';
	});

	<figure class="concept-sketch">
		<SketchAsk ask="Which block is on the page right now?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="mug-lookup.tsrx" tilt="-0.8deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">computed</span>, <span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line"><span class="k">import</span>{' { '}<span class="f">lookUp</span>{' } '}<span class="k">from</span>{' '}<span class="s">'./look-up.ts'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">MugLookup</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' mug = '}<span class="f">state</span>{"('');"}</span><span class="line">{'\t'}<span class="k">const</span>{' fact = '}<span class="f">computed</span>{'('}<span class="k">async</span>{' () => {'}</span><span class="line">{'\t\t'}<span class="k">const</span>{' which = mug;'}</span><span class="line">{'\t\t'}<span class="k">return</span>{' { text: '}<span class="k">await</span>{' '}<span class="f">lookUp</span>{'(which) };'}</span><span class="line">{'\t});'}</span><span class="line">{' '}</span><span class="line">{'\t'}<span class="t">{'<section>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">{"(mug = 'tall')"}<MarkerCircle beat={picked === 'tall' ? beat : 'rest'} /></span>{'}'}<span class="t">{'>'}</span>{'Tall'}<span class="t">{'</button>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">{"(mug = 'small')"}<MarkerCircle beat={picked === 'small' ? beat : 'rest'} /></span>{'}'}<span class="t">{'>'}</span>{'Small'}<span class="t">{'</button>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">{"(mug = 'cracked')"}<MarkerCircle beat={picked === 'cracked' ? beat : 'rest'} /></span>{'}'}<span class="t">{'>'}</span>{'Cracked'}<span class="t">{'</button>'}</span></span><span class="line">{'\t\t'}<span class="hit"><span class="k">{'@try'}</span><MarkerSweep beat={onPage === 'try' ? blockBeat : 'rest'} place="" /></span>{' {'}</span><span class="line">{'\t\t\t'}<span class="t">{'<p'}</span>{' '}<span class="a">class</span>{'='}<span class="s">"answer"</span><span class="t">{'>'}</span>{'{fact.text}'}<span class="t">{'</p>'}</span></span><span class="line">{'\t\t} '}<span class="hit"><span class="k">{'@pending'}</span><MarkerSweep beat={onPage === 'pending' ? blockBeat : 'rest'} place="" /></span>{' {'}</span><span class="line">{'\t\t\t'}<span class="t">{'<p'}</span>{' '}<span class="a">class</span>{'='}<span class="s">"wait"</span><span class="t">{'>'}</span>{'Looking it up...'}<span class="t">{'</p>'}</span></span><span class="line">{'\t\t} '}<span class="hit"><span class="k">{'@catch'}</span><MarkerSweep beat={onPage === 'catch' ? blockBeat : 'rest'} place="" /></span>{' {'}</span><span class="line">{'\t\t\t'}<span class="t">{'<p'}</span>{' '}<span class="a">class</span>{'='}<span class="s">"oops"</span><span class="t">{'>'}</span>{'Not on the shelf.'}<span class="t">{'</p>'}</span></span><span class="line">{'\t\t}'}</span><span class="line">{'\t'}<span class="t">{'</section>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={60} height={100} x1={54} y1={6} x2={6} y2={92} bend={-14} seed={71} shown={picked === '' ? 'false' : 'true'} />
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={phase === 'waiting' ? 'thinking' : phase === 'failed' ? 'sigh' : phase === 'arrived' ? 'cheers' : 'idle'}
					face={phase === 'failed' ? 'sad' : phase === 'arrived' ? 'happy' : 'neutral'}
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={picked === '' ? 'false' : 'true'}
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
							const which = mugs[Array.from(slot.querySelectorAll('button')).indexOf(button)] ?? '';
							beat = beat === 'odd' ? 'even' : 'odd';
							if (which === picked) {
								phase = 'same';
								return;
							}
							picked = which;
							phase = 'waiting';
							sawPending = false;
							const read = () => {
								if (!slot) return;
								const answer = slot.querySelector('.answer');
								const block = answer ? 'try' : slot.querySelector('.wait') ? 'pending' : slot.querySelector('.oops') ? 'catch' : '';
								const text = (answer ?? slot.querySelector('.wait') ?? slot.querySelector('.oops'))?.textContent ?? '';
								if (block !== onPage) blockBeat = blockBeat === 'odd' ? 'even' : 'odd';
								onPage = block;
								if (phase !== 'waiting') return;
								if (block === 'pending') sawPending = true;
								if (block === 'catch' || (block === 'try' && text !== held)) {
									phase = block === 'catch' ? 'failed' : 'arrived';
									blockBeat = blockBeat === 'odd' ? 'even' : 'odd';
									sweepAt = placeOver(slot, answer ?? slot.querySelector('.oops'), 1);
								}
							};
							held = (slot.querySelector('.answer') ?? slot.querySelector('.oops'))?.textContent ?? '';
							sweepAt = '';
							watchChanges(slot, read);
							afterUpdate(read);
						}}
					>
						<MugLookup />
						<MarkerSweep beat={sweepAt === '' ? 'rest' : blockBeat} place={sweepAt} />
					</div>
				</YourPage>

				<div class="blocks" aria-hidden="true">
					<p class="block" data-on={onPage === 'try' ? 'true' : 'false'}><code>{'@try'}</code><span>the answer</span></p>
					<p class="block" data-on={onPage === 'pending' ? 'true' : 'false'}><code>{'@pending'}</code><span>the wait</span></p>
					<p class="block" data-on={onPage === 'catch' ? 'true' : 'false'}><code>{'@catch'}</code><span>a failure</span></p>
				</div>
				<p class="on-now" aria-hidden="true">{'↑ on the page now: @' + onPage}</p>

				<ol class="timeline">
					<li data-step={picked === '' ? 'todo' : 'done'}>{picked === '' ? 'you pick a mug' : 'you picked ' + picked}</li>
					<li data-step={phase === 'idle' ? 'todo' : 'done'}>{waitLine}</li>
					<li data-step={phase === 'arrived' || phase === 'failed' ? 'done' : 'todo'} aria-live="polite">{endLine}</li>
				</ol>
			</div>
		</div>

		<style>
			.concept-sketch {
				--sweep-delay: 120ms;
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

			.blocks {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 0.4rem;
				margin-top: var(--space-xs);
			}

			.block {
				display: flex;
				flex-direction: column;
				gap: 0.1rem;
				margin: 0;
				padding: 0.35rem 0.45rem;
				border: 1.5px dashed var(--muted-ink);
				border-radius: 4px;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.15;
				color: var(--muted-ink);
				transition: background-color 220ms ease, border-color 220ms ease, color 220ms ease;
			}

			.block code {
				font-family: var(--font-mono);
				font-size: 0.75rem;
				background: none;
				padding: 0;
				color: inherit;
			}

			.block[data-on='true'] {
				border: 2px solid var(--ink);
				background: color-mix(in oklch, var(--yellow) 55%, transparent);
				color: var(--ink);
				rotate: -1.5deg;

				html.dark & {
					background: color-mix(in oklch, var(--yellow) 22%, transparent);
				}
			}

			.on-now {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				color: var(--ink);
				rotate: 1deg;
				padding-left: 0.4rem;
			}

			.timeline {
				margin: var(--space-xs) 0 0;
				padding: 0.3rem 0.6rem 0.3rem 0.7rem;
				list-style: none;
				border-left: 2px dashed var(--muted-ink);
				display: grid;
				gap: 0.15rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.2;
				rotate: -0.5deg;
			}

			.timeline li {
				margin: 0;
				color: var(--muted-ink);
			}

			.timeline li::before {
				content: '○ ';
			}

			.timeline li[data-step='done'] {
				color: var(--ink);
			}

			.timeline li[data-step='done']::before {
				content: '● ';
				color: oklch(55% 0.2 0);
			}

			@media (prefers-reduced-motion: reduce) {
				.block {
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
