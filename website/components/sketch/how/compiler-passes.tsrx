// "What does the compiler write down?": step through the 15 passes for the
// counter. Every excerpt is copied from compileTsrxModule() output for it.
import { state } from '@markless/core';
import IndexCard from '../index-card.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import Ask from './ask.tsrx';

export default function CompilerPasses() @{
	let step = state(1);

	<figure class="sketch compiler-passes" data-step={step} style={'--step:' + step}>
		<Ask question="What does the compiler write down?" hint="Step through the passes. Each one adds a card to the tray." />

		<div class="board">
			<div class="code-side">
				<IndexCard label="Counter.tsrx" tilt="-1.2deg">
					<pre class="code"><span class="line"><span class="k">export function</span>{' '}<span class="f">Counter</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' '}<span class="hit">{'count = '}<span class="f">state</span>{'(0)'}<MarkerSweep beat={step === 1 ? 'odd' : step === 3 ? 'odd' : step === 8 ? 'even' : step === 10 ? 'even' : 'rest'} place="" /></span>{';'}</span><span class="line">{'\t'}<span class="hit"><span class="t">{'<button'}</span><MarkerSweep beat={step === 1 ? 'odd' : step === 3 ? 'odd' : step === 5 ? 'odd' : step === 9 ? 'odd' : 'rest'} place="" /></span>{' '}<span class="hit"><span class="a">onClick</span>{'={() => count++}'}<MarkerSweep beat={step === 1 ? 'odd' : step === 2 ? 'even' : step === 4 ? 'even' : step === 7 ? 'odd' : step === 9 ? 'odd' : step === 12 ? 'even' : step === 13 ? 'odd' : step === 14 ? 'even' : 'rest'} tone="pink" place="" /></span><span class="t">{'>'}</span></span><span class="line">{'\t\t'}<span class="hit">{'Count {count}'}<MarkerSweep beat={step === 2 ? 'even' : step === 4 ? 'even' : step === 5 ? 'odd' : step === 9 ? 'odd' : step === 12 ? 'even' : step === 13 ? 'odd' : 'rest'} tone="green" place="" /></span></span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
				<p class="note about" aria-hidden="true">{step === 6 ? 'nothing to mark: no scoped style here' : step === 11 || step === 15 ? 'nothing to mark: it reads earlier cards' : '↑ what this pass is about'}</p>
			</div>

			<div class="line-side">
				<div class="stations" role="group" aria-label="Passes">
					<button type="button" aria-label="Pass 1, tsrx-semantic-graph" aria-pressed={step === 1 ? 'true' : 'false'} onClick={() => (step = 1)}>1</button>
					<button type="button" aria-label="Pass 2, state-lowering" aria-pressed={step === 2 ? 'true' : 'false'} onClick={() => (step = 2)}>2</button>
					<button type="button" aria-label="Pass 3, payload-arena" aria-pressed={step === 3 ? 'true' : 'false'} onClick={() => (step = 3)}>3</button>
					<button type="button" aria-label="Pass 4, symbol-resolver" aria-pressed={step === 4 ? 'true' : 'false'} onClick={() => (step = 4)}>4</button>
					<button type="button" aria-label="Pass 5, render-data" aria-pressed={step === 5 ? 'true' : 'false'} onClick={() => (step = 5)}>5</button>
					<button type="button" aria-label="Pass 6, public-render-plan" aria-pressed={step === 6 ? 'true' : 'false'} onClick={() => (step = 6)}>6</button>
					<button type="button" aria-label="Pass 7, capture-analysis" aria-pressed={step === 7 ? 'true' : 'false'} onClick={() => (step = 7)}>7</button>
					<button type="button" aria-label="Pass 8, protocol-state" aria-pressed={step === 8 ? 'true' : 'false'} onClick={() => (step = 8)}>8</button>
					<button type="button" aria-label="Pass 9, protocol-view" aria-pressed={step === 9 ? 'true' : 'false'} onClick={() => (step = 9)}>9</button>
					<button type="button" aria-label="Pass 10, public-render-module" aria-pressed={step === 10 ? 'true' : 'false'} onClick={() => (step = 10)}>10</button>
					<button type="button" aria-label="Pass 11, payload-scripts" aria-pressed={step === 11 ? 'true' : 'false'} onClick={() => (step = 11)}>11</button>
					<button type="button" aria-label="Pass 12, symbol-modules" aria-pressed={step === 12 ? 'true' : 'false'} onClick={() => (step = 12)}>12</button>
					<button type="button" aria-label="Pass 13, runtime-demand-map" aria-pressed={step === 13 ? 'true' : 'false'} onClick={() => (step = 13)}>13</button>
					<button type="button" aria-label="Pass 14, trigger-groups" aria-pressed={step === 14 ? 'true' : 'false'} onClick={() => (step = 14)}>14</button>
					<button type="button" aria-label="Pass 15, symbol-resolver-module" aria-pressed={step === 15 ? 'true' : 'false'} onClick={() => (step = 15)}>15</button>
				</div>

				<div class="station-card">
					<div class="pass" data-n="1">
						<p class="name"><code>tsrx-semantic-graph</code></p>
						<p class="does">Builds the semantic graph from the source.</p>
						<pre class="out">{'state:count   state, scalar, starts at 0\nh0            <button>\nevent:0       click on h0\n              runs "() => count++"'}</pre>
					</div>
					<div class="pass" data-n="2">
						<p class="name"><code>state-lowering</code></p>
						<p class="does">Turns state reads and writes into graph reads and writes.</p>
						<pre class="out">{'read   count    → state:count\nwrite  count++  → state:count\n       operation "update", operator "++"'}</pre>
					</div>
					<div class="pass" data-n="3">
						<p class="name"><code>payload-arena</code></p>
						<p class="does">Plans the state and view records.</p>
						<pre class="out">{'cell     state:count, scalar\nlocator  h0, dom-order, index 0\nupdate   text of h0, prefix "Count "'}</pre>
					</div>
					<div class="pass" data-n="4">
						<p class="name"><code>symbol-resolver</code></p>
						<p class="does">Plans the symbols.</p>
						<pre class="out">{'symbol:0  event-handler, click on h0\nsymbol:1  dom-update, text of h0'}</pre>
					</div>
					<div class="pass" data-n="5">
						<p class="name"><code>render-data</code></p>
						<p class="does">Splits the markup into static HTML and dynamic slots.</p>
						<pre class="out">{'statics  "<button>Count <!--markless-slot:0-->"\n         "</button>"\nslot 0   text, reads state:count'}</pre>
					</div>
					<div class="pass" data-n="6">
						<p class="name"><code>public-render-plan</code></p>
						<p class="does">Plans direct DOM output for render(), where it can prove it.</p>
						<pre class="out">{'styleScopes  []\ndiagnostics  []'}</pre>
					</div>
					<div class="pass" data-n="7">
						<p class="name"><code>capture-analysis</code></p>
						<p class="does">Checks what each symbol reads.</p>
						<pre class="out">{'symbol:0  captures count\n          → graph reference state:count\nsymbol:1  captures nothing'}</pre>
					</div>
					<div class="pass" data-n="8">
						<p class="name"><code>protocol-state</code></p>
						<p class="does">Writes the state record.</p>
						<pre class="out">{'{"graphNodeId":"state:count",\n "name":"count","valueKind":"scalar",\n "value":{"version":1,"root":0,"records":[]}}'}</pre>
					</div>
					<div class="pass" data-n="9">
						<p class="name"><code>protocol-view</code></p>
						<p class="does">Writes the view record, with symbol IDs on each entry.</p>
						<pre class="out">{'events      h0 click → ["symbol:0"]\ndomUpdates  state:count → text of h0\n            → "symbol:1"'}</pre>
					</div>
					<div class="pass" data-n="10">
						<p class="name"><code>public-render-module</code></p>
						<p class="does">Writes the browser and server render modules.</p>
						<pre class="out">{'export function Counter() { … }\n  ↑ the browser module\nasync function marklessRenderSsr(props = {}, …)\n  ↑ the server module'}</pre>
					</div>
					<div class="pass" data-n="11">
						<p class="name"><code>payload-scripts</code></p>
						<p class="does">Writes the markless/state and markless/view script tags.</p>
						<pre class="out">{'<script type="markless/state">…</script>\n<script type="markless/view">…</script>'}</pre>
					</div>
					<div class="pass" data-n="12">
						<p class="name"><code>symbol-modules</code></p>
						<p class="does">Writes one module source per symbol.</p>
						<pre class="out">{'export function symbol_0(context) { … }\nexport function symbol_1(context) { … }'}</pre>
					</div>
					<div class="pass" data-n="13">
						<p class="name"><code>runtime-demand-map</code></p>
						<p class="does">Maps each symbol and record to the runtime code it needs.</p>
						<pre class="out">{'symbol:0  needs web/fns/write-scalar\nsymbol:1  needs nothing extra'}</pre>
					</div>
					<div class="pass" data-n="14">
						<p class="name"><code>trigger-groups</code></p>
						<p class="does">Groups each event with the state, records and symbols it touches.</p>
						<pre class="out">{'h0:click  → state:count\n          → symbol:0, symbol:1'}</pre>
					</div>
					<div class="pass" data-n="15">
						<p class="name"><code>symbol-resolver-module</code></p>
						<p class="does">Writes the module that imports symbols by ID.</p>
						<pre class="out">{'export async function loadSymbol(id) { … }'}</pre>
					</div>
				</div>

				<div class="steps">
					<button type="button" class="go" disabled={step === 1} onClick={() => (step = step > 1 ? step - 1 : 1)}>← Back</button>
					<p class="where" aria-live="polite">{'Pass ' + step + ' of 15'}</p>
					<button type="button" class="go" disabled={step === 15} onClick={() => (step = step < 15 ? step + 1 : 15)}>Next →</button>
				</div>
			</div>
		</div>

		<div class="tray-side">
			<p class="note tray-title" aria-hidden="true">the tray</p>
			<ol class="tray" aria-label="Cards written so far">
				<li style="--n:1">semantic graph</li>
				<li style="--n:2">reads, writes</li>
				<li style="--n:3">record plan</li>
				<li style="--n:4">symbol plan</li>
				<li style="--n:5">HTML, slots</li>
				<li style="--n:6">direct DOM plan</li>
				<li style="--n:7">captures</li>
				<li style="--n:8">state record</li>
				<li class="star" style="--n:9"><span class="hit">view record<MarkerCircle beat={step >= 9 ? 'odd' : 'rest'} /></span></li>
				<li style="--n:10">render modules</li>
				<li style="--n:11">script tags</li>
				<li class="star" style="--n:12"><span class="hit">symbol:0<MarkerCircle beat={step >= 12 ? 'odd' : 'rest'} /></span>{' '}<span class="hit two">symbol:1<MarkerCircle beat={step >= 12 ? 'odd' : 'rest'} /></span></li>
				<li style="--n:13">demand map</li>
				<li style="--n:14">trigger groups</li>
				<li style="--n:15">loadSymbol module</li>
			</ol>
			<p class="note circled" aria-hidden="true">{step >= 12 ? 'circled: the three cards this page shows in full' : step >= 9 ? 'circled: shown in full below' : ''}</p>
		</div>

		<p class="foot">Excerpts are trimmed from the real output for this counter. Line breaks and arrows are mine.</p>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 15.5rem) minmax(0, 1fr);
				gap: 2.2rem;
				align-items: start;
				padding-left: 0.4rem;
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
				line-height: 1.15;
				color: var(--ink);
			}

			.about {
				margin: 0.9rem 0 0 1.2rem;
				rotate: -2deg;
				color: oklch(55% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			.stations {
				display: grid;
				grid-template-columns: repeat(8, minmax(0, 1fr));
				gap: 0.35rem;
			}

			.stations button {
				min-width: 0;
				height: 2.2rem;
				padding: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--ink);
				background: transparent;
				border: 1.5px solid var(--ink);
				border-radius: 46% 54% 50% 50% / 52% 46% 54% 48%;
				cursor: pointer;
			}

			.stations button[aria-pressed='true'] {
				background: var(--yellow);
				color: oklch(28% 0.015 90);
				box-shadow: 2px 2px 0 var(--ink);
			}

			button:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 3px;
			}

			.station-card {
				margin-top: 0.9rem;
				padding: 0.7rem 0.9rem 0.8rem;
				border: 2px solid var(--ink);
				border-radius: 2px;
				background: var(--raised);
				box-shadow: 4px 4px 0 var(--purple);
			}

			.pass {
				display: none;
			}

			.compiler-passes[data-step='1'] .pass[data-n='1'],
			.compiler-passes[data-step='2'] .pass[data-n='2'],
			.compiler-passes[data-step='3'] .pass[data-n='3'],
			.compiler-passes[data-step='4'] .pass[data-n='4'],
			.compiler-passes[data-step='5'] .pass[data-n='5'],
			.compiler-passes[data-step='6'] .pass[data-n='6'],
			.compiler-passes[data-step='7'] .pass[data-n='7'],
			.compiler-passes[data-step='8'] .pass[data-n='8'],
			.compiler-passes[data-step='9'] .pass[data-n='9'],
			.compiler-passes[data-step='10'] .pass[data-n='10'],
			.compiler-passes[data-step='11'] .pass[data-n='11'],
			.compiler-passes[data-step='12'] .pass[data-n='12'],
			.compiler-passes[data-step='13'] .pass[data-n='13'],
			.compiler-passes[data-step='14'] .pass[data-n='14'],
			.compiler-passes[data-step='15'] .pass[data-n='15'] {
				display: block;
			}

			.name {
				margin: 0;
			}

			.name code {
				font-size: var(--step-0);
				font-weight: 700;
			}

			.does {
				margin: 0.3rem 0 0.6rem;
				font-size: var(--step-0);
				line-height: 1.35;
			}

			.out {
				padding: 0.5rem 0.65rem;
				border-radius: 2px;
				background: var(--code-surface);
				border: 1px solid var(--code-edge);
				color: var(--ink);
				font-size: 0.78rem;
				line-height: 1.5;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}

			.steps {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.5rem;
				margin-top: 0.8rem;
			}

			.go {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: oklch(28% 0.015 90);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			.go:disabled {
				opacity: 0.45;
				box-shadow: none;
				cursor: default;
			}

			.where {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			.tray-side {
				margin-top: var(--space-m);
			}

			.tray-title {
				margin: 0 0 0.4rem 0.4rem;
				rotate: -2deg;
			}

			.tray {
				display: flex;
				flex-wrap: wrap;
				gap: 0.45rem 0.5rem;
				margin: 0;
				padding: 0.8rem;
				list-style: none;
				border: 2px dashed color-mix(in oklch, var(--ink) 55%, transparent);
				border-radius: 6px;
			}

			.tray li {
				margin: 0;
				padding: 0.2rem 0.55rem;
				border: 1.5px solid oklch(28% 0.015 90);
				border-radius: 2px;
				background: #fbf6e6;
				color: oklch(28% 0.015 90);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.3;
				box-shadow: -1px 2px 0 rgb(51 48 42 / 0.25);
				opacity: clamp(0.2, (var(--step) - var(--n) + 1) * 1, 1);
				translate: 0 calc(clamp(0, var(--n) - var(--step), 1) * -0.5rem);
				transition: opacity 240ms ease, translate 240ms ease;
			}

			.tray li:nth-child(odd) {
				rotate: -1deg;
			}

			.tray li:nth-child(even) {
				rotate: 1.2deg;
			}

			.tray .star {
				background: var(--yellow);
			}

			.two {
				margin-left: 0.6rem;
			}

			.circled {
				min-height: 1.2em;
				margin: 0.5rem 0 0 0.4rem;
				rotate: -1deg;
				color: oklch(55% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			.foot {
				margin: var(--space-s) 0 0;
				font-size: var(--step--1);
				line-height: 1.4;
				color: color-mix(in oklch, var(--ink) 75%, var(--paper));
			}

			@media (prefers-reduced-motion: reduce) {
				.tray li {
					transition: none;
				}
			}

			@container (max-width: 38rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					gap: 1.2rem;
					padding-left: 0;
				}
			}
		</style>
	</figure>
}
