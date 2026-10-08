import { state } from '@markless/core';
import TerminalFrame from '../../docs/terminal-frame.tsrx';
import PreviewCard, { Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

// Text bindings rather than a record lookup: a computed that reads a plain object
// is not in the chunk the click runs.
export default function CiModes() @{
	let mode = state('--fast');

	<PreviewCard name="ci-modes" label="Which CI jobs each mode runs">
		<Controls title="Which jobs run?">
			<Choice
				label="Mode"
				hint="--fast and --full are flags for pnpm ci:local. CI only means the jobs that run after you push."
				options={['--fast', '--full', 'CI only']}
				value="--fast"
				onChange={(next: string) => (mode = next)}
			/>
		</Controls>
		<Stage>
			<div class="board" data-mode={mode === '--fast' ? 'fast' : mode === '--full' ? 'full' : 'ci'}>
				<TerminalFrame title="my-app">
					<div class="command">
						<span class="prompt">$</span>
						{mode === '--fast' ? 'pnpm ci:local --fast' : mode === '--full' ? 'pnpm ci:local --full' : 'git push'}
					</div>
				</TerminalFrame>
				<div class="job fast">
					<span class="state">{mode === 'CI only' ? 'Also on your machine' : 'Runs'}</span>
					<span class="names">agent-files, typecheck, unit</span>
				</div>
				<div class="job full">
					<span class="state">{mode === '--full' ? 'Runs' : mode === '--fast' ? 'Skipped' : 'Also on your machine'}</span>
					<span class="names">browser, completion-matrix, boxes-bundler, boxes-router, boxes-music-player, boxes-music-player-ssr, receipts, package-manager-matrix</span>
				</div>
				<div class="job bench">
					<span class="state">{mode === 'CI only' ? 'Only on CI' : 'Never here'}</span>
					<span class="names">benchmark, benchmark-guard</span>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{mode === '--fast'
					? 'Three jobs. This is the default, so plain pnpm ci:local runs the same three.'
					: mode === '--full'
						? 'Eleven jobs. A job whose tools are missing is skipped with a note.'
						: 'CI runs on pull requests and on pushes to main. The benchmark jobs run only when the changes job says a benchmark can be affected.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				gap: 0.6em;
				width: min(34rem, 100%);
			}

			.command {
				font-family: var(--font-mono);
			}

			.prompt {
				margin-inline-end: 0.5em;
				color: color-mix(in srgb, var(--slab-ink) 60%, var(--slab));
				font-family: var(--font-mono);
			}

			.job {
				display: grid;
				grid-template-columns: 9.5em minmax(0, 1fr);
				gap: 0.3em 1em;
				align-items: baseline;
				padding: 0.55em 0.85em;
				border: 1px dashed var(--pg-edge);
				border-radius: 6px;
				background: var(--paper);
				color: var(--muted-ink);
				transition: background 140ms ease;
			}

			.state {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 700;
			}

			.names {
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.5;
				overflow-wrap: anywhere;
			}

			.board[data-mode='fast'] .fast,
			.board[data-mode='full'] :is(.fast, .full),
			.board[data-mode='ci'] :is(.fast, .full, .bench) {
				border: 1px solid var(--ink);
				color: var(--ink);
			}

			.board[data-mode='fast'] .fast,
			.board[data-mode='full'] :is(.fast, .full),
			.board[data-mode='ci'] .bench {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			@media (max-width: 40rem) {
				.job {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.job {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
