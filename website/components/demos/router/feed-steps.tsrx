import { state } from '@markless/core';

// An illustration of one streamed response, not a measurement.
export default function FeedSteps() @{
	let step = state(0);
	let fast = state(false);

	<section class="explorer">
		<style>
			.screen {
				padding: var(--space-xs) var(--space-s);
				border: 2px dashed var(--ink);
				background: var(--paper);
				min-height: 5.5em;
			}

			.screen p {
				margin: 0;
			}

			.title {
				font-weight: 700;
			}

			.pick {
				color: var(--ink);
			}

			.pick[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
			}
		</style>
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={fast ? 'false' : 'true'} onClick={() => { fast = false; step = 0; }}>
				Slow data
			</button>
			<button type="button" class="pick" aria-pressed={fast ? 'true' : 'false'} onClick={() => { fast = true; step = 0; }}>
				Quick data
			</button>
		</div>
		<div class="screen">
			<p class="title">{step === 0 ? '' : 'Feed'}</p>
			<p>
				{step === 0
					? ''
					: fast || step === 2
						? 'Loaded for /feed'
						: 'Loading...'}
			</p>
		</div>
		<div class="playground-controls">
			<button type="button" onClick={() => (step = fast ? Math.min(step + 1, 1) : Math.min(step + 1, 2))}>
				Next part
			</button>
			<button type="button" class="pick" onClick={() => (step = 0)}>
				Start over
			</button>
		</div>
		<p class="explorer-note">
			{step === 0
				? 'The browser asked for /feed. Nothing has arrived yet.'
				: fast
					? 'The data was ready in time, so it came in the first part. Loading... was never sent, and the response ends.'
					: step === 1
						? 'The first part arrives: the heading and the @pending content. The response stays open.'
						: 'The same response sends the @try content. The page puts it in place, and the response ends.'}
		</p>
	</section>
}
