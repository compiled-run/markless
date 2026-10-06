// "Where can the same counter render?": one counter file, the plan the build
// writes for it, and a picker that feeds that same plan to each environment.
import { state } from '@markless/core';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import Ask from './ask.tsrx';

export default function PlanAnywhere() @{
	let env = state('browser');
	let beat = state(0);
	let tally = state(0);

	<figure class="sketch plan-anywhere" data-env={env}>
		<Ask question="Where can the same counter render?" hint="Pick a place. The plan cards stay the same." />

		<div class="top">
			<div class="code-side">
				<IndexCard label="counter.tsrx" tilt="-1.2deg">
					<pre class="code"><span class="line"><span class="k">export default function</span>{' '}<span class="f">Counter</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' count = '}<span class="f">state</span>{'(0);'}</span><span class="line">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => count++}'}<span class="t">{'>'}</span></span><span class="line">{'\t\tCount {count}'}</span><span class="line">{'\t'}<span class="t">{'</button>'}</span></span><span class="line"><span class="k">{'}'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="build" aria-hidden="true">
				<span class="note when">build time</span>
				<span class="arrow across"><InkArrow width={90} height={40} x1={4} y1={26} x2={86} y2={20} bend={-8} seed={3} shown="true" /></span>
				<span class="arrow drop"><InkArrow width={50} height={60} x1={22} y1={4} x2={26} y2={56} bend={-6} seed={9} shown="true" /></span>
			</div>

			<div class="plan">
				<p class="note plan-title">the plan, written once</p>
				<ul class="cards">
					<li class="card state-card">
						<span class="hit"><code>state:count</code><MarkerCircle beat={beat === 0 ? 'rest' : beat % 2 === 0 ? 'even' : 'odd'} tone="pink" /></span>
						<span>the state, starts at 0</span>
					</li>
					<li class="card text-card">
						<span class="hit"><code>{'Count {count}'}</code><MarkerCircle beat={beat === 0 ? 'rest' : beat % 2 === 0 ? 'even' : 'odd'} tone="pink" /></span>
						<span>one planned text write</span>
					</li>
					<li class="card click-card">
						<span class="hit"><code>symbol:0</code><MarkerCircle beat={beat === 0 ? 'rest' : beat % 2 === 0 ? 'even' : 'odd'} tone="pink" /></span>
						<span>the click code, with its own ID</span>
					</li>
				</ul>
			</div>
		</div>

		<div class="pick" role="group" aria-label="Where the counter renders">
			<span class="note pick-label" aria-hidden="true">render it in</span>
			<button type="button" aria-pressed={env === 'browser' ? 'true' : 'false'} onClick={() => { env = 'browser'; tally = 0; beat++; }}>
				Browser
			</button>
			<button type="button" aria-pressed={env === 'server' ? 'true' : 'false'} onClick={() => { env = 'server'; tally = 0; beat++; }}>
				Server
			</button>
			<button type="button" aria-pressed={env === 'build' ? 'true' : 'false'} onClick={() => { env = 'build'; tally = 0; beat++; }}>
				Build time
			</button>
			<button type="button" aria-pressed={env === 'test' ? 'true' : 'false'} onClick={() => { env = 'test'; tally = 0; beat++; }}>
				Test
			</button>
		</div>

		<p class="said" aria-live="polite">
			{env === 'browser'
				? 'Browser: render() uses the browser module. Same plan.'
				: env === 'server'
					? 'Server: renderToString() uses the server module. Same plan.'
					: env === 'build'
						? 'Build time: the server module runs during the build. Same plan.'
						: 'Test: render() or renderSSR() in a browser test. Same plan.'}
		</p>

		<div class="surface">
			<div class="lead" aria-hidden="true">
				<span class="feed"><InkArrow width={60} height={54} x1={30} y1={3} x2={28} y2={50} bend={7} seed={21} shown="true" /></span>
				<p class="note same">same three cards, every time</p>
			</div>

			<div class="env" data-for="browser">
				<p class="call"><code>{'await render(App, { target })'}</code></p>
				<p class="via">from <code>@markless/core</code>, using the <b>browser module</b></p>
				<div class="window playground">
					<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
					<button type="button" class="live" onClick={() => tally++}>
						Count {tally}
					</button>
				</div>
				<ul class="inks">
					<li>builds the DOM once, right in the browser</li>
					<li>the plan lives in memory</li>
					<li>no server at all</li>
				</ul>
			</div>

			<div class="env" data-for="server">
				<p class="call"><code>renderToString(App)</code></p>
				<p class="via">or <code>renderToStream()</code>, or a router app, using the <b>server module</b></p>
				<IndexCard label="the HTML that arrives" tilt="0.8deg" pin="pin">
					<pre class="code html"><span class="line"><span class="t">{'<button>'}</span>{'Count 0'}<span class="t">{'</button>'}</span></span><span class="line"><span class="t">{'<script '}</span><span class="a">type</span>{'='}<span class="s">"markless/state"</span><span class="t">{'>'}</span>{'…'}<span class="t">{'</script>'}</span></span><span class="line"><span class="t">{'<script '}</span><span class="a">type</span>{'='}<span class="s">"markless/view"</span><span class="t">{'>'}</span>{'…'}<span class="t">{'</script>'}</span></span></pre>
				</IndexCard>
				<ul class="inks">
					<li>the body ran once, on the server</li>
					<li>the plan travels in the HTML as JSON</li>
					<li>the browser carries on from this HTML and never runs the body</li>
				</ul>
			</div>

			<div class="env" data-for="build">
				<p class="call"><code>MARKLESS_PRERENDER=1</code> <span class="tag">preview</span></p>
				<p class="via">set in the repo's demos, using the <b>server module</b> during the build</p>
				<IndexCard label="dist/index.html" tilt="-0.6deg" pin="pin">
					<pre class="code html"><span class="line"><span class="gone"><span class="t">{'<div '}</span><span class="a">id</span>{'='}<span class="s">"app"</span><span class="t">{'></div>'}</span></span></span><span class="line note swap">{'↑ swapped for the counter’s HTML'}</span></pre>
				</IndexCard>
				<ul class="inks">
					<li>the HTML is written once, at build time</li>
					<li>both records stay out, and the browser rebuilds them</li>
					<li>no public option yet</li>
				</ul>
			</div>

			<div class="env" data-for="test">
				<p class="call"><code>render()</code> and <code>renderSSR()</code></p>
				<p class="via">from <code>@markless/vitest-browser</code></p>
				<IndexCard label="counter.test.ts" tilt="0.6deg" pin="pin">
					<pre class="code"><span class="line"><span class="k">await</span>{' '}<span class="f">render</span>{'(Counter);'}</span><span class="line note says">{'↳ the browser module, in the test browser'}</span><span class="line"><span class="k">await</span>{' '}<span class="f">renderSSR</span>{'(Counter);'}</span><span class="line note says">{'↳ the server module in Node, then the HTML'}</span><span class="line note says">{'   loads into the test browser'}</span></pre>
				</IndexCard>
				<ul class="inks">
					<li>one test file can check both paths</li>
				</ul>
			</div>
		</div>

		<p class="foot">
			The counter under Browser is a real Markless component. The notes describe the place you pick, not
			how this site built this page.
		</p>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.top {
				display: grid;
				grid-template-columns: minmax(0, 17rem) 5.5rem minmax(0, 1fr);
				align-items: center;
				gap: 0.5rem;
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

			.s {
				color: #0a3069;
			}

			.t {
				color: #116329;
			}

			.a {
				color: #0550ae;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.15;
				color: var(--ink);
			}

			.build {
				position: relative;
				display: flex;
				flex-direction: column;
				align-items: center;
			}

			.when {
				color: oklch(55% 0.2 0);
				rotate: -4deg;
				white-space: nowrap;

				html.dark & {
					color: var(--pink);
				}
			}

			.arrow {
				display: block;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.across {
				width: 5.4rem;
				height: 2.4rem;
			}

			.drop {
				display: none;
				width: 3rem;
				height: 3.6rem;
			}

			.plan-title {
				margin: 0 0 0.6rem 0.4rem;
				rotate: -2deg;
			}

			.cards {
				display: grid;
				gap: 0.55rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.card {
				display: grid;
				gap: 0.1rem;
				margin: 0;
				padding: 0.45rem 0.7rem 0.5rem;
				border: 1.5px solid oklch(28% 0.015 90);
				border-radius: 2px;
				color: oklch(28% 0.015 90);
				box-shadow: -2px 3px 0 rgb(51 48 42 / 0.25);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.2;
			}

			.card code {
				font-family: var(--font-mono);
				font-size: 0.85rem;
				font-weight: 700;
				background: none;
				padding: 0;
				border: 0;
				color: inherit;
			}

			.hit {
				position: relative;
				justify-self: start;
			}

			.state-card {
				background: var(--yellow);
				rotate: -1.2deg;
			}

			.text-card {
				--circle-delay: 90ms;
				background: var(--green-soft);
				rotate: 0.8deg;
				margin-left: 0.8rem;
			}

			.click-card {
				--circle-delay: 180ms;
				background: color-mix(in oklch, var(--purple) 70%, white);
				rotate: -0.6deg;
			}

			.pick {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				justify-content: center;
				gap: 0.5rem;
				margin: var(--space-m) 0 0.4rem;
			}

			.pick-label {
				rotate: -3deg;
				margin-right: 0.3rem;
			}

			.pick button {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				padding: 0.35em 0.85em;
				color: var(--ink);
				background: transparent;
				border: 2px solid var(--ink);
				border-radius: 999px 860px 920px 780px / 780px 920px 860px 999px;
				cursor: pointer;
			}

			.pick button[aria-pressed='true'] {
				background: var(--yellow);
				color: oklch(28% 0.015 90);
				box-shadow: 2px 2px 0 var(--ink);
			}

			.pick button:focus-visible,
			.live:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.said {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.surface {
				margin: 0 auto;
				max-width: 30rem;
			}

			.lead {
				display: flex;
				justify-content: center;
				align-items: center;
				gap: 0.6rem;
				margin: 0 0 0.6rem 3.2rem;
			}

			.feed {
				flex: none;
				width: 2.6rem;
				height: 2.9rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.same {
				rotate: -3deg;
				color: oklch(55% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			.env {
				display: none;
				gap: 0.7rem;
			}

			.plan-anywhere[data-env='browser'] .env[data-for='browser'],
			.plan-anywhere[data-env='server'] .env[data-for='server'],
			.plan-anywhere[data-env='build'] .env[data-for='build'],
			.plan-anywhere[data-env='test'] .env[data-for='test'] {
				display: grid;
			}

			.call {
				margin: 0;
				text-align: center;
			}

			.call code {
				font-size: var(--step-0);
			}

			.tag {
				display: inline-block;
				margin-left: 0.3rem;
				padding: 0 0.45rem;
				border: 1.5px solid var(--ink);
				border-radius: 999px;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				rotate: 3deg;
			}

			.via {
				margin: -0.3rem 0 0.4rem;
				text-align: center;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
			}

			.via b {
				white-space: nowrap;
				background: color-mix(in oklch, var(--yellow) 70%, transparent);
				color: oklch(28% 0.015 90);
				padding: 0 0.2em;
			}

			.window {
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
				color: color-mix(in oklch, var(--ink) 70%, var(--paper));
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

			.html .line {
				white-space: pre-wrap;
			}

			.gone {
				position: relative;
				display: inline-block;
				text-decoration: line-through;
				text-decoration-color: oklch(55% 0.2 0);
			}

			.swap,
			.says {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: oklch(48% 0.2 0);
				white-space: pre;
			}

			.inks {
				display: grid;
				gap: 0.25rem;
				margin: 0.5rem 0 0;
				padding: 0;
				list-style: none;
			}

			.inks li {
				margin: 0;
				padding-left: 1.4rem;
				position: relative;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.25;
				color: var(--ink);
			}

			.inks li::before {
				content: '✓';
				position: absolute;
				left: 0.1rem;
				color: oklch(55% 0.17 148);
				font-weight: 700;

				html.dark & {
					color: var(--green-star);
				}
			}

			.foot {
				margin: var(--space-s) 0 0;
				font-size: var(--step--1);
				line-height: 1.4;
				color: color-mix(in oklch, var(--ink) 75%, var(--paper));
			}

			@container (max-width: 38rem) {
				.top {
					grid-template-columns: minmax(0, 1fr);
					justify-items: stretch;
					gap: 0.3rem;
					padding-left: 0;
				}

				.build {
					flex-direction: row;
					justify-content: center;
					gap: 0.4rem;
				}

				.across {
					display: none;
				}

				.drop {
					display: block;
				}

				.plan {
					padding: 0 0.6rem;
				}

				.lead {
					margin-left: 0;
				}
			}
		</style>
	</figure>
}
