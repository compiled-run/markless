import { state } from '@markless/core';
import PreviewCard, { Action, Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

// An illustration of one streamed response, not a measurement.
export default function FeedSteps() @{
	let step = state(1);
	let fast = state(false);

	<PreviewCard name="feed-steps" label="One page response in parts">
		<Controls>
			<Choice
				label="Data"
				hint="Slow data misses the first part. Quick data is ready in time for it."
				options={['slow', 'quick']}
				value="slow"
				onChange={(next: string) => {
					fast = next === 'quick';
					step = 1;
				}}
			/>
			<span class="steps">
				<Action disabled={step === 1} onClick={() => (step = 1)}>Back</Action>
				<Action disabled={fast || step === 2} onClick={() => (step = 2)}>Next</Action>
				<span class="count">Part {step} of {fast ? 1 : 2}</span>
			</span>
		</Controls>
		<Stage>
			<div class="board" data-fast={fast ? 'yes' : 'no'} data-step={step}>
				<div class="box">
					<div class="head">/feed</div>
					<div class="screen">
						<span class="title">Feed</span>
						<span class="text">{fast || step === 2 ? 'Loaded for /feed' : 'Loading...'}</span>
					</div>
				</div>
				<div class="response">
					<span class="label">one response</span>
					<div class="part one">
						<span class="name">Part 1</span>
						<Mono>{'<h1>Feed</h1>'}</Mono>
						<Mono><span>{fast ? '<p>Loaded for /feed</p>' : '<p>Loading...</p>'}</span></Mono>
					</div>
					<div class="part two">
						<span class="name">Part 2</span>
						<Mono>{'<p>Loaded for /feed</p>'}</Mono>
					</div>
					<span class="end">{fast || step === 2 ? 'The response ends.' : 'The response stays open.'}</span>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{fast
					? 'The data was ready in time, so it came in the first part. Loading... was never sent.'
					: step === 1
						? 'The first part arrives: the heading and the @pending content.'
						: 'The same response sends the @try content. The page puts it in place.'}
			</span>
		</Watch>
		<style>
			.part code span {
				font-family: var(--font-mono);
			}

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
				grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
				gap: 1.5em;
				align-items: center;
				width: min(32rem, 100%);
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

			.screen {
				display: grid;
				gap: 0.3em;
				padding: 0.9em 0.85em 1.1em;
			}

			.title {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-1);
				font-weight: 700;
			}

			.text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.response {
				display: grid;
				gap: 0.6em;
				min-width: 0;
			}

			.label,
			.end {
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.part {
				display: grid;
				gap: 0.15em;
				padding: 0.55em 0.85em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-size: 0.92em;
				overflow-wrap: anywhere;
				transition: background 140ms ease;
			}

			.name {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 700;
			}

			.board[data-step='1'] .one,
			.board[data-step='2'] .two {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board[data-fast='no'][data-step='1'] .two {
				border-style: dashed;
				color: var(--muted-ink);
			}

			.board[data-fast='yes'] .two {
				display: none;
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
				.part {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
