import { state } from '@markless/core';
import BrowserFrame from '../../docs/browser-frame.tsrx';
import PreviewCard, { Action, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function WhatMarklessNoted() @{
	let clicks = state(0);

	<PreviewCard name="what-markless-noted" label="What Markless wrote down about the counter">
		<Controls title="What did Markless write down?">
			<Action end disabled={clicks === 0} onClick={() => (clicks = 0)}>Reset</Action>
		</Controls>
		<Stage>
			<div class="board" data-used={clicks > 0 ? 'yes' : 'no'}>
				<div class="box">
					<div class="head">counter.tsrx</div>
					<div class="code">
						<span class="line">{"import { state } from '@markless/core';"}</span>
						<span class="line"> </span>
						<span class="line">{'export default function Counter() @{'}</span>
						<span class="line">{'\tlet count = state(0);'}</span>
						<span class="line"> </span>
						<span class="line">{'\t<button onClick={() => '}<span class="tok click">count++</span>{'}>'}</span>
						<span class="line">{'\t\tCount '}<span class="tok text">{'{count}'}</span></span>
						<span class="line">{'\t</button>'}</span>
						<span class="line">{'}'}</span>
					</div>
				</div>
				<div class="side">
					<div class="box notes">
						<div class="head">Markless wrote down</div>
						<ol>
							<li class="note text"><Mono>{'{count}'}</Mono> is part of the button text</li>
							<li class="note click">a click runs <Mono>count++</Mono></li>
						</ol>
					</div>
					<BrowserFrame address="my-app.dev">
						<div class="page">
							<button type="button" class="count" onClick={() => clicks++}>
								Count <span class="num">{clicks}</span>
							</button>
						</div>
					</BrowserFrame>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said" hidden={clicks !== 0}>
				Markless wrote both notes before the page ran. Click <b>Count</b> to see them used.
			</span>
			<span class="said" hidden={clicks === 0}>
				Click {clicks} ran <Mono>count++</Mono>. One piece of text changed: the number.
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
				gap: 1.25em;
				align-items: start;
				width: 100%;
			}

			.box {
				box-sizing: border-box;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
			}

			.head {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.notes .head {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.code {
				padding: 0.6em 0;
				overflow-x: auto;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
				tab-size: 2;
			}

			.line {
				display: block;
				min-height: 1lh;
				padding-inline: 0.85em;
				white-space: pre-wrap;
				font-family: var(--font-mono);
			}

			.tok {
				padding: 0 0.1em;
				border-radius: 3px;
				font-family: var(--font-mono);
				transition: background 140ms ease;
			}

			.side {
				display: grid;
				gap: 1.25em;
				justify-items: start;
			}

			.notes {
				width: 100%;
			}

			ol {
				display: grid;
				gap: 0.4em;
				margin: 0;
				padding: 0.6em 0.85em 0.7em 2.1em;
			}

			.note {
				margin: 0;
				padding: 0.1em 0.3em;
				border-radius: 4px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				transition: background 140ms ease;
			}

			.board[data-used='yes'] .text {
				background: var(--mark);
			}

			.board[data-used='yes'] .click {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.page {
				display: grid;
				padding: 0.9em 1em 1em;
				gap: 0.4em;
				justify-items: start;
			}

			.count {
				padding: 0.5em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.count:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.count:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.count:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.num {
				display: inline-block;
				min-width: 1ch;
				padding: 0 0.15em;
				border-radius: 3px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.board[data-used='yes'] .num {
				background: var(--mark);
			}

			b {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.tok,
				.note,
				.count {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
