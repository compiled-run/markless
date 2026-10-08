import { state } from '@markless/core';
import PreviewCard, { Action, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import BrowserFrame from '../../docs/browser-frame.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { browserOnly } from './code-panes.ts';

export default function RenderIntoApp() @{
	let ran = state(false);
	let clicks = state(0);

	<PreviewCard name="render-into-app" label="render() fills the empty #app">
		<Controls title="What does render() do?">
			<span class="acts">
			<Action disabled={ran} onClick={() => (ran = true)}>Run main.ts</Action>
			<Action
				disabled={!ran}
				onClick={() => {
					ran = false;
					clicks = 0;
				}}
			>
				Start over
			</Action>
			</span>
		</Controls>
		<Stage>
			<div class="board" data-ran={ran ? 'yes' : 'no'}>
				<div class="box">
					<div class="head">src/main.ts</div>
					<div class="code">
						<span class="line">{"const target = document.querySelector('#app');"}</span>
						<span class="line">{'await '}<span class="call">{'render(App, { target })'}</span>;</span>
					</div>
				</div>
				<BrowserFrame address="my-app.dev">
					<div class="sheet">
						<span class="tag">{'<div id="app">'}</span>
						<div class="app">
							<span class="empty">empty</span>
							<button type="button" class="count" hidden={!ran} onClick={() => clicks++}>Count {clicks}</button>
						</div>
						<span class="tag">{'</div>'}</span>
					</div>
				</BrowserFrame>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				<span hidden={ran}>
					Nothing has run yet. <Mono>index.html</Mono> has one empty div.
				</span>
				<span hidden={!ran}>
					<Mono>render()</Mono> ran App once and put its button in <Mono>#app</Mono>.
					{clicks === 0 ? ' Click it.' : ` Click ${clicks} changed only the number.`}
				</span>
			</span>
		</Watch>
		<Code files={browserOnly} />
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.acts {
				display: inline-flex;
				gap: 0.6em;
				margin-inline-start: auto;
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
				gap: 1.25em;
				align-items: center;
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

			.code {
				padding: 0.6em 0;
				overflow-x: auto;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
			}

			.line {
				display: block;
				padding-inline: calc(0.85em + 4ch) 0.85em;
				text-indent: -4ch;
				white-space: pre-wrap;
				font-family: var(--font-mono);
			}

			.call {
				padding: 0 0.1em;
				border-radius: 3px;
				font-family: var(--font-mono);
				transition: background 140ms ease;
			}

			.board[data-ran='yes'] .call {
				background: var(--mark);
			}

			.sheet {
				display: grid;
				gap: 0.4em;
				padding: 0.7em 0.85em 0.8em;
			}

			.tag {
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.app {
				display: grid;
				place-items: center;
				min-height: 4.5em;
				border: 1px dashed var(--ink);
				border-radius: 6px;
				transition: background 140ms ease;
			}

			.board[data-ran='yes'] .app {
				background: var(--mark);
			}

			.empty {
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.board[data-ran='yes'] .empty {
				display: none;
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

			.count[hidden] {
				display: none;
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

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.call,
				.app,
				.count {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
