import { state } from '@markless/core';
import PreviewCard, { Action, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function LazyLanesSketch() @{
	let likes = state(0);
	let saves = state(0);
	let last = state('load');

	<PreviewCard name="lazy-lanes" label="What downloads at load and what runs on click">
		<Controls title="Downloaded early, run on click">
			<Action
				end
				onClick={() => {
					likes = 0;
					saves = 0;
					last = 'load';
				}}
			>
				Load the page again
			</Action>
		</Controls>
		<Stage>
			<div class="board">
				<div class="page">
					<p class="cap">Your page</p>
					<div class="buttons">
						<button
							type="button"
							class="live"
							onClick={() => {
								likes++;
								last = 'like';
							}}
						>
							Like {likes}
						</button>
						<button
							type="button"
							class="live"
							onClick={() => {
								saves++;
								last = 'save';
							}}
						>
							Save {saves}
						</button>
					</div>
				</div>

				<table class="symbols">
					<thead>
						<tr>
							<th scope="col">Symbol</th>
							<th scope="col">Downloaded</th>
							<th scope="col">Ran</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Like click handler</td>
							<td><span class="chip got">at load</span></td>
							<td><span class={likes > 0 ? 'chip ran' : 'chip'}>{likes > 0 ? '×' + likes : 'not yet'}</span></td>
						</tr>
						<tr>
							<td>likes text update</td>
							<td><span class="chip got">at load</span></td>
							<td><span class={likes > 0 ? 'chip ran' : 'chip'}>{likes > 0 ? '×' + likes : 'not yet'}</span></td>
						</tr>
						<tr>
							<td>Save click handler</td>
							<td><span class="chip got">at load</span></td>
							<td><span class={saves > 0 ? 'chip ran' : 'chip'}>{saves > 0 ? '×' + saves : 'not yet'}</span></td>
						</tr>
						<tr>
							<td>saves text update</td>
							<td><span class="chip got">at load</span></td>
							<td><span class={saves > 0 ? 'chip ran' : 'chip'}>{saves > 0 ? '×' + saves : 'not yet'}</span></td>
						</tr>
					</tbody>
				</table>
			</div>
		</Stage>
		<Watch>
			<span>{last === 'like'
				? 'Like ran its handler, then the likes text update. Nothing new downloaded.'
				: last === 'save'
					? 'Save ran its handler, then the saves text update. Nothing new downloaded.'
					: 'Production page load: the first-use pack downloaded through modulepreload. No handler ran.'}</span>
		</Watch>
		<style>
			.board {
				display: grid;
				gap: 1.3em;
				justify-items: center;
				width: min(32rem, 100%);
			}

			.page {
				display: grid;
				justify-items: center;
				gap: 0.4em;
				padding: 0.75em 1.5em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
			}

			.cap {
				margin: 0;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.buttons {
				display: flex;
				gap: 0.7em;
			}

			.live {
				min-width: 5.5em;
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

			.symbols {
				width: 100%;
				margin: 0;
				border-collapse: collapse;
				color: var(--ink);
				font-size: var(--step--1);
			}

			.symbols th {
				padding: 0 0.6em 0.4em;
				border-block-end: 1px solid var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
				letter-spacing: normal;
				text-align: start;
				text-transform: none;
			}

			.symbols td {
				padding: 0.4em 0.6em;
				border-block-end: 1px solid var(--pg-edge);
			}

			.symbols tr:last-child td {
				border-block-end: 0;
			}

			.chip {
				display: inline-block;
				min-width: 4.5em;
				padding: 0.05em 0.5em;
				border: 1px dashed var(--ink);
				border-radius: 6px;
				font-size: var(--step--2);
				text-align: center;
				transition: background 140ms ease;
			}

			.chip.got {
				border-style: solid;
				background: var(--mark);
				color: var(--on-mark);
			}

			.chip.ran {
				border-style: solid;
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				font-weight: 700;
			}

			@media (max-width: 480px) {
				.symbols th,
				.symbols td {
					padding-inline: 0.3em;
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
