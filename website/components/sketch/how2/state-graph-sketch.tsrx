import { computed, state } from '@markless/core';
import PreviewCard, { Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function StateGraphSketch() @{
	let count = state(2);
	let label = state('Mugs');
	const doubled = computed(() => count * 2);
	let last = state('none');

	<PreviewCard name="state-graph" label="What one write wakes in the state graph">
		<Controls title="What does one write wake?" />
		<Stage>
			<div class="board" data-last={last}>
				<div class="writes" role="group" aria-label="Try a write">
					<span class="try">Try a write:</span>
					<button
						type="button"
						class="write"
						aria-pressed={last === 'count' ? 'true' : 'false'}
						onClick={() => {
							count++;
							last = 'count';
						}}
					>
						count++
					</button>
					<button
						type="button"
						class="write"
						aria-pressed={last === 'label' ? 'true' : 'false'}
						onClick={() => {
							label = label === 'Mugs' ? 'Cups' : 'Mugs';
							last = 'label';
						}}
					>
						{label === 'Mugs' ? "label = 'Cups'" : "label = 'Mugs'"}
					</button>
					<button
						type="button"
						class="write"
						aria-pressed={last === 'same' ? 'true' : 'false'}
						onClick={() => {
							// oxlint-disable-next-line no-self-assign -- the figure writes the same value on purpose
							count = count;
							last = 'same';
						}}
					>
						count = {count}
					</button>
				</div>
				<div class="graph">
					<p class="head">The graph</p>
					<span></span>
					<p class="head">Your page</p>

					<span class="node on-label">state:label</span>
					<span class="wire on-label" aria-hidden="true"></span>
					<span class="slot on-label"><b>{label}</b></span>

					<span class="node on-count same">state:count</span>
					<span class="wire on-count" aria-hidden="true"></span>
					<span class="slot on-count">count {count}</span>

					<span class="node on-count derived">computed:doubled</span>
					<span class="wire on-count" aria-hidden="true"></span>
					<span class="slot on-count">doubled {doubled}</span>
				</div>

				<div class="journal">
					<p class="head">Journal for this flush</p>
					<ul class="entries">
						<li hidden={last !== 'none'}>nothing written yet</li>
						<li hidden={last !== 'count'}><code>setText</code> count → {'"' + count + '"'}</li>
						<li hidden={last !== 'count'}><code>setText</code> doubled → {'"' + doubled + '"'}</li>
						<li hidden={last !== 'label'}><code>setText</code> heading → {'"' + label + '"'}</li>
						<li hidden={last !== 'same'}>empty: no flush ran</li>
					</ul>
				</div>
			</div>
		</Stage>
		<Watch>
			<span>{last === 'count'
				? 'count changed, so doubled went stale and recomputed. Two text nodes changed. The label wire stayed dark.'
				: last === 'label'
					? 'label changed. Only the heading reads it, so count and doubled stayed asleep.'
					: last === 'same'
						? 'Same value. The graph sees no change, marks nothing dirty and runs no flush.'
						: 'Try a write. Only the wires that read the written state light up.'}</span>
		</Watch>
		<style>
			.writes {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em;
				align-items: center;
			}

			.try {
				margin-inline-end: 0.2em;
				color: var(--ink);
			}

			.write {
				padding: 0.35em 0.75em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.9em;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.write:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.write[aria-pressed='true'] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.write:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.board {
				display: grid;
				gap: 1.4em;
				width: min(34rem, 100%);
			}

			.graph {
				display: grid;
				grid-template-columns: max-content minmax(2rem, 1fr) minmax(7.5rem, max-content);
				gap: 1.1em 0;
				align-items: center;
			}

			.head {
				margin: 0;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.node,
			.slot {
				position: relative;
				padding: 0.45em 0.8em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				transition: background 140ms ease;
			}

			.node {
				font-family: var(--font-mono);
				font-size: 0.9em;
				text-align: center;
			}

			.slot {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.wire {
				height: 0;
				border-block-start: 1.5px dashed var(--ink);
			}

			.derived::before {
				position: absolute;
				inset-block-end: 100%;
				inset-inline-start: 50%;
				height: 1.1em;
				border-inline-start: 1.5px dashed var(--ink);
				content: '';
			}

			.board[data-last='count'] .on-count:is(.node, .slot),
			.board[data-last='label'] .on-label:is(.node, .slot) {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board[data-last='count'] .wire.on-count,
			.board[data-last='label'] .wire.on-label {
				border-block-start: 2.5px solid var(--ink);
			}

			.board[data-last='count'] .derived::before {
				border-inline-start: 2.5px solid var(--ink);
			}

			.board[data-last='same'] .node.same {
				background: var(--mark);
				color: var(--on-mark);
			}

			.journal {
				padding: 0.7em 0.9em;
				border: 1px solid var(--ink);
				border-radius: 6px;
			}

			.entries {
				display: grid;
				gap: 0.2em;
				margin: 0.35em 0 0;
				padding: 0;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.9em;
				list-style: none;
			}

			.entries li[hidden] {
				display: none;
			}

			.entries code {
				padding: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-weight: 700;
			}

			@media (max-width: 480px) {
				.graph {
					grid-template-columns: max-content minmax(1rem, 1fr) minmax(0, max-content);
				}

				.node,
				.slot {
					padding: 0.4em 0.5em;
					font-size: 0.82em;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.node,
				.slot,
				.write {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
