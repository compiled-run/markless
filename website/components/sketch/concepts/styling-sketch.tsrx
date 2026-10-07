// Styling page figure: each rule's real scoped selector and the element it matches on this page.
import { element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import ChalkTag from './chalk-tag.tsrx';
import PaperTag from './paper-tag.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { afterUpdate, placeOver } from './place.ts';

const scopeOf = (target: Element | null | undefined): string =>
	Array.from(target?.classList ?? []).find((name) => name.startsWith('mk-')) ?? '';

export default function StylingSketch() @{
	let pointed = state('');
	let beat = state('rest');
	let scoped = state('');
	let elementClass = state('');
	let matches = state(0);
	let matchAt = state('');
	let slot = element<HTMLDivElement>();

	<figure class="concept-sketch">
		<SketchAsk ask="Which elements does each .card rule reach?" />

		<div
			class="board"
			onPointerOver={(event) => {
				const target = event.target;
				const rule = target instanceof Element ? target.closest('[data-rule]') : null;
				const which = rule?.getAttribute('data-rule') ?? '';
				if (which === '' || which === pointed) return;
				pointed = which;
				beat = beat === 'odd' ? 'even' : 'odd';
				afterUpdate(() => {
					const cards = slot ? slot.querySelectorAll('.card') : [];
					const owner = pointed === 'paper' ? cards[0] : cards[1];
					const scope = scopeOf(owner);
					scoped = (pointed === 'lit' ? '.lit' : '.card') + (scope === '' ? '' : '.' + scope);
					const found = slot ? Array.from(slot.querySelectorAll(scoped)) : [];
					matches = found.length;
					matchAt = found.length > 0 ? placeOver(slot, found[0], 5) : '';
					elementClass = found.length > 0 ? found[0].getAttribute('class') ?? '' : '';
				});
			}}
			onFocusIn={(event) => {
				const target = event.target;
				const which = target instanceof Element ? target.getAttribute('data-rule') ?? '' : '';
				if (which === '' || which === pointed) return;
				pointed = which;
				beat = beat === 'odd' ? 'even' : 'odd';
				afterUpdate(() => {
					const cards = slot ? slot.querySelectorAll('.card') : [];
					const owner = pointed === 'paper' ? cards[0] : cards[1];
					const scope = scopeOf(owner);
					scoped = (pointed === 'lit' ? '.lit' : '.card') + (scope === '' ? '' : '.' + scope);
					const found = slot ? Array.from(slot.querySelectorAll(scoped)) : [];
					matches = found.length;
					matchAt = found.length > 0 ? placeOver(slot, found[0], 5) : '';
					elementClass = found.length > 0 ? found[0].getAttribute('class') ?? '' : '';
				});
			}}
			onClick={(event) => {
				const target = event.target;
				const inPage = target instanceof Element && slot !== undefined && slot.contains(target) && target.closest('button') !== null;
				if (!inPage || pointed === '') return;
				afterUpdate(() => {
					const found = slot && scoped !== '' ? Array.from(slot.querySelectorAll(scoped)) : [];
					matches = found.length;
					matchAt = found.length > 0 ? placeOver(slot, found[0], 5) : '';
					elementClass = found.length > 0 ? found[0].getAttribute('class') ?? '' : '';
				});
			}}
		>
			<div class="code-side">
				<p class="hint" aria-hidden="true">point at a rule ↓</p>
				<IndexCard label="paper-tag.tsrx" tilt="-1deg">
					<pre class="code"><span class="line"><span class="k">export default function</span>{' '}<span class="f">PaperTag</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="t">{'<div'}</span>{' '}<span class="a">class</span>{'='}<span class="s">"card"</span><span class="t">{'>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<style>'}</span></span><span class="line">{'\t\t\t'}<span class="hit"><button type="button" class="rule" data-rule="paper" aria-pressed={pointed === 'paper' ? 'true' : 'false'}>.card</button><MarkerCircle beat={pointed === 'paper' ? beat : 'rest'} /></span>{' {'}<span class="note really" aria-hidden="true" data-shown={pointed === 'paper' && scoped !== '' ? 'true' : 'false'}>{'↙ really ' + scoped}</span></span><span class="line">{'\t\t\t\tpadding: 0.5em 0.8em;'}</span><span class="line">{'\t\t\t\tborder: 2px solid;'}</span><span class="line">{'\t\t\t\tbackground: lightyellow;'}</span><span class="line">{'\t\t\t\tcolor: black;'}</span><span class="line">{'\t\t\t}'}</span><span class="line">{'\t\t'}<span class="t">{'</style>'}</span></span><span class="line">{'\t\tPaper card'}</span><span class="line">{'\t'}<span class="t">{'</div>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
				<IndexCard label="chalk-tag.tsrx" tilt="0.8deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">ChalkTag</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' lit = '}<span class="f">state</span>{'('}<span class="k">false</span>{');'}</span><span class="line">{' '}</span><span class="line">{'\t'}<span class="t">{'<div'}</span>{' '}<span class="a">class</span>{'={lit ? '}<span class="s">'card lit'</span>{' : '}<span class="s">'card'</span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<style>'}</span></span><span class="line">{'\t\t\t'}<span class="hit"><button type="button" class="rule" data-rule="chalk" aria-pressed={pointed === 'chalk' ? 'true' : 'false'}>.card</button><MarkerCircle beat={pointed === 'chalk' ? beat : 'rest'} /></span>{' {'}<span class="note really" aria-hidden="true" data-shown={pointed === 'chalk' && scoped !== '' ? 'true' : 'false'}>{'↙ really ' + scoped}</span></span><span class="line">{'\t\t\t\tpadding: 0.5em 0.8em;'}</span><span class="line">{'\t\t\t\tborder: 2px dashed;'}</span><span class="line">{'\t\t\t\tbackground: darkslategray;'}</span><span class="line">{'\t\t\t\tcolor: white;'}</span><span class="line">{'\t\t\t}'}</span><span class="line">{'\t\t\t'}<span class="hit"><button type="button" class="rule" data-rule="lit" aria-pressed={pointed === 'lit' ? 'true' : 'false'}>.lit</button><MarkerCircle beat={pointed === 'lit' ? beat : 'rest'} /></span>{' {'}<span class="note really" aria-hidden="true" data-shown={pointed === 'lit' && scoped !== '' ? 'true' : 'false'}>{'↙ really ' + scoped}</span></span><span class="line">{'\t\t\t\tbackground: plum;'}</span><span class="line">{'\t\t\t\tcolor: black;'}</span><span class="line">{'\t\t\t}'}</span><span class="line">{'\t\t'}<span class="t">{'</style>'}</span></span><span class="line">{'\t\tChalk card'}</span><span class="line">{'\t\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => (lit = !lit)}'}<span class="t">{'>'}</span>{'Light up'}<span class="t">{'</button>'}</span></span><span class="line">{'\t'}<span class="t">{'</div>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={pointed === '' ? 'idle' : matches === 0 ? 'thinking' : 'wide'}
					face={matches === 0 ? 'neutral' : 'curious'}
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={pointed === '' ? 'false' : 'true'}
					reaction="rest"
				/>
			</div>

			<div class="live">
				<div class="arrow to-paper">
					<InkArrow width={80} height={60} x1={74} y1={54} x2={8} y2={6} bend={10} seed={83} shown={pointed === 'paper' ? 'true' : 'false'} />
				</div>
				<div class="arrow to-chalk">
					<InkArrow width={80} height={60} x1={6} y1={54} x2={72} y2={6} bend={-10} seed={89} shown={pointed === 'chalk' || pointed === 'lit' ? 'true' : 'false'} />
				</div>
				<YourPage>
					<div class="slot" el={slot}>
						<PaperTag />
						<ChalkTag />
						<span class="match" aria-hidden="true" data-shown={matchAt === '' ? 'false' : 'true'} style={matchAt}><b>{'class="' + elementClass + '"'}</b></span>
					</div>
				</YourPage>
				<p class="note changes" aria-live="polite">{pointed === '' ? 'hover or tab to .card in either file' : matches === 0 ? scoped + ' matches nothing right now. Try Light up' : scoped + ' reaches ' + matches + ' element: its own file’s card'}</p>
			</div>
		</div>

		<style>
			.concept-sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto;
				grid-template-areas:
					'code code'
					'live mug';
				column-gap: var(--space-m);
				row-gap: var(--space-l);
				align-items: end;
				padding: 0.6rem 0 1.2rem 0.4rem;
			}

			.code-side {
				grid-area: code;
				position: relative;
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				align-items: start;
				gap: var(--space-m) var(--space-s);
				padding-top: 1.6rem;
			}

			.hint {
				position: absolute;
				left: 0.6rem;
				top: -0.4rem;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				color: oklch(55% 0.2 0);
				rotate: -2deg;

				html.dark & {
					color: var(--pink);
				}
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

			.rule {
				all: unset;
				position: relative;
				z-index: 2;
				padding: 0 0.15rem;
				border-bottom: 2px dotted #6639ba;
				color: #6639ba;
				font-weight: 700;
				cursor: pointer;
			}

			.rule:hover,
			.rule[aria-pressed='true'] {
				background: color-mix(in oklch, var(--yellow) 70%, transparent);
			}

			.rule:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 3px;
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

			.really {
				position: absolute;
				left: 5.4rem;
				top: -1.25rem;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
				rotate: -2deg;
			}

			.arrow {
				position: absolute;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.to-paper,
			.to-chalk {
				top: -3.6rem;
				width: 5rem;
				height: 3.6rem;
			}

			.to-paper {
				left: 2rem;
			}

			.to-chalk {
				right: 2rem;
			}

			.mug-spot {
				grid-area: mug;
				justify-self: end;
				position: relative;
				z-index: 1;
				margin: 0 1rem 2.4rem 0;
				zoom: 0.6;
				--gaze-x: -5px;
				--gaze-y: 5px;
			}

			.live {
				grid-area: live;
				position: relative;
				width: min(100%, 28rem);
				justify-self: center;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			.slot {
				position: relative;
				display: grid;
				gap: 0.8rem;
			}

			.slot:has(:focus-visible) {
				outline: 2.5px dashed var(--purple);
				outline-offset: 6px;
			}

			.match {
				position: absolute;
				border: 3px solid oklch(62% 0.2 0);
				border-radius: 6px;
				pointer-events: none;
				transition: top 260ms ease, height 260ms ease, opacity 200ms ease;
			}

			.match[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
			}

			.match b {
				position: absolute;
				right: 0.3rem;
				bottom: -0.85rem;
				max-width: calc(100% + 1rem);
				overflow: hidden;
				text-overflow: ellipsis;
				padding: 0 0.3rem;
				background: var(--raised);
				font-family: var(--font-mono);
				font-size: 0.72rem;
				font-weight: 400;
				line-height: 1.4;
				white-space: nowrap;
				color: oklch(50% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			.changes {
				color: var(--ink);
				rotate: 1deg;
				padding-left: 0.4rem;
			}

			.changes::before {
				content: '↑ ';
			}

			@media (prefers-reduced-motion: reduce) {
				.note,
				.match {
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
					row-gap: var(--space-s);
				}

				.code-side {
					grid-template-columns: minmax(0, 1fr);
				}

				pre {
					font-size: 0.72rem;
				}

				.to-paper,
				.to-chalk {
					display: none;
				}

				.mug-spot {
					margin: -0.4rem 0.4rem -1.6rem 0;
				}
			}
		</style>
	</figure>
}
