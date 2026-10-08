import { state } from '@markless/core';
import BrowserFrame from '../../docs/browser-frame.tsrx';
import PreviewCard, { Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

// Each code line is a fixed button: a handler on a repeated item stops after the first change.
export default function LineToPart() @{
	let part = state('state');
	let clicks = state(0);

	<PreviewCard name="line-to-part" label="Which line made which part of the button">
		<Controls title="Which line made which part?" />
		<Stage>
			<div class="board" data-part={part}>
				<div class="box">
					<div class="head">counter.tsrx</div>
					<div class="code" role="group" aria-label="Lines of counter.tsrx">
						<button type="button" class="line" data-line="import" aria-pressed={part === 'import' ? 'true' : 'false'} onClick={() => (part = 'import')}>{"import { state } from '@markless/core';"}</button>
						<span class="line plain" aria-hidden="true"> </span>
						<button type="button" class="line" data-line="body" aria-pressed={part === 'body' ? 'true' : 'false'} onClick={() => (part = 'body')}>{'export default function Counter() @{'}</button>
						<button type="button" class="line" data-line="state" aria-pressed={part === 'state' ? 'true' : 'false'} onClick={() => (part = 'state')}>{'\tlet count = state(0);'}</button>
						<span class="line plain" aria-hidden="true"> </span>
						<button type="button" class="line" data-line="markup" aria-pressed={part === 'markup' ? 'true' : 'false'} onClick={() => (part = 'markup')}>{'\t<button onClick={() => count++}>Count {count}</button>'}</button>
						<span class="line plain" aria-hidden="true">{'}'}</span>
					</div>
				</div>
				<BrowserFrame address="my-app.dev">
					<div class="page">
						<span class="whole">
							<button type="button" class="count" onClick={() => clicks++}>
								<span class="words">Count</span> <span class="num">{clicks}</span>
							</button>
						</span>
					</div>
				</BrowserFrame>
			</div>
		</Stage>
		<Watch>
			<span class="said" hidden={part !== 'import'}>
				<Mono>import</Mono> makes no part of the button. It brings in <Mono>state</Mono> for the line below.
			</span>
			<span class="said" hidden={part !== 'body'}>
				The function is the whole component. Its body ran once, to set up this button.
			</span>
			<span class="said" hidden={part !== 'state'}>
				<Mono>let count = state(0)</Mono> made the number. It started at 0, and it reads {clicks} now.
			</span>
			<span class="said" hidden={part !== 'markup'}>
				The markup made the button and its words. Its click runs <Mono>count++</Mono>, and <Mono>{'{count}'}</Mono> shows the number.
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto;
				gap: 1.5em;
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
				display: grid;
				padding: 0.5em 0;
				overflow-x: auto;
				font-family: var(--font-mono);
				font-size: 0.8em;
				line-height: 1.6;
				tab-size: 2;
			}

			.line {
				display: block;
				box-sizing: border-box;
				width: 100%;
				min-height: 1lh;
				margin: 0;
				padding: 0 0.85em 0 calc(0.85em + 4ch);
				text-indent: -4ch;
				border: 0;
				border-radius: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				line-height: inherit;
				text-align: start;
				white-space: pre-wrap;
				transition: background 140ms ease;
			}

			button.line {
				cursor: pointer;
			}

			button.line:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			button.line[aria-pressed='true'] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			button.line:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -2px;
			}

			.page {
				display: grid;
				padding: 0.9em 1em 1em;
				gap: 0.5em;
				justify-items: center;
			}

			.whole {
				padding: 0.6em;
				border: 1px dashed transparent;
				border-radius: 10px;
				transition: border-color 140ms ease;
			}

			.board[data-part='body'] .whole {
				border-color: var(--ink);
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

			.words,
			.num {
				padding: 0 0.15em;
				border-radius: 3px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				transition: background 140ms ease;
			}

			.board[data-part='state'] .num,
			.board[data-part='markup'] .words,
			.board[data-part='markup'] .num {
				background: var(--mark);
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.line,
				.whole,
				.count,
				.words,
				.num {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
