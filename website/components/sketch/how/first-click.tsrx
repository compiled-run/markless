import { state } from '@markless/core';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import Ask from './ask.tsrx';

export default function FirstClick() @{
	let path = state('direct');
	let clicks = state(0);

	<figure class="sketch first-click" data-path={path} data-clicked={clicks === 0 ? 'no' : clicks === 1 ? 'once' : 'more'}>
		<Ask question="Who hears the first click?" hint="Pick a path, then press the counter. The notes follow that path." />

		<div class="pick" role="group" aria-label="How the counter got on the page">
			<button type="button" aria-pressed={path === 'direct' ? 'true' : 'false'} onClick={() => { path = 'direct'; clicks = 0; }}>
				Browser, direct module
			</button>
			<button type="button" aria-pressed={path === 'general' ? 'true' : 'false'} onClick={() => { path = 'general'; clicks = 0; }}>
				Browser, general path
			</button>
			<button type="button" aria-pressed={path === 'server' ? 'true' : 'false'} onClick={() => { path = 'server'; clicks = 0; }}>
				Server-rendered page
			</button>
		</div>

		<div class="board">
			<div class="page-side">
				<p class="call note">
					{path === 'direct'
						? 'render(Counter, { target }), simple component'
						: path === 'general'
							? 'render(App, { target }), with props or a computed()'
							: 'renderToString(), then the HTML arrives'}
				</p>
				<div class="window playground">
					<p class="strip" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>
					<div class="container">
						<span class="hit tagline" aria-hidden="true">{path === 'direct' ? 'the mount target' : path === 'general' ? 'the container: the root render() mounted' : '<div data-async-container>'}<MarkerCircle beat={path === 'direct' ? 'rest' : path === 'general' ? 'odd' : 'even'} tone="purple" /></span>
						<span class="hit">
							<button type="button" class="live" onClick={() => clicks++}>
								Count {clicks}
							</button>
							<MarkerCircle beat={path === 'direct' ? 'odd' : 'rest'} tone="purple" />
						</span>
						<span class="script" aria-hidden="true">{'<script data-async-resumer>'}</span>
					</div>
				</div>
				<p class="who note" aria-hidden="true">
					{path === 'direct'
						? '↑ a click listener on the button itself'
						: path === 'general'
							? '↑ one capture listener per event name, on the container'
							: '↑ the inline resumer: one capture listener per event name, on the container'}
				</p>
			</div>

			<div class="runs-side">
				<p class="runs-title note">{clicks === 0 ? 'no click code has run yet' : 'what ran when you pressed'}</p>

				<ol class="steps" data-for="direct">
					<li><span class="tag">listens</span> the button's own listener asks for <code>symbol:0</code> by ID</li>
					<li><span class="tag">imports</span> <code>symbol:0</code> once, then keeps it</li>
					<li><span class="hit"><span class="tag">runs</span> <code>count++</code> on the small <code>Map</code> graph<MarkerSweep beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} place="" /></span></li>
					<li><span class="tag">writes</span> each text slot is read again, and <code>Count {clicks}</code> is written</li>
				</ol>

				<ol class="steps" data-for="general">
					<li><span class="tag">listens</span> the container's listener walks up from the button</li>
					<li><span class="tag">finds</span> <code>h0</code> plus <code>click</code> in the view record, held in memory</li>
					<li><span class="tag">builds</span> the state graph and starts the full runtime</li>
					<li><span class="hit"><span class="tag">runs</span> <code>symbol:0</code> loads and runs <code>count++</code><MarkerSweep beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} place="" /></span></li>
					<li><span class="tag">writes</span> the text that reads <code>count</code>: <code>Count {clicks}</code></li>
				</ol>

				<ol class="steps" data-for="server">
					<li><span class="tag">listens</span> the inline resumer matches <code>h0</code> plus <code>click</code></li>
					<li><span class="tag">imports</span> the resume module and passes the event on</li>
					<li><span class="tag">picks</span> this counter's records were all replaced with specialized code, so that code runs</li>
					<li><span class="hit"><span class="tag">runs</span> <code>count++</code><MarkerSweep beat={clicks === 0 ? 'rest' : clicks % 2 === 0 ? 'even' : 'odd'} place="" /></span></li>
					<li><span class="tag">writes</span> the text that reads <code>count</code>: <code>Count {clicks}</code></li>
				</ol>

				<p class="later note">
					{path === 'direct'
						? 'Next press: no import. symbol:0 is already kept.'
						: path === 'general'
							? 'Next press: the runtime is already running.'
							: 'Next press: the resume module is already imported.'}
				</p>

				<p class="never note">
					{path === 'direct'
						? 'Never ran: the full runtime.'
						: path === 'general'
							? 'Never ran: the component body, again.'
							: 'Never ran in this browser: the component body. For this counter, the full runtime never starts either.'}
				</p>
			</div>
		</div>

		<p class="said" aria-live="polite">
			{clicks === 0
				? ''
				: path === 'direct'
					? 'The button listener imported symbol:0 and wrote the new count.'
					: path === 'general'
						? 'The container listener started the full runtime, which ran symbol:0.'
						: 'The inline resumer imported the resume module, which ran the specialized code.'}
		</p>

		<p class="foot">
			The button is a real Markless counter, but this site always serves it the same way. The notes trace the
			path you pick. A plain counter mounted with render() gets a direct module. The general path is what a component with props, child components, a scoped style or a
			computed() gets.
		</p>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.25;
				color: var(--ink);
			}

			.pick {
				display: flex;
				flex-wrap: wrap;
				justify-content: center;
				gap: 0.5rem;
				margin: 0 0 var(--space-m);
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

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
				gap: 2rem;
				align-items: start;
			}

			.call {
				margin: 0 0 0.5rem;
				font-family: var(--font-mono);
				font-size: 0.8rem;
				color: var(--ink);
			}

			.window {
				margin: 0;
				gap: 0.5rem;
				align-items: stretch;
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

			.container {
				position: relative;
				display: grid;
				justify-items: start;
				gap: 0.6rem;
				padding: 0.6rem 0.8rem 0.8rem;
				border: 2px dashed color-mix(in oklch, var(--ink) 50%, transparent);
				border-radius: 4px;
			}

			.first-click:not([data-path='direct']) .container {
				border: 2.5px solid var(--purple);
			}

			.tagline,
			.script {
				font-family: var(--font-mono);
				font-size: 0.72rem;
				color: color-mix(in oklch, var(--ink) 70%, var(--paper));
			}

			.script {
				display: none;
				padding: 0.1rem 0.4rem;
				border-radius: 2px;
				background: color-mix(in oklch, var(--yellow) 55%, transparent);
				color: var(--ink);
			}

			.first-click[data-path='server'] .script {
				display: inline-block;
			}

			.hit {
				position: relative;
				display: inline-block;
			}

			.live {
				margin: 0;
			}

			.who {
				margin: 0.6rem 0 0 0.4rem;
				rotate: -1.5deg;
				color: oklch(48% 0.2 310);

				html.dark & {
					color: var(--purple);
				}
			}

			.runs-title {
				margin: 0 0 0.5rem;
				font-size: var(--step-1);
				rotate: -1.5deg;
			}

			.steps {
				display: none;
				gap: 0.45rem;
				margin: 0;
				padding: 0;
				list-style: none;
				counter-reset: step;
			}

			.first-click[data-path='direct'] .steps[data-for='direct'],
			.first-click[data-path='general'] .steps[data-for='general'],
			.first-click[data-path='server'] .steps[data-for='server'] {
				display: grid;
			}

			.steps li {
				margin: 0;
				font-size: var(--step--1);
				line-height: 1.4;
				opacity: 0.3;
				transition: opacity 260ms ease;
			}

			.first-click:not([data-clicked='no']) .steps li {
				opacity: 1;
			}

			.steps li:nth-child(2) {
				transition-delay: 120ms;
			}

			.steps li:nth-child(3) {
				transition-delay: 240ms;
			}

			.steps li:nth-child(4) {
				transition-delay: 360ms;
			}

			.steps li:nth-child(5) {
				transition-delay: 480ms;
			}

			.steps .tag {
				display: inline-block;
				min-width: 4.6rem;
				margin-right: 0.3rem;
				padding: 0 0.4rem;
				border: 1.5px solid var(--ink);
				border-radius: 999px;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				text-align: center;
			}

			.later {
				display: none;
			}

			.later,
			.never {
				margin-top: 0.8rem;
				rotate: -1deg;
				color: oklch(48% 0.2 0);

				html.dark & {
					color: var(--pink);
				}
			}

			.never {
				visibility: hidden;
			}

			.first-click[data-clicked='more'] .later {
				display: block;
			}

			.first-click:not([data-clicked='no']) .never {
				visibility: visible;
			}

			.said {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.foot {
				margin: var(--space-s) 0 0;
				font-size: var(--step--1);
				line-height: 1.4;
				color: color-mix(in oklch, var(--ink) 75%, var(--paper));
			}

			@media (prefers-reduced-motion: reduce) {
				.steps li {
					transition: none;
				}
			}

			@container (max-width: 38rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					gap: 1.4rem;
				}
			}
		</style>
	</figure>
}
