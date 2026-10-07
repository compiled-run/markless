// "One plan, three hosts" as a zine page: the counter plan on an index card,
// fanned out to a browser, a phone and a Mac drawn by hand. Each host keeps its
// own count, the way three separate apps would.
import { computed, state } from '@markless/core';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import RoughBox from './rough-box.tsrx';

export default function NativeHostsSketch() @{
	let web = state(0);
	let ios = state(0);
	let mac = state(0);
	let taps = state(0);
	let lastHost = state('none');
	const beat = computed(() => (taps % 2 === 0 ? 'even' : 'odd'));
	const webBeat = computed(() => (lastHost === 'web' ? beat : 'rest'));
	const iosBeat = computed(() => (lastHost === 'ios' ? beat : 'rest'));
	const macBeat = computed(() => (lastHost === 'mac' ? beat : 'rest'));

	<figure class="sketch">
		<figcaption>
			<span class="ask">One plan, three hosts</span>
			<svg class="underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
				<path d="M3 9.5 C 60 5.2 120 10.8 180 7.4 C 225 5 262 8.6 297 6.2" />
			</svg>
		</figcaption>

		<div class="plan">
			<IndexCard label="the counter plan" tilt="-1deg">
				<ul class="facts">
					<li><span class="k">state:count</span> = 0</li>
					<li><span class="k">onClick</span> → activate</li>
					<li>button text: <span class="s">Count {'${value}'}</span></li>
					<li><span class="k">symbol:counter.increment</span></li>
				</ul>
			</IndexCard>
		</div>

		<div class="fan" aria-hidden="true">
			<span class="arrow left"><InkArrow width={120} height={70} x1={112} y1={4} x2={14} y2={64} bend={-10} seed={3} shown="true" /></span>
			<span class="arrow mid"><InkArrow width={40} height={70} x1={20} y1={4} x2={21} y2={64} bend={4} seed={9} shown="true" /></span>
			<span class="arrow right"><InkArrow width={120} height={70} x1={8} y1={4} x2={106} y2={64} bend={10} seed={17} shown="true" /></span>
		</div>

		<div class="hosts">
			<div role="group" class="host web" aria-label="Browser">
				<p class="via">compiled by Markless</p>
				<div class="screen browser">
					<RoughBox shape="a" />
					<p class="bar" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>browser DOM</p>
					<button
						type="button"
						class="dom-button"
						data-act="web"
						aria-label={'Browser button: Count ' + web}
						onClick={() => {
							web++;
							lastHost = 'web';
							taps++;
						}}
					>
						<span class="hit">Count {web}<MarkerSweep beat={webBeat} place="" /></span>
					</button>
					<p class="kind" aria-hidden="true">{'<button>'}</p>
				</div>
				<p class="event"><span class="hit ev">click<MarkerCircle beat={webBeat} tone="green" /></span></p>
				<p class="sticky real">What Markless ships today. It runs the compiler's own output, not the plan card.</p>
			</div>

			<div role="group" class="host ios" aria-label="iOS proof">
				<p class="via">hand-written artifact.json</p>
				<div class="screen phone">
					<RoughBox shape="b" />
					<span class="notch" aria-hidden="true"></span>
					<p class="heading">Markless iOS Proof</p>
					<button
						type="button"
						class="ui-button"
						data-act="ios"
						aria-label={'Drawn iOS UIButton: Count ' + ios}
						onClick={() => {
							ios++;
							lastHost = 'ios';
							taps++;
						}}
					>
						<span class="hit">Count {ios}<MarkerSweep beat={iosBeat} tone="pink" place="" /></span>
					</button>
					<p class="kind" aria-hidden="true">UIButton</p>
				</div>
				<p class="event"><span class="hit ev">touchUpInside<MarkerCircle beat={iosBeat} /></span></p>
				<p class="sticky proof">Hand-written proof. No Markless package writes this plan yet.</p>
			</div>

			<div role="group" class="host mac" aria-label="macOS proof">
				<p class="via">hand-written artifact.json</p>
				<div class="screen window">
					<RoughBox shape="c" />
					<p class="bar" aria-hidden="true"><span class="dots lights"><i></i><i></i><i></i></span></p>
					<p class="heading">Markless macOS Proof</p>
					<button
						type="button"
						class="ns-button"
						data-act="mac"
						aria-label={'Drawn macOS NSButton: Count ' + mac}
						onClick={() => {
							mac++;
							lastHost = 'mac';
							taps++;
						}}
					>
						<span class="hit">Count {mac}<MarkerSweep beat={macBeat} tone="purple" place="" /></span>
					</button>
					<p class="kind" aria-hidden="true">NSButton</p>
				</div>
				<p class="event"><span class="hit ev">action<MarkerCircle beat={macBeat} tone="purple" /></span></p>
				<p class="sticky proof">Hand-written proof. A Swift runtime runs the symbol in JavaScriptCore.</p>
			</div>
		</div>

		<p class="say" aria-live="polite">
			{lastHost === 'web'
				? 'Browser: the DOM click event ran count++, and the button text changed to Count ' + web + '.'
				: lastHost === 'ios'
					? 'iOS proof: touchUpInside runs symbol:counter.increment, then the runtime reads every text binding again. Title: Count ' + ios + '.'
					: lastHost === 'mac'
						? 'macOS proof: action runs symbol:counter.increment, then the runtime reads every text binding again. Title: Count ' + mac + '.'
						: 'Press each button. Same plan, a different event name on each host.'}
		</p>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0 0.4rem;
				color: var(--ink);
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

			.plan {
				width: min(100%, 19rem);
				margin: 1rem auto 0;
			}

			.facts {
				margin: 0;
				padding: 0;
				list-style: none;
				font-family: var(--font-mono);
				font-size: 0.76rem;
				line-height: 1.5rem;
			}

			.facts li {
				margin: 0;
				padding: 0;
			}

			.k {
				color: #6639ba;
			}

			.s {
				color: #0a3069;
			}

			.fan {
				position: relative;
				height: 4.4rem;
				margin: 0.4rem auto 0;
				width: min(100%, 34rem);
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.arrow {
				position: absolute;
				top: 0;
				height: 100%;
			}

			.left {
				left: 6%;
				width: 32%;
			}

			.mid {
				left: calc(50% - 1.25rem);
				width: 2.5rem;
			}

			.right {
				right: 6%;
				width: 32%;
			}

			.hosts {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 1.4rem;
				align-items: start;
			}

			.host {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.5rem;
				margin: 0;
			}

			.via {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--muted-ink);
				text-align: center;
			}

			.screen {
				position: relative;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.6rem;
				width: 100%;
				min-height: 11rem;
				padding: 0.6rem 0.7rem 0.8rem;
				box-sizing: border-box;
				--box-fill: var(--raised);
				--box-weight: 2;
			}

			.bar {
				position: relative;
				align-self: stretch;
				display: flex;
				align-items: center;
				gap: 0.45rem;
				margin: 0;
				padding-bottom: 0.35rem;
				border-bottom: 1.5px dashed color-mix(in oklch, var(--ink) 40%, transparent);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--muted-ink);
				min-height: 1.4rem;
			}

			.dots {
				display: inline-flex;
				gap: 0.22rem;
			}

			.dots i {
				width: 0.5rem;
				height: 0.5rem;
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

			.heading {
				position: relative;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				font-weight: 700;
				text-align: center;
				line-height: 1.15;
			}

			.phone {
				width: min(100%, 9.5rem);
				min-height: 13rem;
				padding-top: 1.5rem;
				justify-content: flex-start;
			}

			.phone .heading {
				font-size: var(--step--1);
			}

			.notch {
				position: absolute;
				top: 0.55rem;
				left: 50%;
				width: 2.6rem;
				height: 0.55rem;
				translate: -50% 0;
				border-radius: 1rem;
				background: var(--ink);
			}

			button {
				position: relative;
				cursor: pointer;
				font: inherit;
			}

			button:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.hit {
				position: relative;
				display: inline-block;
			}

			.dom-button {
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
			}

			.dom-button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}

			.ui-button {
				font-family: system-ui, sans-serif;
				font-size: 0.95rem;
				padding: 0.45em 1.1em;
				color: #fff;
				background: oklch(58% 0.19 255);
				border: 1.5px solid var(--ink);
				border-radius: 0.8rem;
			}

			.ns-button {
				font-family: system-ui, sans-serif;
				font-size: 0.9rem;
				padding: 0.2em 1em;
				color: oklch(25% 0 0);
				background: linear-gradient(oklch(99% 0 0), oklch(93% 0 0));
				border: 1.5px solid var(--ink);
				border-radius: 0.35rem;
			}

			.ui-button:active,
			.ns-button:active {
				filter: brightness(0.9);
			}

			.kind {
				position: relative;
				margin: auto 0 0;
				font-family: var(--font-mono);
				font-size: 0.72rem;
				color: var(--muted-ink);
			}

			.window .bar {
				min-height: 1.1rem;
			}

			.lights i:nth-child(1) {
				background: oklch(68% 0.2 25);
			}

			.lights i:nth-child(2) {
				background: oklch(83% 0.16 85);
			}

			.lights i:nth-child(3) {
				background: oklch(75% 0.17 145);
			}

			.event {
				margin: 0.2rem 0 0;
				font-family: var(--font-mono);
				font-size: 0.82rem;
				font-weight: 600;
			}

			.ev {
				padding: 0 0.15rem;
			}

			.sticky {
				margin: 0.3rem 0 0;
				padding: 0.55rem 0.7rem;
				max-width: 12rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.2;
				color: oklch(28% 0.015 90);
				box-shadow: -2px 4px 6px rgb(0 0 0 / 0.18);
			}

			.real {
				background: color-mix(in oklch, var(--green-star) 55%, #fff);
				rotate: 1.5deg;
			}

			.proof {
				background: color-mix(in oklch, var(--yellow) 80%, #fff);
				rotate: -2deg;
			}

			.mac .proof {
				rotate: 2.5deg;
			}

			.say {
				margin: var(--space-m) 0 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.25;
			}

			@container (max-width: 40rem) {
				.ask {
					font-size: var(--step-1);
				}

				.fan .left,
				.fan .right {
					display: none;
				}

				.fan {
					height: 3rem;
				}

				.hosts {
					grid-template-columns: minmax(0, 1fr);
					gap: 2rem;
				}

				.host {
					display: grid;
					grid-template-columns: minmax(0, 1fr) minmax(0, 9rem);
					grid-template-areas:
						'via via'
						'screen sticky'
						'event sticky';
					column-gap: 1rem;
					row-gap: 0.4rem;
					align-items: start;
					justify-items: center;
				}

				.via {
					grid-area: via;
				}

				.screen {
					grid-area: screen;
					min-height: 0;
				}

				.phone {
					min-height: 11rem;
				}

				.event {
					grid-area: event;
				}

				.sticky {
					grid-area: sticky;
					margin-top: 0.8rem;
				}
			}
		</style>
	</figure>
}
