// A layered default and one plain rule, both live on the tip beside Save.
import { state } from '@markless/core';
import PreviewCard, { Controls, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';

export default function LayerWins() @{
	let mine = state(false);

	<PreviewCard name="layer-wins" label="Your rule beats the layered default">
		<Controls title="Whose rule places the tip?">
			<Switch
				label="Your rule"
				hint="A plain .tip rule, outside any layer. A rule outside a layer beats every layered rule."
				onChange={(on: boolean) => (mine = on)}
			/>
		</Controls>
		<Stage>
			<div class="board" data-mine={mine ? 'on' : 'off'}>
				<div class="rules">
					<div class="box">
						<div class="head">@layer markless</div>
						<div class="code">
							<span class="line">{'[overlay] {'}</span>
							<span class="line">{'  position-area: '}<span class="old">block-start</span>;</span>
							<span class="line">{'}'}</span>
						</div>
					</div>
					<div class="box">
						<div class="head">your rule</div>
						<div class="code">
							<span class="line">{'.tip {'}</span>
							<span class="line">{'  position-area: '}<span class="new">inline-end</span>;</span>
							<span class="line">{'}'}</span>
						</div>
					</div>
				</div>
				<div class="spot">
					<span class="save">Save</span>
					<span class="tip">Keeps a copy in your drafts</span>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{mine
					? 'Your rule is on. It beats the layer, so the tip sits right of Save. No !important.'
					: 'Your rule is off. The layered default puts the tip above Save.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			@layer markless {
				.tip {
					position-area: block-start;
				}
			}

			.board[data-mine='on'] .tip {
				position-area: inline-end;
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
				gap: 1.5em;
				align-items: center;
				width: 100%;
			}

			.rules {
				display: grid;
				gap: 0.9em;
			}

			.box {
				box-sizing: border-box;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				transition: opacity 140ms ease;
			}

			.board[data-mine='off'] .box:last-child {
				border-style: dashed;
				color: var(--muted-ink);
			}

			.head {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.code {
				padding: 0.5em 0;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
			}

			.line {
				display: block;
				padding-inline: 0.85em;
				white-space: pre;
				font-family: var(--font-mono);
			}

			.old,
			.new {
				padding: 0 0.1em;
				border-radius: 3px;
				font-family: var(--font-mono);
			}

			.board[data-mine='off'] .old,
			.board[data-mine='on'] .new {
				background: var(--mark);
				color: var(--on-mark);
			}

			.board[data-mine='on'] .old {
				text-decoration: line-through;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 2px;
			}

			.spot {
				position: relative;
				display: grid;
				place-items: end start;
				padding: 0 0 2em 1.5em;
				min-height: 10em;
				anchor-scope: --layer-save;
			}

			.save {
				padding: 0.5em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				anchor-name: --layer-save;
			}

			.tip {
				position: absolute;
				position-anchor: --layer-save;
				width: max-content;
				max-width: 9em;
				margin: 0.45em;
				padding: 0.35em 0.65em;
				border-radius: 6px;
				background: var(--slab);
				box-shadow: 3px 3px 0 var(--pg-accent);
				color: var(--slab-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.3;
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.box {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
