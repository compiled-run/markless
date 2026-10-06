// "What is in the server's HTML?": the real renderToString() response for the
// counter on an index card; pressing a line circles it and explains it.
import { state } from '@markless/core';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import Ask from './ask.tsrx';

export default function PayloadCard() @{
	let part = state(4);

	<figure class="sketch payload-card">
		<Ask question="What is in the server's HTML?" hint="Press a line on the card. A marker note explains it." />

		<p class="note scope"><span class="tag">one environment</span> a server render. In the browser alone, render() writes none of this.</p>

		<div class="board">
			<IndexCard label="renderToString(Counter)" tilt="-0.6deg">
				<div class="html" role="group" aria-label="Lines of the server response">
					<button type="button" class="ln" aria-label="The link" aria-pressed={part === 1 ? 'true' : 'false'} onClick={() => (part = 1)}>
						<span class="t">{'<link '}</span><span class="hit"><span class="a">rel</span>{'='}<span class="s">"modulepreload"</span><MarkerCircle beat={part === 1 ? 'odd' : 'rest'} /></span>{' '}<span class="a">href</span>{'='}<span class="s">"/build/chunk--CpAagRl.js"</span>{' …'}<span class="t">{'>'}</span>
					</button>
					<button type="button" class="ln" aria-label="The early-event script" aria-pressed={part === 2 ? 'true' : 'false'} onClick={() => (part = 2)}>
						<span class="t">{'<script>'}</span>{'(function '}<span class="hit"><span class="f">captureEarlyEvents</span><MarkerCircle beat={part === 2 ? 'odd' : 'rest'} /></span>{'(eventNames) { … })(["click"]);'}<span class="t">{'</script>'}</span>
					</button>
					<button type="button" class="ln" aria-label="The container div" aria-pressed={part === 3 ? 'true' : 'false'} onClick={() => (part = 3)}>
						<span class="t">{'<div '}</span><span class="hit"><span class="a">data-async-container</span><MarkerCircle beat={part === 3 ? 'odd' : 'rest'} /></span><span class="t">{'>'}</span>
					</button>
					<button type="button" class="ln in" aria-label="The button" aria-pressed={part === 4 ? 'true' : 'false'} onClick={() => (part = 4)}>
						<span class="hit"><span class="t">{'<button>'}</span><MarkerCircle beat={part === 4 ? 'odd' : 'rest'} /></span>{'Count 0'}<span class="t">{'</button>'}</span>
					</button>
					<button type="button" class="ln in" aria-label="The state script" aria-pressed={part === 5 ? 'true' : 'false'} onClick={() => (part = 5)}>
						<span class="t">{'<script '}</span><span class="a">type</span>{'='}<span class="s">"markless/state"</span><span class="t">{'>'}</span>{'{"version":1,"cells":[{"graphNodeId":"state:count","name":"count","valueKind":"scalar","value":{"version":1,'}<span class="hit">{'"root":0'}<MarkerCircle beat={part === 5 ? 'odd' : 'rest'} /></span>{',"records":[]}}],"computed":[],"sharedDefinitions":[]}'}<span class="t">{'</script>'}</span>
					</button>
					<button type="button" class="ln in" aria-label="The view script" aria-pressed={part === 6 ? 'true' : 'false'} onClick={() => (part = 6)}>
						<span class="t">{'<script '}</span><span class="a">type</span>{'='}<span class="s">"markless/view"</span><span class="t">{'>'}</span>{'{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order",'}<span class="hit">{'"index":1'}<MarkerCircle beat={part === 6 ? 'odd' : 'rest'} /></span>{',"tagName":"button"}],"events":[{"hostNodeId":"h0","eventName":"click","symbolIds":["symbol:0"]}],"domUpdates":[ … "symbolId":"symbol:1"}], … }'}<span class="t">{'</script>'}</span>
					</button>
					<button type="button" class="ln in" aria-label="The inline resumer" aria-pressed={part === 7 ? 'true' : 'false'} onClick={() => (part = 7)}>
						<span class="t">{'<script '}</span><span class="hit"><span class="a">data-async-resumer</span><MarkerCircle beat={part === 7 ? 'odd' : 'rest'} /></span>{' '}<span class="a">data-markless-resume-module</span>{'='}<span class="s">"/build/chunk--CpAagRl.js"</span><span class="t">{'>'}</span>{'(function(e){ … })(e=>import(e));'}<span class="t">{'</script>'}</span>
					</button>
					<span class="ln end"><span class="t">{'</div>'}</span></span>
				</div>
			</IndexCard>

			<div class="explain">
				<span class="arrow" aria-hidden="true"><InkArrow width={70} height={46} x1={66} y1={6} x2={6} y2={38} bend={-10} seed={13} shown="true" /></span>
				<p class="say" aria-live="polite">
					{part === 1
						? 'The link lets the browser fetch the resume module early. Fetching it does not run it.'
						: part === 2
							? 'This script records events that fire while the document is still loading. The resumer replays them later.'
							: part === 3
								? 'The container marks the part of the page this render owns. The resumer counts it as element 0.'
								: part === 4
									? 'No onclick, no event attribute at all. The click lives only in the view record.'
									: part === 5
										? 'The state. root holds the number 0 itself. An object or an array would go into records.'
										: part === 6
											? 'Locators, events and text updates. The index is 1 because the container div is element 0.'
											: 'The inline resumer. It listens for the first interaction, then imports the resume module.'}
				</p>
			</div>
		</div>

		<p class="foot">This is the real response for the counter. I cut the script bodies and the middle of the view record to …</p>

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

			.scope {
				margin: 0 0 var(--space-m);
				text-align: center;
				text-wrap: balance;
			}

			.tag {
				display: inline-block;
				margin-right: 0.35rem;
				padding: 0 0.5rem;
				border: 1.5px solid var(--ink);
				border-radius: 999px;
				background: var(--yellow);
				color: oklch(28% 0.015 90);
				rotate: -2deg;
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) 13rem;
				gap: 1.4rem;
				align-items: center;
				padding-left: 0.4rem;
			}

			.html {
				display: grid;
				font-family: var(--font-mono);
				font-size: 0.74rem;
				line-height: 1.5rem;
			}

			.ln {
				position: relative;
				display: block;
				width: 100%;
				margin: 0;
				padding: 0 0.3rem;
				border: 0;
				border-radius: 2px;
				background: none;
				font: inherit;
				line-height: inherit;
				text-align: left;
				color: oklch(28% 0.015 90);
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				cursor: pointer;
			}

			.ln.in {
				padding-left: 1.3rem;
			}

			.ln:hover {
				background: color-mix(in oklch, var(--yellow) 22%, transparent);
			}

			.ln:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 1px;
			}

			.end {
				cursor: default;
			}

			.ln[aria-pressed='true'] {
				background: color-mix(in oklch, var(--yellow) 55%, transparent);
			}

			.hit {
				position: relative;
				z-index: 1;
				display: inline-block;
			}

			.t {
				color: #116329;
			}

			.a {
				color: #0550ae;
			}

			.s {
				color: #0a3069;
			}

			.f {
				color: #6639ba;
			}

			.explain {
				position: relative;
				padding-top: 2.6rem;
			}

			.arrow {
				position: absolute;
				top: 0;
				left: -0.6rem;
				width: 4.2rem;
				height: 2.6rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.say {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				line-height: 1.25;
				color: oklch(48% 0.2 0);
				rotate: -1.5deg;

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

			@container (max-width: 38rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					gap: 0.6rem;
					padding-left: 0;
				}

				.explain {
					padding: 2.4rem 0.4rem 0;
				}

				.arrow {
					left: 40%;
					rotate: 60deg;
				}
			}
		</style>
	</figure>
}
