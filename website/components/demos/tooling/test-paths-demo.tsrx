import { state } from '@markless/core';
import BrowserFrame from '../../docs/browser-frame.tsrx';
import PreviewCard, { Action, Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

// The Count button is a drawing of Counter.tsrx; Next stands in for the test's own click.
export default function TestPathsDemo() @{
	let mode = state('render');
	let step = state(1);

	<PreviewCard name="test-paths" label="Two ways a test reaches the same counter">
		<Controls>
			<Choice
				label="Way in"
				hint="render() mounts Counter in the browser page. renderSSR() renders it to HTML on the test server first."
				options={['render', 'renderSSR']}
				value="render"
				onChange={(next: string) => {
					mode = next;
					step = 1;
				}}
			/>
			<span class="steps">
				<Action disabled={step === 1} onClick={() => (step = step - 1)}>Back</Action>
				<Action disabled={step === 4} onClick={() => (step = step + 1)}>Next</Action>
				<span class="count">Step {step} of 4</span>
			</span>
		</Controls>
		<Stage>
			<div class="board" data-step={step}>
				<ol class="list">
					<li class="s1">{mode === 'render' ? 'Mount Counter in the browser page.' : 'Render Counter to HTML on the test server.'}</li>
					<li class="s2">Click the button.</li>
					<li class="s3">Wait until it reads Count 1.</li>
					<li class="s4">Remove the counter.</li>
				</ol>
				<BrowserFrame address="localhost:63315">
					<div class="screen">
						<span class="count-button">Count {step >= 2 ? 1 : 0}</span>
						<span class="gone">empty</span>
					</div>
				</BrowserFrame>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{step === 1
					? mode === 'render'
						? 'The test mounts Counter in its browser page. The component runs once, there.'
						: 'The test server renders Counter to HTML. The browser page shows that HTML.'
					: step === 2
						? 'The test clicks the button, and the click code runs.'
						: step === 3
							? 'expect.poll waits until the button reads Count 1.'
							: 'The test ends, and the package removes the counter.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.steps {
				display: inline-flex;
				gap: 0.6em;
				align-items: center;
				margin-inline-start: auto;
			}

			.count {
				color: var(--ink);
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
				gap: 1.5em;
				align-items: center;
				width: min(34rem, 100%);
			}

			.list {
				display: grid;
				gap: 0.4em;
				margin: 0;
				padding: 0 0 0 1.6em;
			}

			.list li {
				margin: 0;
				padding: 0.3em 0.6em;
				border-radius: 6px;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				transition: background 140ms ease;
			}

			.board[data-step='1'] :is(.s2, .s3, .s4),
			.board[data-step='2'] :is(.s3, .s4),
			.board[data-step='3'] .s4 {
				color: var(--muted-ink);
			}

			.board[data-step='1'] .s1,
			.board[data-step='2'] .s2,
			.board[data-step='3'] .s3,
			.board[data-step='4'] .s4 {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}



			.screen {
				display: grid;
				place-items: center;
				min-height: 5.5em;
				padding: 0.85em;
			}

			.count-button {
				padding: 0.5em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			.board[data-step='2'] .count-button {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board[data-step='3'] .count-button {
				background: var(--mark);
			}

			.gone {
				display: none;
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.board[data-step='4'] .count-button {
				display: none;
			}

			.board[data-step='4'] .gone {
				display: inline;
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}

				.steps {
					margin-inline-start: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.list li {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
