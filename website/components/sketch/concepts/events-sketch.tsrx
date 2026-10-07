// Events page figure: a log of each event the form fires and the handler it ran.
import { element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import MugName from './mug-name.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { afterUpdate, placeOverText } from './place.ts';

type Entry = { readonly id: string; readonly event: string; readonly handler: string; readonly did: string };

export default function EventsSketch() @{
	let log = state<Entry[]>([{ id: 'e0', event: 'page set up', handler: 'MugName()', did: 'once, before you got here' }]);
	let seq = state(0);
	let last = state('');
	let beat = state('rest');
	let sweepAt = state('');
	let submits = state(0);
	let say = state('');
	let slot = element<HTMLDivElement>();

	<figure class="concept-sketch">
		<SketchAsk ask="What runs, and when?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="mug-name.tsrx" tilt="-0.8deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">MugName</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' name = '}<span class="f">state</span>{"('');"}</span><span class="line">{'\t'}<span class="k">let</span>{' printed = '}<span class="f">state</span>{'('}<span class="s">'nothing yet'</span>{');'}</span><span class="line">{' '}</span><span class="line">{'\t'}<span class="t">{'<form'}</span></span><span class="line">{'\t\t'}<span class="hit"><span class="a">onSubmit</span><MarkerCircle beat={last === 'submit' ? beat : 'rest'} /></span>{'={(event) => {'}</span><span class="line">{'\t\t\tevent.'}<span class="f">preventDefault</span>{'();'}<span class="note stays" aria-hidden="true" data-shown={submits > 0 ? 'true' : 'false'}>← no reload</span></span><span class="line">{'\t\t\tprinted = name;'}</span><span class="line">{'\t\t}}'}</span><span class="line">{'\t'}<span class="t">{'>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<input'}</span></span><span class="line">{'\t\t\t'}<span class="a">aria-label</span>{'='}<span class="s">"Mug name"</span></span><span class="line">{'\t\t\t'}<span class="a">value</span>{'='}<span class="hit">{'{name}'}<MarkerSweep beat={last === 'input' || last === 'escape' ? beat : 'rest'} place="" /></span></span><span class="line">{'\t\t\t'}<span class="hit"><span class="a">onInput</span><MarkerCircle beat={last === 'input' ? beat : 'rest'} /></span>{'={(event) => {'}</span><span class="line">{'\t\t\t\tname = event.currentTarget.value;'}</span><span class="line">{'\t\t\t}}'}</span><span class="line">{'\t\t\t'}<span class="hit"><span class="a">onKeyDown</span><MarkerCircle beat={last === 'keydown' || last === 'escape' ? beat : 'rest'} /></span>{'={(event) => {'}</span><span class="line">{'\t\t\t\t'}<span class="k">if</span>{' (event.key === '}<span class="s">'Escape'</span>{") name = '';"}</span><span class="line">{'\t\t\t}}'}</span><span class="line">{'\t\t'}<span class="t">{'/>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<p>'}</span>{'Printed: '}<span class="hit">{'{printed}'}<MarkerSweep beat={last === 'submit' ? beat : 'rest'} place="" /></span><span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'</form>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={60} height={120} x1={54} y1={6} x2={6} y2={112} bend={-14} seed={41} shown={last === '' ? 'false' : 'true'} />
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={last === '' ? 'idle' : last === 'submit' ? 'cheers' : 'wide'}
					face={last === 'submit' ? 'happy' : 'neutral'}
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
						onKeyDown={(event) => {
							const key = event.key === ' ' ? 'Space' : event.key;
							const escape = event.key === 'Escape';
							seq++;
							log = [...log, { id: 'e' + seq, event: 'keydown ' + key, handler: 'onKeyDown', did: escape ? "name = ''" : 'not Escape, so nothing' }].slice(-6);
							last = escape ? 'escape' : 'keydown';
							beat = beat === 'odd' ? 'even' : 'odd';
							if (escape) say = "Escape ran onKeyDown, which set name to ''.";
						}}
						onInput={(event) => {
							const target = event.target;
							const value = target instanceof HTMLInputElement ? target.value : '';
							seq++;
							log = [...log, { id: 'e' + seq, event: 'input', handler: 'onInput', did: "name = '" + value + "'" }].slice(-6);
							last = 'input';
							beat = beat === 'odd' ? 'even' : 'odd';
						}}
						onSubmit={() => {
							seq++;
							submits++;
							log = [...log, { id: 'e' + seq, event: 'submit', handler: 'onSubmit', did: 'preventDefault, then printed = name' }].slice(-6);
							last = 'submit';
							beat = beat === 'odd' ? 'even' : 'odd';
							say = 'Enter fired submit. onSubmit ran, and the page did not reload.';
							afterUpdate(() => {
								const printed = slot ? slot.querySelector('p') : null;
								sweepAt = placeOverText(slot, printed, /\S.*$/);
							});
						}}
					>
						<MugName />
						<MarkerSweep beat={last === 'submit' ? beat : 'rest'} place={sweepAt} />
					</div>
				</YourPage>
				<p class="say" aria-live="polite">{say}</p>
				<p class="note changes" aria-hidden="true">{last === '' ? 'type, press Enter, then Escape' : submits > 0 ? 'the log is still here: no reload' : 'each letter fires two events'}</p>
				<ol class="log" aria-label="Events so far, oldest first">
					@for (const entry of log; key entry.id) {
						<li>
							<code class="ev">{entry.event}</code>
							<span class="ran">ran <code>{entry.handler}</code></span>
							<span class="did">{entry.did}</span>
						</li>
					}
				</ol>
			</div>
		</div>

		<style>
			.concept-sketch {
				--sweep-delay: 160ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 22rem minmax(0, 1fr);
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

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				text-indent: 0;
				transition: opacity 200ms ease 120ms, translate 260ms ease 120ms;
			}

			.note[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
				translate: 0 0.3rem;
			}

			.stays {
				position: absolute;
				left: 13.6rem;
				top: 0.05rem;
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
				left: 20.4rem;
				top: 9.8rem;
				width: 6rem;
				height: 12rem;
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
				margin: 0;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.log {
				margin: var(--space-xs) 0 0;
				padding: 0.2rem 0 0.2rem 0.7rem;
				list-style: none;
				border-left: 2px dashed var(--muted-ink);
				display: grid;
				gap: 0.35rem;
				rotate: -0.5deg;
			}

			.log li {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: 0 0.45rem;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.25;
				color: var(--muted-ink);
			}

			.log code {
				font-family: var(--font-mono);
				font-size: 0.78rem;
				background: none;
				padding: 0;
				color: var(--ink);
			}

			.ev {
				padding: 0 0.3rem !important;
				border: 1.5px solid currentColor;
				border-radius: 3px;
			}

			.did {
				flex-basis: 100%;
				padding-left: 0.4rem;
			}

			.log li:last-child:not(:first-child) {
				color: oklch(55% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			.log li:last-child .ran code {
				color: inherit;
			}

			@media (prefers-reduced-motion: reduce) {
				.note {
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
