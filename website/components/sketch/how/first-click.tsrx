import { state } from '@markless/core';
import PreviewCard, { Action, Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function FirstClick() @{
	let path = state('Direct');
	let clicks = state(0);
	let hovered = state(false);

	<PreviewCard name="first-click" label="What starts on the first click, per path">
		<Controls title="Who hears the first click?">
			<Choice
				label="Path"
				hint="Direct: render() with a direct browser module. General: render() on the general path. Server: a server-rendered page. The button is real; the list traces the path you pick."
				options={['Direct', 'General', 'Server']}
				value="Direct"
				onChange={(next: string) => {
					path = next;
					clicks = 0;
					hovered = false;
				}}
			/>
			<Action
				end
				onClick={() => {
					clicks = 0;
					hovered = false;
				}}
			>
				Start over
			</Action>
		</Controls>
		<Stage>
			<div class="board" data-path={path} data-clicks={clicks === 0 ? 'none' : clicks === 1 ? 'one' : 'more'} data-hovered={hovered ? 'yes' : 'no'}>
				<div class="page">
					<p class="cap">Your page</p>
					<div class="container">
						<p class="who">
							{path === 'Direct'
								? 'listener: on the button itself'
								: path === 'General'
									? 'listener: on the container'
									: 'listener: the inline resumer, on the container'}
						</p>
						<button type="button" class="live" onMouseenter={() => (hovered = true)} onFocus={() => (hovered = true)} onClick={() => clicks++}>
							Count {clicks}
						</button>
					</div>
				</div>

				<div class="started">
					<p class="cap">What has started</p>
					<ul class="rows" hidden={path !== 'Direct'}>
						<li class="row on"><span>click listener on the button</span><b class="chip">at mount</b></li>
						<li class={clicks > 0 ? 'row on' : 'row'}><span><code>symbol:0</code> imported, then kept</span><b class="chip">{clicks > 0 ? 'first click' : 'not yet'}</b></li>
						<li class={clicks > 0 ? 'row on' : 'row'}><span><code>count++</code> on the small <code>Map</code> graph</span><b class="chip">{clicks > 0 ? '×' + clicks : 'not yet'}</b></li>
						<li class={clicks > 0 ? 'row on' : 'row'}><span>changed text slots written</span><b class="chip">{clicks > 0 ? '×' + clicks : 'not yet'}</b></li>
						<li class="row never"><span>full runtime</span><b class="chip">never</b></li>
					</ul>
					<ul class="rows" hidden={path !== 'General'}>
						<li class="row on"><span>one listener per event name, on the container</span><b class="chip">at mount</b></li>
						<li class={hovered || clicks > 0 ? 'row on' : 'row'}><span><code>symbol:0</code> fetched</span><b class="chip">{hovered ? 'on hover' : clicks > 0 ? 'first click' : 'not yet'}</b></li>
						<li class={clicks > 0 ? 'row on' : 'row'}><span>state graph built, full runtime started</span><b class="chip">{clicks > 0 ? 'first click' : 'not yet'}</b></li>
						<li class={clicks > 0 ? 'row on' : 'row'}><span><code>symbol:0</code> ran <code>count++</code></span><b class="chip">{clicks > 0 ? '×' + clicks : 'not yet'}</b></li>
						<li class="row never"><span>the component body, again</span><b class="chip">never</b></li>
					</ul>
					<ul class="rows" hidden={path !== 'Server'}>
						<li class="row on"><span>inline resumer listening on the container</span><b class="chip">at load</b></li>
						<li class={hovered || clicks > 0 ? 'row on' : 'row'}><span>resume module imported</span><b class="chip">{hovered ? 'on hover' : clicks > 0 ? 'first click' : 'not yet'}</b></li>
						<li class={clicks > 0 ? 'row on' : 'row'}><span>specialized code ran <code>count++</code></span><b class="chip">{clicks > 0 ? '×' + clicks : 'not yet'}</b></li>
						<li class="row never"><span>full runtime, for this counter</span><b class="chip">never</b></li>
						<li class="row never"><span>the component body, in the browser</span><b class="chip">never</b></li>
					</ul>
				</div>
			</div>
		</Stage>
		<Watch>
			<span>{clicks > 1
				? path === 'Direct'
					? 'Next press: no import. symbol:0 is already kept, so it just runs.'
					: path === 'General'
						? 'Next press: the runtime is already running, so symbol:0 just runs.'
						: 'Next press: the resume module is already imported, so the code just runs.'
				: clicks === 1
					? path === 'Direct'
						? "First click: the button's own listener imported symbol:0, ran it, and wrote Count 1."
						: path === 'General'
							? 'First click: the container listener found h0 + click, built the graph, started the runtime and ran symbol:0.'
							: 'First click: the resumer matched h0 + click and passed it to the resume module, which ran the specialized code.'
					: hovered
						? path === 'Direct'
							? 'Hover: nothing starts. The direct module waits for the click.'
							: path === 'General'
								? 'Hover: symbol:0 was fetched before the press. It has not run.'
								: 'Hover: the resume module was imported before the press. No click code has run.'
						: path === 'Direct'
							? 'Mount: render() cloned the button and put a click listener on it. No click code has run.'
							: path === 'General'
								? 'Mount: Markless built the DOM and kept the records in memory. No click code has run.'
								: 'Load: the server sent the HTML and records. The browser never runs the component body.'}</span>
		</Watch>
		<style>
			.board {
				display: grid;
				grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
				gap: 1.4em;
				align-items: center;
				width: min(42rem, 100%);
			}

			.cap {
				margin: 0 0 0.5em;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.page {
				padding: 0.75em;
				border: 1px solid var(--ink);
				border-radius: 6px;
			}

			.container {
				display: grid;
				justify-items: center;
				gap: 0.6em;
				padding: 0.7em 0.6em 0.9em;
				border: 1.5px solid transparent;
				border-radius: 6px;
			}

			.board:not([data-path='Direct']) .container {
				border-color: var(--ink);
				border-style: dashed;
			}

			.who {
				margin: 0;
				color: var(--ink);
				font-size: var(--step--2);
				text-align: center;
			}

			.live {
				padding: 0.5em 1.1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.board[data-path='Direct'] .live {
				border: 1.5px dashed var(--ink);
			}

			.live:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.live:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.live:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.rows {
				display: grid;
				gap: 0.35em;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.rows[hidden] {
				display: none;
			}

			.row {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				padding: 0.3em 0.3em 0.3em 0.6em;
				border-radius: 6px;
				color: var(--ink);
				line-height: 1.35;
			}

			.row code {
				padding: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-size: 0.9em;
			}

			.chip {
				flex: none;
				min-width: 5.5em;
				padding: 0.1em 0.5em;
				border: 1px dashed var(--ink);
				border-radius: 6px;
				font-size: var(--step--2);
				font-weight: 400;
				text-align: center;
				transition: background 140ms ease;
			}

			.row.on .chip {
				border-style: solid;
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				font-weight: 700;
			}

			.row.never .chip {
				border-style: solid;
				text-decoration: line-through;
			}

			@media (max-width: 640px) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.live,
				.chip {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
