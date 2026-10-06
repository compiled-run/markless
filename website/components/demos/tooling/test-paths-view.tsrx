import { state } from '@markless/core';

// The button at the bottom is Counter.tsrx's own markup; the Step button stands in for the test's click.
export default function TestPathsView() @{
	let mode = state('browser');
	let progress = state(0);
	let tally = state(0);

	<section class="explorer">
		<div class="playground-controls">
			<button
				type="button"
				class="pick"
				aria-pressed={mode === 'browser' ? 'true' : 'false'}
				onClick={() => {
					mode = 'browser';
					progress = 0;
					tally = 0;
				}}
			>
				render(Counter)
			</button>
			<button
				type="button"
				class="pick"
				aria-pressed={mode === 'server' ? 'true' : 'false'}
				onClick={() => {
					mode = 'server';
					progress = 0;
					tally = 0;
				}}
			>
				renderSSR(Counter)
			</button>
		</div>
		<ol class="steps">
			<li class={progress >= 1 ? 'done' : ''}>
				{mode === 'browser'
					? 'The test mounts Counter in its browser page. The component runs once, there.'
					: 'The test server renders Counter to HTML. The browser page shows that HTML.'}
			</li>
			<li class={progress >= 2 ? 'done' : ''}>
				The test clicks the button, and the click code runs.
			</li>
			<li class={progress >= 3 ? 'done' : ''}>
				expect.poll waits until the button reads Count 1.
			</li>
			<li class={progress >= 4 ? 'done' : ''}>
				The test ends, and the package removes the counter.
			</li>
		</ol>
		<div class="playground-controls">
			<button
				type="button"
				onClick={() => {
					if (progress >= 4) {
						progress = 0;
						tally = 0;
						return;
					}
					progress++;
					if (progress === 2) tally++;
				}}
			>
				{progress >= 4 ? 'Start again' : 'Step'}
			</button>
		</div>
		<div class={progress >= 1 && progress < 4 ? 'stage' : 'stage empty'}>
			<button type="button" class="counter" onClick={() => tally++}>
				Count {tally}
			</button>
		</div>

		<style>
			.pick {
				color: var(--ink);
			}

			button[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.steps {
				margin: 0;
				padding-left: 1.4em;
			}

			.steps li {
				opacity: 0.45;
			}

			.steps li.done {
				opacity: 1;
			}

			.stage {
				padding: var(--space-xs);
				border: 2px dashed var(--code-edge);
			}

			.stage.empty .counter {
				visibility: hidden;
			}
		</style>
	</section>;
}
