// Lines are the real renderToString() response for the counter, cut to fit; the full response is on the page.
import { state } from '@markless/core';
import PreviewCard, { Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function PayloadCard() @{
	let part = state('view');

	<PreviewCard name="payload-card" label="The server's HTML, line by line">
		<Controls title="Which element does each line serve?" />
		<Stage>
			<div class="board" data-part={part}>
				<div class="listing" role="group" aria-label="Lines of the server response">
					<button type="button" class="ln" data-line="link" aria-pressed={part === 'link' ? 'true' : 'false'} onMouseenter={() => (part = 'link')} onFocus={() => (part = 'link')} onClick={() => (part = 'link')}>
						{'<link rel="modulepreload" href="/build/chunk-…">'}
					</button>
					<button type="button" class="ln" data-line="early" aria-pressed={part === 'early' ? 'true' : 'false'} onMouseenter={() => (part = 'early')} onFocus={() => (part = 'early')} onClick={() => (part = 'early')}>
						{'<script>(function captureEarlyEvents…</script>'}
					</button>
					<button type="button" class="ln" data-line="container" aria-pressed={part === 'container' ? 'true' : 'false'} onMouseenter={() => (part = 'container')} onFocus={() => (part = 'container')} onClick={() => (part = 'container')}>
						{'<div data-async-container>'}
					</button>
					<button type="button" class="ln in" data-line="button" aria-pressed={part === 'button' ? 'true' : 'false'} onMouseenter={() => (part = 'button')} onFocus={() => (part = 'button')} onClick={() => (part = 'button')}>
						{'<button>Count 0</button>'}
					</button>
					<button type="button" class="ln in" data-line="state" aria-pressed={part === 'state' ? 'true' : 'false'} onMouseenter={() => (part = 'state')} onFocus={() => (part = 'state')} onClick={() => (part = 'state')}>
						{'<script type="markless/state">… "root":0 …'}
					</button>
					<button type="button" class="ln in" data-line="view" aria-pressed={part === 'view' ? 'true' : 'false'} onMouseenter={() => (part = 'view')} onFocus={() => (part = 'view')} onClick={() => (part = 'view')}>
						{'<script type="markless/view">… "h0" … "index":1 …'}
					</button>
					<button type="button" class="ln in" data-line="resumer" aria-pressed={part === 'resumer' ? 'true' : 'false'} onMouseenter={() => (part = 'resumer')} onFocus={() => (part = 'resumer')} onClick={() => (part = 'resumer')}>
						{'<script data-async-resumer …>'}
					</button>
					<span class="ln end">{'</div>'}</span>
				</div>

				<div class="shown">
					<p class="cap">What the browser shows</p>
					<div class="page">
						<p class="tag outside">{part === 'link' ? 'fetched early, not run' : 'outside the container'}</p>
						<div class="box">
							<p class="tag">container, element 0</p>
							<span class="btn">Count <span class="value">0</span></span>
							<p class="tag below">{part === 'state' ? 'state:count fills this text' : 'h0, element 1'}</p>
						</div>
					</div>
				</div>
			</div>
		</Stage>
		<Watch>
			<span>{part === 'link'
				? 'The link lets the browser fetch the resume module early. Fetching it does not run it. It belongs to no element.'
				: part === 'early'
					? 'This script records events that land inside the container while the document is still loading. The resumer replays them later.'
					: part === 'container'
						? 'The container marks the part of the page this render owns. The resumer counts it as element 0.'
						: part === 'button'
							? 'No onclick, no event attribute at all. The click lives only in the view record.'
							: part === 'state'
								? 'The state. "root":0 holds the number 0 itself, the value the button text shows.'
								: part === 'view'
									? 'Locator h0 is element 1 in document order: the button. A click on it runs symbol:0.'
									: 'The inline resumer listens on the container for the first interaction, then imports the resume module.'}</span>
		</Watch>
		<style>
			.board {
				display: grid;
				grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
				gap: 1.2em;
				align-items: center;
				width: min(42rem, 100%);
			}

			.listing {
				display: grid;
				padding: 0.5em 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
			}

			.ln {
				display: block;
				box-sizing: border-box;
				width: 100%;
				margin: 0;
				padding: 0.2em 0.85em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.8em;
				line-height: 1.6;
				text-align: start;
				overflow-wrap: anywhere;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.ln.in {
				padding-inline-start: 2.1em;
			}

			.ln.end {
				cursor: default;
			}

			.ln:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.ln[aria-pressed='true'] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.ln:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -3px;
			}

			.cap {
				margin: 0 0 0.5em;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.page {
				display: grid;
				gap: 0.5em;
				padding: 0.75em;
				border: 1px solid var(--ink);
				border-radius: 6px;
			}

			.box {
				display: grid;
				justify-items: center;
				gap: 0.45em;
				padding: 0.6em 0.75em 0.75em;
				border: 1.5px dashed var(--ink);
				border-radius: 6px;
				transition: background 140ms ease;
			}

			.tag {
				margin: 0;
				justify-self: start;
				color: var(--ink);
				font-size: var(--step--2);
			}

			.tag.below {
				justify-self: center;
			}

			.btn {
				padding: 0.45em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-size: var(--step-0);
				transition: background 140ms ease;
			}

			.value {
				border-radius: 3px;
				transition: background 140ms ease;
			}

			.board:is([data-part='early'], [data-part='container'], [data-part='resumer']) .box,
			.board:is([data-part='button'], [data-part='view']) .btn {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board[data-part='state'] .value {
				padding: 0 0.15em;
				background: var(--mark);
				color: var(--on-mark);
			}

			.board[data-part='link'] .tag.outside {
				padding: 0 0.3em;
				border-radius: 3px;
				background: var(--mark);
				color: var(--on-mark);
			}

			@media (max-width: 640px) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.ln,
				.box,
				.btn,
				.value {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
